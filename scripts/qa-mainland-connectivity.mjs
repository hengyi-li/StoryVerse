import { performance } from "node:perf_hooks";

const siteUrl = requiredHttpsUrl("STORYVERSE_SITE_URL");
const supabaseUrl = requiredHttpsUrl("VITE_SUPABASE_URL");
const publishableKey = requiredValue("VITE_SUPABASE_PUBLISHABLE_KEY");
const monitorToken = requiredValue("STORYVERSE_MONITOR_TOKEN");
const storageProbeUrl = optionalHttpsUrl("STORYVERSE_STORAGE_PROBE_URL");
const samples = integerValue("STORYVERSE_PROBE_SAMPLES", 5, 1, 30);

function requiredValue(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredHttpsUrl(name) {
  const value = requiredValue(name).replace(/\/+$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return url.toString().replace(/\/+$/, "");
}

function optionalHttpsUrl(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) return "";
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return url.toString();
}

function integerValue(name, fallback, minimum, maximum) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

async function timedRequest(label, url, init, validate) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const body = await response.text();
    const durationMs = Math.round(performance.now() - startedAt);
    const validationError = validate(response, body);
    return {
      label,
      ok: !validationError,
      status: response.status,
      durationMs,
      error: validationError || null,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 0,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const checks = [
  {
    label: "frontend-home",
    url: `${siteUrl}/`,
    init: {},
    validate: (response, body) => (!response.ok || !body.includes('id="root"') ? "Frontend home is unavailable." : ""),
  },
  {
    label: "frontend-deep-route",
    url: `${siteUrl}/StarLobby`,
    init: {},
    validate: (response, body) =>
      !response.ok || !body.includes('id="root"') ? "SPA deep-route fallback is unavailable." : "",
  },
  {
    label: "supabase-database",
    url: `${supabaseUrl}/functions/v1/health-check`,
    init: {
      headers: {
        apikey: publishableKey,
        "x-storyverse-monitor-token": monitorToken,
      },
    },
    validate: (response, body) => {
      if (!response.ok) return `Health check returned HTTP ${response.status}.`;
      try {
        const payload = JSON.parse(body);
        return payload.status === "ok" && payload.database === "ok" ? "" : "Health payload is not healthy.";
      } catch {
        return "Health payload is not JSON.";
      }
    },
  },
];

if (storageProbeUrl) {
  checks.push({
    label: "supabase-storage-image",
    url: storageProbeUrl,
    init: { headers: { Range: "bytes=0-65535" } },
    validate: (response) => (response.ok ? "" : `Storage probe returned HTTP ${response.status}.`),
  });
}

const results = [];
for (let sample = 1; sample <= samples; sample += 1) {
  for (const check of checks) {
    results.push({ sample, ...(await timedRequest(check.label, check.url, check.init, check.validate)) });
  }
}

const summary = Object.fromEntries(
  checks.map((check) => {
    const values = results.filter((result) => result.label === check.label);
    const sortedDurations = values.map((result) => result.durationMs).sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedDurations.length * 0.95) - 1);
    return [
      check.label,
      {
        samples: values.length,
        available: values.filter((result) => result.ok).length,
        availability: values.filter((result) => result.ok).length / values.length,
        p95Ms: sortedDurations[p95Index],
      },
    ];
  }),
);

process.stdout.write(
  `${JSON.stringify({ checkedAt: new Date().toISOString(), siteUrl, results, summary }, null, 2)}\n`,
);
if (results.some((result) => !result.ok)) process.exitCode = 1;
