import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const distDirectory = new URL("../dist/", import.meta.url);
const routeNames = [
  "PreTest",
  "PostTest",
  "StoryStart",
  "StoryWrite",
  "StoryAnalyzing",
  "StoryPage",
  "Resonance",
  "Recommendations",
  "StarLobby",
  "Admin",
];

for (const routeName of routeNames) {
  const routeDirectory = join(distDirectory.pathname, routeName);
  await mkdir(routeDirectory, { recursive: true });
  await copyFile(join(distDirectory.pathname, "index.html"), join(routeDirectory, "index.html"));
}

process.stdout.write(`Created ${routeNames.length} CloudBase SPA route fallbacks.\n`);
