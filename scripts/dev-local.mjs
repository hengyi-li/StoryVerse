import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const functionsEnvFile = resolve(cwd, process.env.STORYVERSE_FUNCTIONS_ENV_FILE || "supabase/functions/.env.local");

const statusResult = spawnSync("npx", ["supabase", "status", "-o", "json"], {
  cwd,
  encoding: "utf8",
});

if (statusResult.status !== 0) {
  process.stderr.write("无法读取本地 Supabase 状态。请先运行 npm run supabase:start。\n");
  process.exit(statusResult.status ?? 1);
}

const jsonStart = statusResult.stdout.indexOf("{");
const status = JSON.parse(statusResult.stdout.slice(jsonStart));
const supabaseUrl = String(status.API_URL ?? "");
const publishableKey = String(status.PUBLISHABLE_KEY ?? "");
const port = String(process.env.STORYVERSE_DEV_PORT ?? "4173");

if (!supabaseUrl.startsWith("http://127.0.0.1:") || !publishableKey) {
  process.stderr.write("为避免误操作线上数据，dev:local 只允许连接 127.0.0.1 的本地 Supabase。\n");
  process.exit(1);
}
if (!/^\d{4,5}$/.test(port)) {
  process.stderr.write("STORYVERSE_DEV_PORT 必须是 4–5 位端口号。\n");
  process.exit(1);
}

if (!existsSync(functionsEnvFile)) {
  process.stderr.write(`缺少 Edge Functions 环境文件：${functionsEnvFile}\n`);
  process.exit(1);
}

const edgeFunctions = spawn("npx", ["supabase", "functions", "serve", "--env-file", functionsEnvFile], {
  cwd,
  stdio: "inherit",
});

const vite = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", port], {
  cwd,
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  },
});

const children = [edgeFunctions, vite];
let stopping = false;

const stopAll = (signal, exitCode) => {
  if (stopping) return;
  stopping = true;

  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }

  setTimeout(() => process.exit(exitCode), 1_000);
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopAll(signal, signal === "SIGINT" ? 130 : 143));
}

for (const [name, child] of [
  ["本地 Edge Functions", edgeFunctions],
  ["Vite", vite],
]) {
  child.on("error", (error) => {
    process.stderr.write(`${name} 启动失败：${error.message}\n`);
    stopAll("SIGTERM", 1);
  });

  child.on("exit", (code, signal) => {
    if (stopping) return;
    const detail = signal ? `信号 ${signal}` : `退出码 ${code ?? 1}`;
    process.stderr.write(`${name} 意外停止（${detail}）。\n`);
    stopAll("SIGTERM", code ?? 1);
  });
}
