export function requiredFrontendOrigin() {
  const value = String(process.env.STORYVERSE_FRONTEND_ORIGIN ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!value) {
    throw new Error(
      "STORYVERSE_FRONTEND_ORIGIN is required. Set it to the exact deployed origin, for example https://storyverse-prod-d9f1q8jqe812448d-1351558504.tcloudbaseapp.com.",
    );
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("STORYVERSE_FRONTEND_ORIGIN must be an HTTPS origin without a path, query, or hash.");
  }
  return url.origin;
}
