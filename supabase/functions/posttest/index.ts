import { ApiError, json, readJson, serve } from "../_shared/http.ts";
import {
  normalizePosttestAnswers,
  POSTTEST_VERSION,
  requirePosttestAnswers,
  type PosttestAnswers,
  validatePosttestStep,
} from "../_shared/posttest.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

type PosttestInput = {
  action?: "save" | "submit" | "dismiss_reminder";
  step?: number;
  answers?: PosttestAnswers;
};

function responsePayload(eligible: boolean, row?: Record<string, unknown> | null) {
  if (!eligible) {
    return {
      required: false,
      status: "not_required",
      currentStep: 1,
      questionnaireVersion: POSTTEST_VERSION,
      answers: {},
      reminderDismissedAt: null,
      submittedAt: null,
    };
  }
  if (!row) {
    return {
      required: true,
      status: "not_started",
      currentStep: 1,
      questionnaireVersion: POSTTEST_VERSION,
      answers: {},
      reminderDismissedAt: null,
      submittedAt: null,
    };
  }
  return {
    required: true,
    status: String(row.status ?? "not_started"),
    currentStep: Number(row.current_step ?? 1),
    questionnaireVersion: String(row.questionnaire_version ?? POSTTEST_VERSION),
    answers: normalizePosttestAnswers(row.answers ?? {}),
    reminderDismissedAt: row.reminder_dismissed_at ?? null,
    submittedAt: row.submitted_at ?? null,
  };
}

serve(async (request) => {
  const { user } = await requireUser(request);
  const admin = adminClient();
  const [{ data: profile, error: profileError }, { data: pretest, error: pretestError }] = await Promise.all([
    admin.from("profiles").select("id,role,pretest_required").eq("id", user.id).single(),
    admin.from("pretest_responses").select("status,questionnaire_version").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profileError || !profile) throw profileError ?? new Error("Profile not found");
  if (pretestError) throw pretestError;
  const eligible =
    profile.role === "user" &&
    profile.pretest_required === true &&
    pretest?.status === "completed" &&
    pretest.questionnaire_version === "pretest_v1";

  const { data: existing, error: responseError } = await admin
    .from("posttest_responses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (responseError) throw responseError;

  if (request.method === "GET") return json(request, responsePayload(eligible, existing));
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方式。");
  if (!eligible) {
    throw new ApiError(
      409,
      "POSTTEST_NOT_REQUIRED",
      "此账号不需要填写后测。 / This account does not require the post-study questionnaire.",
    );
  }

  const input = await readJson<PosttestInput>(request);
  if (!input.action || !["save", "submit", "dismiss_reminder"].includes(input.action)) {
    throw new ApiError(400, "INVALID_POSTTEST_ACTION", "问卷操作不正确。 / Invalid post-study action.");
  }
  if (existing?.status === "completed") {
    if (input.action === "submit" || input.action === "dismiss_reminder") {
      return json(request, responsePayload(true, existing));
    }
    throw new ApiError(409, "POSTTEST_LOCKED", "后测结果已锁定。 / This post-study response is locked.");
  }

  if (input.action === "dismiss_reminder") {
    const { data, error } = await admin
      .from("posttest_responses")
      .upsert(
        {
          user_id: user.id,
          status: existing?.status ?? "not_started",
          questionnaire_version: POSTTEST_VERSION,
          current_step: existing?.current_step ?? 1,
          answers: existing?.answers ?? {},
          reminder_dismissed_at: existing?.reminder_dismissed_at ?? new Date().toISOString(),
          submitted_at: null,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return json(request, responsePayload(true, data));
  }

  const requestedStep = validatePosttestStep(input.step ?? (input.action === "submit" ? 5 : 0));
  const availableStep = Number(existing?.current_step ?? 1);
  if (requestedStep > availableStep) {
    throw new ApiError(409, "POSTTEST_STEP_OUT_OF_ORDER", "请按顺序完成问卷。 / Complete the questionnaire in order.");
  }
  const existingAnswers = normalizePosttestAnswers(existing?.answers ?? {});
  const incomingAnswers = normalizePosttestAnswers(input.answers ?? {});
  const answers = requirePosttestAnswers({ ...existingAnswers, ...incomingAnswers }, requestedStep);
  const terminal = input.action === "submit";
  if (terminal) requirePosttestAnswers(answers, 5);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("posttest_responses")
    .upsert(
      {
        user_id: user.id,
        status: terminal ? "completed" : "in_progress",
        questionnaire_version: POSTTEST_VERSION,
        current_step: terminal ? 5 : Math.max(availableStep, Math.min(5, requestedStep + 1)),
        answers,
        reminder_dismissed_at: existing?.reminder_dismissed_at ?? now,
        submitted_at: terminal ? now : null,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return json(request, responsePayload(true, data));
});
