import { spawnSync } from "node:child_process";

const status = spawnSync("npx", ["supabase", "status", "-o", "json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: { ...process.env, DO_NOT_TRACK: "1" },
});

if (status.status !== 0) {
  process.stderr.write("浏览器 E2E 需要本地 Supabase。请先运行 npm run supabase:start。\n");
  process.stderr.write(status.stderr || status.stdout);
  process.exit(status.status ?? 1);
}

const start = status.stdout.indexOf("{");
const local = JSON.parse(status.stdout.slice(start));
const apiUrl = String(local.API_URL || "");
if (!apiUrl.startsWith("http://127.0.0.1:")) {
  process.stderr.write("为防止污染生产数据，浏览器 E2E 只允许连接本地 Supabase。\n");
  process.exit(1);
}

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    E2E_SUPABASE_URL: apiUrl,
    E2E_SUPABASE_PUBLISHABLE_KEY: String(local.PUBLISHABLE_KEY || local.ANON_KEY || ""),
    E2E_SUPABASE_SECRET_KEY: String(local.SECRET_KEY || local.SERVICE_ROLE_KEY || ""),
  },
});

process.exit(result.status ?? 1);
