import type { PretestAnswers } from "../../types/domain";
import type { BilingualOption } from "./pretest-options.generated";

export const emptyPretestAnswers: PretestAnswers = {
  consented: false,
  birthYear: null,
  gender: "",
  residenceRegion: "",
  countryRegion: "",
  province: "",
  city: "",
  communityType: "",
  ethnicity: "",
  education: "",
  educationOther: "",
  employment: "",
  industryPrimary: "",
  industrySecondary: "",
  discipline: "",
  major: "",
};

export const genderOptions: BilingualOption[] = [
  { value: "male", labelZh: "男", labelEn: "Male" },
  { value: "female", labelZh: "女", labelEn: "Female" },
  { value: "other", labelZh: "其他", labelEn: "Other" },
];

export const residenceOptions: BilingualOption[] = [
  { value: "china_mainland", labelZh: "中国大陆", labelEn: "Mainland China" },
  { value: "hong_kong", labelZh: "香港特别行政区", labelEn: "Hong Kong SAR" },
  { value: "macau", labelZh: "澳门特别行政区", labelEn: "Macao SAR" },
  { value: "taiwan", labelZh: "台湾地区", labelEn: "Taiwan" },
  { value: "overseas", labelZh: "海外", labelEn: "Overseas" },
];

export const communityOptions: BilingualOption[] = [
  {
    value: "residents_committee",
    labelZh: "居委会（通常是城市、县城或乡镇政府驻地）",
    labelEn: "Residents’ committee (usually urban or township government areas)",
  },
  {
    value: "village_committee",
    labelZh: "村委会（通常是农村）",
    labelEn: "Village committee (usually rural areas)",
  },
];

export const educationOptions: BilingualOption[] = [
  { value: "less_than_primary", labelZh: "小学以下", labelEn: "Less than primary school" },
  { value: "primary", labelZh: "小学", labelEn: "Primary school" },
  { value: "junior_high", labelZh: "初中", labelEn: "Junior high school" },
  {
    value: "senior_high_vocational",
    labelZh: "高中 / 中专 / 技校 / 职高",
    labelEn: "Senior high / secondary vocational / technical school",
  },
  { value: "associate", labelZh: "大专", labelEn: "Junior college / Associate degree" },
  { value: "bachelor", labelZh: "大学本科", labelEn: "Bachelor’s degree" },
  { value: "postgraduate", labelZh: "硕士、博士及以上", labelEn: "Master’s, doctoral degree, or above" },
  { value: "other", labelZh: "其他", labelEn: "Other" },
];

export const employmentOptions: BilingualOption[] = [
  {
    value: "full_time",
    labelZh: "我有一份全职工作（例如上班族、农民、工人、公务员等）",
    labelEn: "I have a full-time job (e.g. office worker, farmer, factory worker, civil servant, etc.)",
  },
  {
    value: "internship_part_time",
    labelZh: "我有一份实习或者兼职工作",
    labelEn: "I have an internship or part-time job",
  },
  { value: "freelancer", labelZh: "我是自由职业者", labelEn: "I am self-employed / a freelancer" },
  { value: "unemployed", labelZh: "我现在失业了，没有工作", labelEn: "I am currently unemployed" },
  {
    value: "student_unpaid",
    labelZh: "我是没有工资收入的学生（不包括在职教育或已经参加实习工作的学生）",
    labelEn: "I am a student with no paid employment (excluding employed students or students doing a paid internship)",
  },
];

export const industryEmployment = new Set(["full_time", "internship_part_time", "freelancer"]);
export const majorEducation = new Set(["associate", "bachelor", "postgraduate"]);

export function needsIndustry(employment: string) {
  return industryEmployment.has(employment);
}

export function needsMajor(education: string, employment: string) {
  return majorEducation.has(education) && employment === "student_unpaid";
}
