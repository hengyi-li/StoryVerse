import { pbkdf2Sync, randomBytes, randomInt } from "node:crypto";

export const experimentAccountCodes = [
  ...Array.from({ length: 20 }, (_, index) => `AISA${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 20 }, (_, index) => `AISB${String(index + 1).padStart(2, "0")}`),
];

const readableAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function resonanceExperimentCondition(accountIdentifier) {
  const account = String(accountIdentifier ?? "").trim();
  if (/^aisa\d+$/i.test(account)) return "all_similar";
  if (/^aisb\d+$/i.test(account)) return "all_different";
  return null;
}

export function generateReadableSecret(length) {
  return Array.from({ length }, () => readableAlphabet[randomInt(readableAlphabet.length)]).join("");
}

function uniqueReadableSecrets(count, length) {
  const secrets = new Set();
  while (secrets.size < count) secrets.add(generateReadableSecret(length));
  return [...secrets];
}

export function createExperimentCredentials() {
  const passwords = uniqueReadableSecrets(experimentAccountCodes.length, 16);
  const securityAnswers = uniqueReadableSecrets(experimentAccountCodes.length, 20);
  return experimentAccountCodes.map((account, index) => ({
    account,
    displayName: account,
    password: passwords[index],
    securityQuestion: "first_school",
    securityAnswer: securityAnswers[index],
    condition: resonanceExperimentCondition(account),
  }));
}

function normalizedSecurityAnswer(value) {
  return String(value).trim().normalize("NFKC").toLocaleLowerCase("zh-CN");
}

export function hashSecurityAnswer(answer) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(normalizedSecurityAnswer(answer), salt, 210_000, 32, "sha256");
  return { salt: salt.toString("base64"), hash: hash.toString("base64") };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function credentialsCsv(credentials) {
  const columns = [
    "account",
    "display_name",
    "password",
    "security_question",
    "security_answer",
    "experiment_condition",
  ];
  const rows = credentials.map((credential) =>
    [
      credential.account,
      credential.displayName,
      credential.password,
      credential.securityQuestion,
      credential.securityAnswer,
      credential.condition,
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[columns.join(","), ...rows].join("\n")}\n`;
}
