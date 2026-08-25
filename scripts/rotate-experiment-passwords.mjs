import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createExperimentPasswords, credentialsCsv, experimentAccountCodes } from "./lib/experiment-accounts.mjs";

function parseEnvironment(path) {
  if (!existsSync(path)) throw new Error(`Environment file not found: ${path}`);
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^(['"])(.*)\1$/, "$2"),
        ];
      }),
  );
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function projectRef(url) {
  return new URL(url).hostname.split(".")[0];
}

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells;
}

function readCredentials(path) {
  if (!existsSync(path)) throw new Error(`Credential CSV not found: ${path}`);
  const lines = readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const columns = parseCsvLine(lines.shift() ?? "");
  const required = [
    "account",
    "display_name",
    "password",
    "security_question",
    "security_answer",
    "experiment_condition",
  ];
  if (columns.join("\u0000") !== required.join("\u0000")) throw new Error("Credential CSV columns are invalid.");
  return lines.map((line) =>
    Object.fromEntries(columns.map((column, index) => [column, parseCsvLine(line)[index] ?? ""])),
  );
}

async function restorePasswords(service, changed) {
  const failures = [];
  for (const credential of [...changed].reverse()) {
    const { error } = await service.auth.admin.updateUserById(credential.userId, { password: credential.oldPassword });
    if (error) failures.push(`${credential.account}: ${error.message}`);
  }
  return failures;
}

const apply = process.argv.includes("--apply");
const envPath = resolve(argumentValue("--env-file") || ".env.local");
const csvPath = resolve(argumentValue("--csv") || "../StoryVerse_experiment_accounts_20260826.csv");
const expectedProjectRef = argumentValue("--project-ref");
const environment = parseEnvironment(envPath);
const supabaseUrl = String(environment.VITE_SUPABASE_URL ?? "").trim();
const secretKey = String(environment.SUPABASE_SECRET_KEY ?? "").trim();
const publishableKey = String(environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

if (!supabaseUrl || !secretKey || !publishableKey) {
  throw new Error("VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are required.");
}
if (apply && (!expectedProjectRef || projectRef(supabaseUrl) !== expectedProjectRef)) {
  throw new Error("--apply requires the exact --project-ref for the selected Supabase project.");
}

const credentials = readCredentials(csvPath);
const expectedAccounts = new Set(experimentAccountCodes);
if (
  credentials.length !== expectedAccounts.size ||
  credentials.some((credential) => !expectedAccounts.has(credential.account)) ||
  new Set(credentials.map((credential) => credential.account)).size !== expectedAccounts.size
) {
  throw new Error("Credential CSV must contain each of the 40 experiment accounts exactly once.");
}

const service = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: profiles, error: profileError } = await service
  .from("profiles")
  .select("id,username,status,role")
  .in(
    "username",
    experimentAccountCodes.map((account) => account.toLowerCase()),
  );
if (profileError) throw profileError;
if (profiles?.length !== 40 || profiles.some((profile) => profile.role !== "user" || profile.status !== "active")) {
  throw new Error(`Production preflight failed: expected 40 active user profiles, received ${profiles?.length ?? 0}.`);
}

const profileByAccount = new Map(profiles.map((profile) => [String(profile.username).toUpperCase(), profile]));
const { data: accountCredentials, error: accountCredentialError } = await service
  .from("account_credentials")
  .select("user_id,internal_email")
  .in(
    "user_id",
    profiles.map((profile) => profile.id),
  );
if (accountCredentialError) throw accountCredentialError;
if (accountCredentials?.length !== 40)
  throw new Error("Production preflight failed: account credential mapping is incomplete.");
const emailByUserId = new Map(accountCredentials.map((credential) => [credential.user_id, credential.internal_email]));

if (!apply) {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "dry-run",
        projectRef: projectRef(supabaseUrl),
        accounts: credentials.length,
        passwordFormat: "10 numeric digits",
        conflicts: 0,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const pendingPath = `${csvPath}.pending`;
const previousPath = `${csvPath}.previous`;
if (existsSync(pendingPath) || existsSync(previousPath))
  throw new Error("A previous password rotation artifact exists.");
const newPasswords = createExperimentPasswords(credentials.length);
const rotatedCredentials = credentials.map((credential, index) => ({
  account: credential.account,
  displayName: credential.display_name,
  password: newPasswords[index],
  securityQuestion: credential.security_question,
  securityAnswer: credential.security_answer,
  condition: credential.experiment_condition,
}));
writeFileSync(pendingPath, credentialsCsv(rotatedCredentials), { encoding: "utf8", mode: 0o600, flag: "wx" });

const changed = [];
try {
  for (let index = 0; index < credentials.length; index += 1) {
    const credential = credentials[index];
    const profile = profileByAccount.get(credential.account);
    if (!profile) throw new Error(`Profile not found for ${credential.account}.`);
    const { error } = await service.auth.admin.updateUserById(profile.id, { password: newPasswords[index] });
    if (error) throw error;
    changed.push({
      account: credential.account,
      userId: profile.id,
      oldPassword: credential.password,
      newPassword: newPasswords[index],
      internalEmail: emailByUserId.get(profile.id),
    });
  }

  for (const account of ["AISA01", "AISB01"]) {
    const credential = changed.find((item) => item.account === account);
    if (!credential?.internalEmail) throw new Error(`Login verification mapping is missing for ${account}.`);
    const loginClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await loginClient.auth.signInWithPassword({
      email: credential.internalEmail,
      password: credential.newPassword,
    });
    if (error || !data.session) throw error ?? new Error(`New password login failed for ${account}.`);
  }

  renameSync(csvPath, previousPath);
  try {
    renameSync(pendingPath, csvPath);
    unlinkSync(previousPath);
  } catch (error) {
    if (existsSync(csvPath)) unlinkSync(csvPath);
    if (existsSync(previousPath)) renameSync(previousPath, csvPath);
    throw error;
  }
  process.stdout.write("Rotated and verified 40 experiment account passwords to unique 10-digit numeric values.\n");
} catch (error) {
  const restoreFailures = await restorePasswords(service, changed);
  if (existsSync(pendingPath)) unlinkSync(pendingPath);
  const restoreNote = restoreFailures.length
    ? ` Password restore failures: ${restoreFailures.join("; ")}.`
    : " All changed passwords were restored.";
  throw new Error(`${error instanceof Error ? error.message : String(error)}${restoreNote}`);
}
