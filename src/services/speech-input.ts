import type { Language } from "../types/domain";

export const MAX_SPEECH_DURATION_MS = 60_000;

export function shouldUseSystemDictation(coarsePointer: boolean, narrowViewport: boolean) {
  return coarsePointer || narrowViewport;
}

export type SpeechRecognitionHandle = {
  stop: () => Promise<string>;
  cancel: () => void;
};

export class SpeechRecognitionError extends Error {
  constructor(
    message: string,
    readonly kind: "permission" | "unsupported" | "network" | "empty",
  ) {
    super(message);
    this.name = "SpeechRecognitionError";
  }
}

interface RecognitionResultEvent extends Event {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface RecognitionErrorEvent extends Event {
  error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function recognitionConstructor() {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export async function startSpeechRecognition(language: Language): Promise<SpeechRecognitionHandle> {
  const Recognition = recognitionConstructor();
  if (!Recognition) {
    throw new SpeechRecognitionError("这个浏览器不支持语音输入，可以直接打字。", "unsupported");
  }

  const recognition = new Recognition();
  recognition.lang = language === "zh" ? "zh-CN" : "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  let text = "";
  let cancelled = false;
  let finished = false;
  let hasStarted = false;
  let resolveResult: (value: string) => void;
  let rejectResult: (error: SpeechRecognitionError) => void;

  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const started = new Promise<void>((resolve, reject) => {
    recognition.onstart = () => {
      hasStarted = true;
      resolve();
    };
    recognition.onerror = (event) => {
      const permission = event.error === "not-allowed" || event.error === "service-not-allowed";
      const error = new SpeechRecognitionError(
        permission
          ? "没有拿到麦克风权限。可以在浏览器地址栏右侧允许后重试。"
          : "语音识别暂时不可用，可以重试，也可以直接打字。",
        permission ? "permission" : "network",
      );
      if (!finished) {
        finished = true;
        if (hasStarted) rejectResult(error);
        else resolveResult("");
      }
      reject(error);
    };
  });

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (event.results[index].isFinal) text += event.results[index][0].transcript;
    }
  };
  recognition.onend = () => {
    if (finished) return;
    finished = true;
    const value = text.trim();
    if (cancelled) resolveResult("");
    else if (value) resolveResult(value);
    else rejectResult(new SpeechRecognitionError("这段录音里没有听到清晰的话，可以再录一次。", "empty"));
  };

  try {
    recognition.start();
    await started;
  } catch (error) {
    if (error instanceof SpeechRecognitionError) throw error;
    throw new SpeechRecognitionError("无法开始语音输入，可以直接打字。", "unsupported");
  }

  const autoStop = window.setTimeout(() => recognition.stop(), MAX_SPEECH_DURATION_MS);
  return {
    stop: async () => {
      window.clearTimeout(autoStop);
      if (!finished) recognition.stop();
      return result;
    },
    cancel: () => {
      cancelled = true;
      window.clearTimeout(autoStop);
      if (!finished) recognition.abort();
    },
  };
}
