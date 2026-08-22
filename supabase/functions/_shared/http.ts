export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const localOrigins = ["http://127.0.0.1:4173", "http://localhost:4173"];

export function allowedOrigins() {
  const configured = (Deno.env.get("FRONTEND_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...localOrigins, ...configured]);
}

export function isAllowedOrigin(origin: string | null) {
  return Boolean(origin && allowedOrigins().has(origin));
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-storyverse-monitor-token, x-storyverse-worker-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin!;
  return headers;
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function handleOptions(request: Request) {
  return request.method === "OPTIONS" ? new Response(null, { status: 204, headers: corsHeaders(request) }) : null;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "请求内容格式不正确。");
  }
}

export function errorResponse(request: Request, error: unknown) {
  if (error instanceof ApiError) return json(request, { error: error.message, code: error.code }, error.status);
  console.error(error);
  return json(request, { error: "服务暂时不可用，请稍后重试。", code: "INTERNAL_ERROR" }, 500);
}

export function serve(handler: (request: Request) => Promise<Response>) {
  Deno.serve(async (request) => {
    const options = handleOptions(request);
    if (options) return options;
    try {
      return await handler(request);
    } catch (error) {
      return errorResponse(request, error);
    }
  });
}
