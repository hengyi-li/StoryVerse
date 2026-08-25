import { describe, expect, it } from "vitest";
import {
  createExperimentCredentials,
  createExperimentPasswords,
  credentialsCsv,
  experimentAccountCodes,
  resonanceExperimentCondition,
} from "../scripts/lib/experiment-accounts.mjs";

describe("experiment account provisioning manifest", () => {
  it("contains exactly twenty accounts in each fixed condition", () => {
    expect(experimentAccountCodes).toHaveLength(40);
    expect(new Set(experimentAccountCodes).size).toBe(40);
    expect(
      experimentAccountCodes.filter((account) => resonanceExperimentCondition(account) === "all_similar"),
    ).toHaveLength(20);
    expect(
      experimentAccountCodes.filter((account) => resonanceExperimentCondition(account) === "all_different"),
    ).toHaveLength(20);
  });

  it("generates independent usable credentials without leaking hashes into the CSV", () => {
    const credentials = createExperimentCredentials();
    expect(new Set(credentials.map((item) => item.password)).size).toBe(40);
    expect(new Set(credentials.map((item) => item.securityAnswer)).size).toBe(40);
    expect(credentials.every((item) => /^\d{10}$/.test(item.password))).toBe(true);
    expect(credentials.every((item) => item.securityAnswer.length === 20)).toBe(true);
    const csv = credentialsCsv(credentials);
    expect(csv).toContain("experiment_condition");
    expect(csv).toContain("AISA01");
    expect(csv).toContain("AISB20");
    expect(csv).not.toContain("answer_hash");
  });

  it("generates unique shortest-valid numeric passwords", () => {
    const passwords = createExperimentPasswords(100);
    expect(passwords).toHaveLength(100);
    expect(new Set(passwords).size).toBe(100);
    expect(passwords.every((password) => /^\d{10}$/.test(password))).toBe(true);
  });
});
