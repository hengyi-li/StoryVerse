export type PasswordConfirmationState = "idle" | "match" | "mismatch";
export type AccountIdentifierValidationIssue = "required" | "too_short" | "too_long" | "invalid_characters" | null;

export function getAccountIdentifierValidationIssue(value: string): AccountIdentifierValidationIssue {
  const accountIdentifier = value.trim();
  if (!accountIdentifier) return "required";
  if (/[^A-Za-z0-9_]/.test(accountIdentifier)) return "invalid_characters";
  if (accountIdentifier.length < 4) return "too_short";
  if (accountIdentifier.length > 20) return "too_long";
  return null;
}

export function isValidAccountIdentifier(value: string) {
  return getAccountIdentifierValidationIssue(value) === null;
}

export function getPasswordConfirmationState(
  password: string,
  passwordConfirmation: string,
): PasswordConfirmationState {
  if (!passwordConfirmation) return "idle";
  if (password !== passwordConfirmation) return "mismatch";
  return password.length >= 10 ? "match" : "idle";
}
