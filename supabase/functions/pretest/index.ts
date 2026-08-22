import { ApiError, json, readJson, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import {
  PRETEST_VERSION,
  pretestRowFromAnswers,
  type PretestAnswers,
  validatePretestAnswers,
} from "../_shared/pretest.ts";

type PretestInput = {
  action?: "save" | "submit" | "decline";
  step?: 1 | 2 | 3 | 4;
  answers?: PretestAnswers;
};

function responsePayload(profile: Record<string, unknown>, row?: Record<string, unknown> | null) {
  if (profile.role === "admin" || profile.pretest_required === false) {
    return {
      required: false,
      status: "not_required",
      currentStep: 1,
      questionnaireVersion: PRETEST_VERSION,
      draft: null,
    };
  }
  if (!row) {
    return {
      required: true,
      status: "not_started",
      currentStep: 1,
      questionnaireVersion: PRETEST_VERSION,
      draft: null,
    };
  }
  return {
    required: true,
    status: String(row.status),
    currentStep: Number(row.current_step ?? 1),
    questionnaireVersion: String(row.questionnaire_version ?? PRETEST_VERSION),
    draft:
      row.status === "declined"
        ? null
        : {
            consented: Boolean(row.consented),
            birthYear: row.birth_year,
            gender: String(row.gender ?? ""),
            residenceRegion: String(row.residence_region ?? ""),
            countryRegion: String(row.country_region ?? ""),
            province: String(row.province ?? ""),
            city: String(row.city ?? ""),
            communityType: String(row.community_type ?? ""),
            ethnicity: String(row.ethnicity ?? ""),
            education: String(row.education ?? ""),
            educationOther: String(row.education_other ?? ""),
            employment: String(row.employment ?? ""),
            industryPrimary: String(row.industry_primary ?? ""),
            industrySecondary: String(row.industry_secondary ?? ""),
            discipline: String(row.discipline ?? ""),
            major: String(row.major ?? ""),
          },
    consentedAt: row.consented_at,
    submittedAt: row.submitted_at,
    declinedAt: row.declined_at,
  };
}

serve(async (request) => {
  const { user } = await requireUser(request);
  const admin = adminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role,pretest_required")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) throw profileError ?? new Error("Profile not found");
  const { data: existing, error: responseError } = await admin
    .from("pretest_responses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (responseError) throw responseError;

  if (request.method === "GET") return json(request, responsePayload(profile, existing));
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方式。");
  if (profile.role === "admin" || profile.pretest_required === false) {
    throw new ApiError(
      409,
      "PRETEST_NOT_REQUIRED",
      "此账号不需要填写前测。 / This account does not require the pre-study.",
    );
  }
  if (existing?.status === "completed" || existing?.status === "declined") {
    throw new ApiError(409, "PRETEST_LOCKED", "前测结果已锁定。 / This pre-study response is locked.");
  }

  const input = await readJson<PretestInput>(request);
  if (input.action === "decline") {
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("pretest_responses")
      .upsert(
        {
          user_id: user.id,
          status: "declined",
          questionnaire_version: PRETEST_VERSION,
          current_step: 1,
          consented: false,
          birth_year: null,
          gender: null,
          residence_region: null,
          country_region: null,
          province: null,
          city: null,
          community_type: null,
          ethnicity: null,
          education: null,
          education_other: null,
          employment: null,
          industry_primary: null,
          industry_secondary: null,
          discipline: null,
          major: null,
          consented_at: null,
          submitted_at: null,
          declined_at: now,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return json(request, responsePayload(profile, data));
  }

  if (input.action !== "save" && input.action !== "submit") {
    throw new ApiError(400, "INVALID_PRETEST_ACTION", "问卷操作不正确。 / Invalid pre-study action.");
  }
  const requestedStep = Number(input.step ?? (input.action === "submit" ? 4 : 0));
  if (![1, 2, 3, 4].includes(requestedStep)) {
    throw new ApiError(400, "INVALID_PRETEST_STEP", "问卷步骤不正确。 / Invalid pre-study step.");
  }
  const availableStep = Number(existing?.current_step ?? 1);
  if (requestedStep > availableStep) {
    throw new ApiError(409, "PRETEST_STEP_OUT_OF_ORDER", "请按顺序完成问卷。 / Complete the questionnaire in order.");
  }

  const answers = validatePretestAnswers(input.answers ?? {}, requestedStep as 1 | 2 | 3 | 4);
  const now = new Date().toISOString();
  const terminal = input.action === "submit";
  const { data, error } = await admin
    .from("pretest_responses")
    .upsert(
      {
        user_id: user.id,
        status: terminal ? "completed" : "in_progress",
        questionnaire_version: PRETEST_VERSION,
        current_step: terminal ? 4 : Math.max(Number(existing?.current_step ?? 1), Math.min(4, requestedStep + 1)),
        ...pretestRowFromAnswers(answers),
        consented_at: existing?.consented_at ?? now,
        submitted_at: terminal ? now : null,
        declined_at: null,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return json(request, responsePayload(profile, data));
});
