import { ApiError } from "./http.ts";
import {
  pretestDisciplineChildren,
  pretestEthnicityCodes,
  pretestIndustryChildren,
  pretestProvinceCities,
} from "./pretest-options.generated.ts";

export const PRETEST_VERSION = "pretest_v1";

export type PretestAnswers = {
  consented?: boolean;
  birthYear?: number | null;
  gender?: string | null;
  residenceRegion?: string | null;
  countryRegion?: string | null;
  province?: string | null;
  city?: string | null;
  communityType?: string | null;
  ethnicity?: string | null;
  education?: string | null;
  educationOther?: string | null;
  employment?: string | null;
  industryPrimary?: string | null;
  industrySecondary?: string | null;
  discipline?: string | null;
  major?: string | null;
};

const genders = new Set(["male", "female", "other"]);
const residenceRegions = new Set(["china_mainland", "hong_kong", "macau", "taiwan", "overseas"]);
const communityTypes = new Set(["residents_committee", "village_committee"]);
const educationLevels = new Set([
  "less_than_primary",
  "primary",
  "junior_high",
  "senior_high_vocational",
  "associate",
  "bachelor",
  "postgraduate",
  "other",
]);
const employmentStatuses = new Set(["full_time", "internship_part_time", "freelancer", "unemployed", "student_unpaid"]);
const industryEmployment = new Set(["full_time", "internship_part_time", "freelancer"]);
const majorEducation = new Set(["associate", "bachelor", "postgraduate"]);

function text(value: unknown, max = 120) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > max) {
    throw new ApiError(400, "PRETEST_FIELD_TOO_LONG", "问卷答案过长，请检查后重试。 / An answer is too long.");
  }
  return normalized;
}

function required(value: unknown, code: string, message: string) {
  const normalized = text(value);
  if (!normalized) throw new ApiError(400, code, message);
  return normalized;
}

function inSet(value: unknown, options: Set<string>, code: string, message: string) {
  const normalized = required(value, code, message);
  if (!options.has(normalized)) throw new ApiError(400, code, message);
  return normalized;
}

function noHiddenValues(values: unknown[], code: string, message: string) {
  if (values.some((value) => text(value) !== null)) throw new ApiError(400, code, message);
}

function validHierarchy(
  parent: string | null,
  child: string | null,
  catalog: Record<string, string[]>,
  code: string,
  message: string,
) {
  if (!parent || !child || !catalog[parent]?.includes(child)) throw new ApiError(400, code, message);
}

export function needsIndustry(employment: string | null | undefined) {
  return Boolean(employment && industryEmployment.has(employment));
}

export function needsMajor(education: string | null | undefined, employment: string | null | undefined) {
  return Boolean(education && majorEducation.has(education) && employment === "student_unpaid");
}

export function validatePretestAnswers(input: PretestAnswers, throughStep: 1 | 2 | 3 | 4) {
  const answers: Required<PretestAnswers> = {
    consented: input.consented === true,
    birthYear: input.birthYear == null ? null : Number(input.birthYear),
    gender: text(input.gender),
    residenceRegion: text(input.residenceRegion),
    countryRegion: text(input.countryRegion),
    province: text(input.province),
    city: text(input.city),
    communityType: text(input.communityType),
    ethnicity: text(input.ethnicity),
    education: text(input.education),
    educationOther: text(input.educationOther, 160),
    employment: text(input.employment),
    industryPrimary: text(input.industryPrimary),
    industrySecondary: text(input.industrySecondary),
    discipline: text(input.discipline),
    major: text(input.major),
  };

  if (!answers.consented) {
    throw new ApiError(400, "PRETEST_CONSENT_REQUIRED", "请先同意参与研究。 / Please agree before continuing.");
  }
  if (throughStep >= 2) {
    if (!Number.isInteger(answers.birthYear) || Number(answers.birthYear) < 1900 || Number(answers.birthYear) > 2026) {
      throw new ApiError(400, "INVALID_BIRTH_YEAR", "请选择 1900–2026 年。 / Select a year from 1900 to 2026.");
    }
    answers.gender = inSet(answers.gender, genders, "INVALID_PRETEST_GENDER", "请选择性别。 / Select a gender.");
    answers.residenceRegion = inSet(
      answers.residenceRegion,
      residenceRegions,
      "INVALID_RESIDENCE_REGION",
      "请选择常住地区。 / Select your primary place of residence.",
    );
    if (answers.residenceRegion === "china_mainland") {
      answers.province = required(
        answers.province,
        "PRETEST_PROVINCE_REQUIRED",
        "请选择省级地区。 / Select a province-level region.",
      );
      answers.city = required(answers.city, "PRETEST_CITY_REQUIRED", "请选择城市。 / Select a city.");
      validHierarchy(
        answers.province,
        answers.city,
        pretestProvinceCities,
        "INVALID_PRETEST_CITY",
        "省市组合不正确。 / The province and city do not match.",
      );
      answers.communityType = inSet(
        answers.communityType,
        communityTypes,
        "PRETEST_COMMUNITY_REQUIRED",
        "请选择社区类型。 / Select a community type.",
      );
      noHiddenValues(
        [answers.countryRegion],
        "PRETEST_HIDDEN_FIELD",
        "中国大陆选项不应包含海外地区。 / Overseas fields must be empty.",
      );
      answers.countryRegion = null;
    } else if (answers.residenceRegion === "overseas") {
      answers.countryRegion = required(
        answers.countryRegion,
        "PRETEST_COUNTRY_REQUIRED",
        "请填写国家或地区。 / Enter your country or region.",
      );
      noHiddenValues(
        [answers.province, answers.city, answers.communityType],
        "PRETEST_HIDDEN_FIELD",
        "海外选项不应包含中国省市信息。 / China residence fields must be empty.",
      );
      answers.province = null;
      answers.city = null;
      answers.communityType = null;
    } else {
      noHiddenValues(
        [answers.countryRegion, answers.communityType],
        "PRETEST_HIDDEN_FIELD",
        "当前地区不应包含隐藏字段。 / Hidden residence fields must be empty.",
      );
      if (
        (answers.province && answers.province !== answers.residenceRegion) ||
        (answers.city && answers.city !== answers.residenceRegion)
      ) {
        throw new ApiError(
          400,
          "INVALID_SPECIAL_REGION",
          "港澳台地区值不一致。 / The special-region values do not match.",
        );
      }
      answers.countryRegion = null;
      answers.province = answers.residenceRegion;
      answers.city = answers.residenceRegion;
      answers.communityType = null;
    }
  }
  if (throughStep >= 3) {
    answers.ethnicity = required(
      answers.ethnicity,
      "PRETEST_ETHNICITY_REQUIRED",
      "请选择民族。 / Select an ethnicity.",
    );
    if (!pretestEthnicityCodes.has(answers.ethnicity)) {
      throw new ApiError(400, "INVALID_PRETEST_ETHNICITY", "民族选项不正确。 / Invalid ethnicity option.");
    }
    answers.education = inSet(
      answers.education,
      educationLevels,
      "INVALID_PRETEST_EDUCATION",
      "请选择最高学历。 / Select your highest completed education.",
    );
    if (answers.education === "other") {
      answers.educationOther = required(
        answers.educationOther,
        "PRETEST_EDUCATION_OTHER_REQUIRED",
        "请填写其他学历。 / Describe the other education level.",
      );
    } else {
      noHiddenValues(
        [answers.educationOther],
        "PRETEST_HIDDEN_FIELD",
        "非“其他”学历不应包含补充内容。 / The other-education field must be empty.",
      );
      answers.educationOther = null;
    }
  }
  if (throughStep >= 4) {
    answers.employment = inSet(
      answers.employment,
      employmentStatuses,
      "INVALID_PRETEST_EMPLOYMENT",
      "请选择工作状态。 / Select your employment status.",
    );
    if (needsIndustry(answers.employment)) {
      answers.industryPrimary = required(
        answers.industryPrimary,
        "PRETEST_INDUSTRY_REQUIRED",
        "请选择一级行业。 / Select a primary industry.",
      );
      answers.industrySecondary = required(
        answers.industrySecondary,
        "PRETEST_INDUSTRY_REQUIRED",
        "请选择二级行业。 / Select a secondary industry.",
      );
      validHierarchy(
        answers.industryPrimary,
        answers.industrySecondary,
        pretestIndustryChildren,
        "INVALID_PRETEST_INDUSTRY",
        "一级与二级行业不匹配。 / The industry selections do not match.",
      );
    } else {
      noHiddenValues(
        [answers.industryPrimary, answers.industrySecondary],
        "PRETEST_HIDDEN_FIELD",
        "当前工作状态不应包含行业信息。 / Industry fields must be empty.",
      );
      answers.industryPrimary = null;
      answers.industrySecondary = null;
    }
    if (needsMajor(answers.education, answers.employment)) {
      answers.discipline = required(
        answers.discipline,
        "PRETEST_MAJOR_REQUIRED",
        "请选择学科。 / Select a discipline.",
      );
      answers.major = required(answers.major, "PRETEST_MAJOR_REQUIRED", "请选择专业。 / Select a major.");
      validHierarchy(
        answers.discipline,
        answers.major,
        pretestDisciplineChildren,
        "INVALID_PRETEST_MAJOR",
        "学科与专业不匹配。 / The discipline and major do not match.",
      );
    } else {
      noHiddenValues(
        [answers.discipline, answers.major],
        "PRETEST_HIDDEN_FIELD",
        "当前学历和工作状态不应包含专业信息。 / Major fields must be empty.",
      );
      answers.discipline = null;
      answers.major = null;
    }
  }
  return answers;
}

export function pretestRowFromAnswers(answers: Required<PretestAnswers>) {
  return {
    consented: answers.consented,
    birth_year: answers.birthYear,
    gender: answers.gender,
    residence_region: answers.residenceRegion,
    country_region: answers.countryRegion,
    province: answers.province,
    city: answers.city,
    community_type: answers.communityType,
    ethnicity: answers.ethnicity,
    education: answers.education,
    education_other: answers.educationOther,
    employment: answers.employment,
    industry_primary: answers.industryPrimary,
    industry_secondary: answers.industrySecondary,
    discipline: answers.discipline,
    major: answers.major,
  };
}
