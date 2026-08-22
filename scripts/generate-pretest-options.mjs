import { readFile, writeFile } from "node:fs/promises";
import { pinyin } from "pinyin-pro";

const [sourcePath, outputPath, serverOutputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath || !serverOutputPath) {
  throw new Error(
    "Usage: node scripts/generate-pretest-options.mjs <questionnaire.txt> <frontend-output.ts> <server-output.ts>",
  );
}

const source = (await readFile(sourcePath, "utf8")).replaceAll("\\\n", "\n");
const lines = source.split(/\r?\n/).map((line) => line.trim());

function between(start, end) {
  const startIndex = lines.findIndex((line) => line.includes(start));
  const endIndex = lines.findIndex((line, index) => index > startIndex && line.includes(end));
  if (startIndex < 0 || endIndex < 0) throw new Error(`Could not locate ${start} → ${end}`);
  return lines.slice(startIndex + 1, endIndex).filter(Boolean);
}

function bilingual(line) {
  const normalized = line.replace(/^\+/, "").trim();
  for (let index = 1; index < normalized.length - 1; index += 1) {
    if (normalized[index] !== " ") continue;
    const left = normalized.slice(0, index).trim();
    const right = normalized.slice(index + 1).trim();
    if (/\p{Script=Han}/u.test(left) && /^[A-Za-z]/.test(right)) return { zh: left, en: right };
  }
  return { zh: normalized, en: "" };
}

const residenceLines = between("省 市", "请问您家所在的社区");
const regions = [];
let currentRegion = null;
for (const line of residenceLines) {
  if (line.startsWith("+")) {
    currentRegion?.cities.push(line.slice(1));
    continue;
  }
  currentRegion = { name: line, cities: [] };
  regions.push(currentRegion);
}
for (const region of regions) if (!region.cities.length) region.cities.push(region.name);

const ethnicityLines = between("我不是中国公民 I am not a Chinese citizen", "您已完成（毕业）的最高学历是");

function hierarchy(start, end) {
  const section = between(start, end).filter(
    (line) =>
      !["一级行业 Primary Industry", "二级行业 Secondary Industry", "学科 Discipline", "专业 Major"].includes(line),
  );
  const result = [];
  let group = null;
  for (const line of section) {
    if (line.startsWith("+")) {
      group?.children.push(bilingual(line));
      continue;
    }
    const parsed = bilingual(line);
    if (!parsed.en) continue;
    group = { ...parsed, children: [] };
    result.push(group);
  }
  return result;
}

const industries = hierarchy("一级行业 Primary Industry", "您学习的专业是？");
const disciplines = hierarchy("学科 Discipline", "+深地科学与工程 Deep Earth Science and Engineering");
const deepEarth = bilingual("深地科学与工程 Deep Earth Science and Engineering");
disciplines.at(-1)?.children.push(deepEarth);

function romanize(value) {
  return pinyin(value, { toneType: "none", type: "array" }).join(" ").replace(/\s+/g, " ").trim();
}

const regionEnglish = new Map([
  ["北京市", "Beijing"],
  ["天津市", "Tianjin"],
  ["上海市", "Shanghai"],
  ["重庆市", "Chongqing"],
  ["内蒙古自治区", "Inner Mongolia"],
  ["广西壮族自治区", "Guangxi"],
  ["西藏自治区", "Tibet"],
  ["宁夏回族自治区", "Ningxia"],
  ["新疆维吾尔自治区", "Xinjiang"],
  ["香港特别行政区", "Hong Kong SAR"],
  ["澳门特别行政区", "Macao SAR"],
  ["台湾省", "Taiwan"],
]);

const ethnicityEnglish = [
  "Han",
  "Zhuang",
  "Manchu",
  "Hui",
  "Miao",
  "Uyghur",
  "Tujia",
  "Yi",
  "Mongol",
  "Tibetan",
  "Bouyei",
  "Dong",
  "Yao",
  "Korean",
  "Bai",
  "Hani",
  "Kazakh",
  "Li",
  "Dai",
  "She",
  "Lisu",
  "Gelao",
  "Dongxiang",
  "Gaoshan",
  "Lahu",
  "Sui",
  "Va",
  "Naxi",
  "Qiang",
  "Tu",
  "Mulao",
  "Xibe",
  "Kyrgyz",
  "Daur",
  "Jingpo",
  "Maonan",
  "Salar",
  "Blang",
  "Tajik",
  "Achang",
  "Pumi",
  "Ewenki",
  "Nu",
  "Gin",
  "Jino",
  "De’ang",
  "Bonan",
  "Russian",
  "Yugur",
  "Uzbek",
  "Monba",
  "Oroqen",
  "Derung",
  "Tatar",
  "Hezhen",
  "Lhoba",
];

function properRomanization(value) {
  const stripped = value.replace(
    /(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|自治州|地区|林区|省|市|县)$/u,
    "",
  );
  const joined = pinyin(stripped, { toneType: "none", type: "array" }).join("").toLowerCase();
  return joined ? `${joined[0].toUpperCase()}${joined.slice(1)}` : romanize(value);
}

function stableCode(value) {
  return romanize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function option(labelZh, labelEn = "") {
  return {
    value: stableCode(labelZh),
    labelZh,
    labelEn: labelEn || regionEnglish.get(labelZh) || properRomanization(labelZh),
  };
}

const generated = {
  chinaRegions: regions.map((region) => ({
    ...option(region.name),
    children: region.cities.map((city) => option(city)),
  })),
  ethnicityOptions: [
    { value: "not_chinese_citizen", labelZh: "我不是中国公民", labelEn: "I am not a Chinese citizen" },
    ...ethnicityLines.map((value, index) => option(value, ethnicityEnglish[index])),
  ],
  industryOptions: industries.map((group) => ({
    ...option(group.zh, group.en),
    children: group.children.map((child) => option(child.zh, child.en)),
  })),
  disciplineOptions: disciplines.map((group) => ({
    ...option(group.zh, group.en),
    children: group.children.map((child) => option(child.zh, child.en)),
  })),
};

await writeFile(
  outputPath,
  `// Generated from the approved pretest questionnaire. Do not hand-edit option text.\n` +
    `export type BilingualOption = { value: string; labelZh: string; labelEn: string };\n` +
    `export type BilingualGroup = BilingualOption & { children: BilingualOption[] };\n\n` +
    `export const chinaRegions: BilingualGroup[] = ${JSON.stringify(generated.chinaRegions, null, 2)};\n\n` +
    `export const ethnicityOptions: BilingualOption[] = ${JSON.stringify(generated.ethnicityOptions, null, 2)};\n\n` +
    `export const industryOptions: BilingualGroup[] = ${JSON.stringify(generated.industryOptions, null, 2)};\n\n` +
    `export const disciplineOptions: BilingualGroup[] = ${JSON.stringify(generated.disciplineOptions, null, 2)};\n`,
  "utf8",
);

const serverCatalog = {
  provinceCities: Object.fromEntries(
    generated.chinaRegions.map((group) => [group.value, group.children.map((item) => item.value)]),
  ),
  ethnicityCodes: generated.ethnicityOptions.map((item) => item.value),
  industryChildren: Object.fromEntries(
    generated.industryOptions.map((group) => [group.value, group.children.map((item) => item.value)]),
  ),
  disciplineChildren: Object.fromEntries(
    generated.disciplineOptions.map((group) => [group.value, group.children.map((item) => item.value)]),
  ),
};

await writeFile(
  serverOutputPath,
  `// Generated from the approved pretest questionnaire. Do not hand-edit.\n` +
    `export const pretestProvinceCities: Record<string, string[]> = ${JSON.stringify(serverCatalog.provinceCities, null, 2)};\n\n` +
    `export const pretestEthnicityCodes = new Set(${JSON.stringify(serverCatalog.ethnicityCodes, null, 2)});\n\n` +
    `export const pretestIndustryChildren: Record<string, string[]> = ${JSON.stringify(serverCatalog.industryChildren, null, 2)};\n\n` +
    `export const pretestDisciplineChildren: Record<string, string[]> = ${JSON.stringify(serverCatalog.disciplineChildren, null, 2)};\n`,
  "utf8",
);
