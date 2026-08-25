import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  createExperimentCredentials,
  credentialsCsv,
  experimentAccountCodes,
  hashSecurityAnswer,
  resonanceExperimentCondition,
} from "./lib/experiment-accounts.mjs";

function parseEnvironment(path) {
  if (!existsSync(path)) throw new Error(`Environment file not found: ${path}`);
  const entries = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const name = line.slice(0, separator).trim();
      const raw = line.slice(separator + 1).trim();
      const value = raw.replace(/^(['"])(.*)\1$/, "$2");
      return [name, value];
    });
  return Object.fromEntries(entries);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function projectRef(url) {
  return new URL(url).hostname.split(".")[0];
}

function randomAnonymousNumber() {
  return randomInt(1000, 1_000_000);
}

async function rollbackCreatedUsers(service, userIds) {
  const failures = [];
  for (const userId of [...userIds].reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) failures.push(`${userId}: ${error.message}`);
  }
  return failures;
}

const apply = process.argv.includes("--apply");
const envPath = resolve(argumentValue("--env-file") || ".env.local");
const outputPath = resolve(argumentValue("--output") || "../StoryVerse_experiment_accounts_20260826.csv");
const expectedProjectRef = argumentValue("--project-ref");
const environment = parseEnvironment(envPath);
const supabaseUrl = String(environment.VITE_SUPABASE_URL ?? "").trim();
const secretKey = String(environment.SUPABASE_SECRET_KEY ?? "").trim();

if (!supabaseUrl || !secretKey) {
  throw new Error("VITE_SUPABASE_URL and SUPABASE_SECRET_KEY are required in the environment file.");
}
if (apply && !expectedProjectRef) {
  throw new Error("--apply requires --project-ref so production cannot be selected accidentally.");
}
if (apply && projectRef(supabaseUrl) !== expectedProjectRef) {
  throw new Error(`Project safety check failed: expected ${expectedProjectRef}, received ${projectRef(supabaseUrl)}.`);
}

const service = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const normalizedAccounts = experimentAccountCodes.map((account) => account.toLowerCase());
const { data: existingProfiles, error: existingError } = await service
  .from("profiles")
  .select("id,username,role,status")
  .in("username", normalizedAccounts);
if (existingError) throw existingError;
if (existingProfiles?.length) {
  throw new Error(
    `Preflight stopped: ${existingProfiles.length} target account(s) already exist: ${existingProfiles
      .map((profile) => profile.username)
      .join(", ")}`,
  );
}

const { data: classifierResult, error: classifierError } = await service.rpc("resonance_experiment_condition", {
  p_username: "AISA01",
});
if (classifierError || classifierResult !== "all_similar") {
  throw classifierError ?? new Error("The resonance experiment migration is not active on the selected project.");
}

if (!apply) {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "dry-run",
        projectRef: projectRef(supabaseUrl),
        accounts: experimentAccountCodes.length,
        allSimilar: 20,
        allDifferent: 20,
        conflicts: 0,
        next: "Run again with --apply --project-ref <project-ref> after all release checks pass.",
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

if (existsSync(outputPath) || existsSync(`${outputPath}.pending`)) {
  throw new Error(`Credential output already exists; refusing to overwrite it: ${outputPath}`);
}

const credentials = createExperimentCredentials();
const pendingOutputPath = `${outputPath}.pending`;
writeFileSync(pendingOutputPath, credentialsCsv(credentials), { encoding: "utf8", mode: 0o600, flag: "wx" });

const createdUserIds = [];
try {
  for (const credential of credentials) {
    const internalEmail = `${credential.account.toLowerCase()}@users.storyverse.invalid`;
    const { data: created, error: authError } = await service.auth.admin.createUser({
      email: internalEmail,
      password: credential.password,
      email_confirm: true,
      user_metadata: { username: credential.account, display_name: credential.displayName },
    });
    if (authError || !created.user) throw authError ?? new Error(`Could not create ${credential.account}.`);
    createdUserIds.push(created.user.id);

    const { error: profileError } = await service.from("profiles").insert({
      id: created.user.id,
      username: credential.account,
      display_name: credential.displayName,
      anonymous_number: randomAnonymousNumber(),
      role: "user",
      status: "active",
      pretest_required: true,
    });
    if (profileError) throw profileError;

    const answer = hashSecurityAnswer(credential.securityAnswer);
    const { error: credentialError } = await service.from("account_credentials").insert({
      user_id: created.user.id,
      internal_email: internalEmail,
      security_question: credential.securityQuestion,
      answer_salt: answer.salt,
      answer_hash: answer.hash,
    });
    if (credentialError) throw credentialError;
  }

  const { data: profiles, error: profileCheckError } = await service
    .from("profiles")
    .select("id,username,display_name,role,status,pretest_required")
    .in("username", normalizedAccounts);
  if (profileCheckError) throw profileCheckError;
  const ids = (profiles ?? []).map((profile) => profile.id);
  const { data: preferences, error: preferenceError } = await service
    .from("resonance_preferences")
    .select("user_id,city_mode,stage_mode,theme_mode")
    .in("user_id", ids);
  if (preferenceError) throw preferenceError;

  if (profiles?.length !== 40 || preferences?.length !== 40) {
    throw new Error(
      `Post-create verification failed: profiles=${profiles?.length}, preferences=${preferences?.length}.`,
    );
  }
  for (const profile of profiles) {
    const condition = resonanceExperimentCondition(profile.username);
    const expectedMode = condition === "all_similar" ? "similar" : condition === "all_different" ? "different" : null;
    const preference = preferences.find((row) => row.user_id === profile.id);
    if (
      !expectedMode ||
      profile.role !== "user" ||
      profile.status !== "active" ||
      profile.pretest_required !== true ||
      profile.display_name.toUpperCase() !== profile.username.toUpperCase() ||
      !preference ||
      preference.city_mode !== expectedMode ||
      preference.stage_mode !== expectedMode ||
      preference.theme_mode !== expectedMode
    ) {
      throw new Error(`Post-create verification failed for ${profile.username}.`);
    }
  }

  renameSync(pendingOutputPath, outputPath);
  process.stdout.write(
    `Created and verified 40 experiment accounts (20 all-similar, 20 all-different).\nCredentials: ${outputPath}\n`,
  );
} catch (error) {
  const rollbackFailures = await rollbackCreatedUsers(service, createdUserIds);
  if (!rollbackFailures.length && existsSync(pendingOutputPath)) unlinkSync(pendingOutputPath);
  const rollbackNote = rollbackFailures.length
    ? ` Rollback failures: ${rollbackFailures.join("; ")}. Pending credentials remain at ${pendingOutputPath}.`
    : " All accounts created by this run were rolled back.";
  throw new Error(`${error instanceof Error ? error.message : String(error)}${rollbackNote}`);
}
