import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { loadEnv } from "vite";

const distDirectory = new URL("../dist/", import.meta.url);
const fileEnvironment = loadEnv("production", process.cwd(), "");
const environment = { ...fileEnvironment, ...process.env };
const requiredUrl = String(environment.VITE_SUPABASE_URL ?? "").trim();
const publishableKey = String(environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const basePath = String(environment.VITE_BASE_PATH ?? "/").trim();

function fail(message) {
  throw new Error(`CloudBase build verification failed: ${message}`);
}

if (basePath !== "/") fail("VITE_BASE_PATH must be / for the CloudBase root deployment.");
if (!requiredUrl) fail("VITE_SUPABASE_URL is missing.");
const parsedUrl = new URL(requiredUrl);
if (parsedUrl.protocol !== "https:") fail("VITE_SUPABASE_URL must use HTTPS.");
if (!publishableKey) fail("VITE_SUPABASE_PUBLISHABLE_KEY is missing.");
if (!publishableKey.startsWith("sb_publishable_") && publishableKey.split(".").length !== 3) {
  fail("VITE_SUPABASE_PUBLISHABLE_KEY is not a publishable/legacy anon key.");
}

const indexHtml = await readFile(new URL("index.html", distDirectory), "utf8");
if (indexHtml.includes("/StoryVerse/")) fail("index.html still contains the GitHub Pages base path.");
if (!/["']\/assets\//.test(indexHtml)) fail("index.html does not reference root-level hashed assets.");

const expectedRouteNames = [
  "StoryStart",
  "StoryWrite",
  "StoryAnalyzing",
  "StoryPage",
  "Resonance",
  "Recommendations",
  "StarLobby",
  "Admin",
];
for (const routeName of expectedRouteNames) {
  const routeIndex = await readFile(new URL(`${routeName}/index.html`, distDirectory), "utf8");
  if (routeIndex !== indexHtml) fail(`${routeName}/index.html is not the current SPA entry.`);
}

const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".svg", ".txt"]);
const forbiddenPatterns = [
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]+/ },
  { label: "Supabase service-role variable", pattern: /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY\s*[:=]/i },
  { label: "Ark API key variable", pattern: /ARK_API_KEY\s*[:=]/i },
  { label: "Tencent secret key variable", pattern: /(?:TENCENT_)?SECRET_KEY\s*[:=]/i },
];

async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await textFiles(path)));
    else if (textExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

for (const file of await textFiles(distDirectory.pathname)) {
  const fileStat = await stat(file);
  if (fileStat.size > 8 * 1024 * 1024) fail(`text asset is unexpectedly large: ${file}`);
  const content = await readFile(file, "utf8");
  for (const forbidden of forbiddenPatterns) {
    if (forbidden.pattern.test(content)) fail(`${forbidden.label} found in ${file}`);
  }
}

process.stdout.write("CloudBase build verification passed.\n");
