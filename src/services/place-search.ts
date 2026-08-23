import { cities, cityByName } from "../data/cities";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export interface PlaceSuggestion {
  id: string;
  name: string;
  detail: string;
  nameEn: string;
  country: string;
  lat: number | null;
  lon: number | null;
  source: "local" | "open-meteo" | "ipwhois";
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export const PLACE_RESOLUTION_TIMEOUT_MS = 7_000;

const cache = new Map<string, PlaceSuggestion[]>();

export function hasValidCoordinates(lat: number | null | undefined, lon: number | null | undefined) {
  return (
    lat != null &&
    lon != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lon)) &&
    Number(lat) >= -90 &&
    Number(lat) <= 90 &&
    Number(lon) >= -180 &&
    Number(lon) <= 180
  );
}

async function searchRemote(query: string): Promise<PlaceSuggestion[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.functions.invoke("places-search", {
    body: { query, language: /[一-龥]/.test(query) ? "zh" : "en" },
  });
  if (error) throw error;
  return Array.isArray(data?.places) ? (data.places as PlaceSuggestion[]) : [];
}

function searchLocal(query: string, limit: number): PlaceSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return cities.slice(0, limit).map(toSuggestion);

  return cities
    .map((city, index) => {
      const name = city.name.toLowerCase();
      const nameEn = city.nameEn.toLowerCase();
      const aliases = city.aliases.map((alias) => alias.toLowerCase());
      let score = 0;
      if (name === q || nameEn === q) score = 100;
      else if (name.startsWith(q) || nameEn.startsWith(q)) score = 80;
      else if (aliases.some((alias) => alias === q || alias.startsWith(q))) score = 70;
      else if (name.includes(q) || nameEn.includes(q) || aliases.some((alias) => alias.includes(q))) score = 45;
      else if (city.country.toLowerCase().includes(q)) score = 25;
      return { city, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => toSuggestion(item.city));
}

function hasExactLocalMatch(query: string) {
  const normalized = query.trim().toLowerCase();
  return cities.some(
    (city) =>
      city.name.toLowerCase() === normalized ||
      city.nameEn.toLowerCase() === normalized ||
      city.aliases.some((alias) => alias.toLowerCase() === normalized),
  );
}

/**
 * 城市联想 = 本地城市库 + 服务端 Open-Meteo 全球地点搜索。
 * 外部服务不可用时安静退回本地结果，输入框不会因此卡住。
 */
export async function searchPlaces(query: string, limit = 8): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  const local = searchLocal(q, limit);
  if (!q) return local;
  // An exact local hit is already authoritative and should never be delayed
  // by an optional network lookup.
  if (hasExactLocalMatch(q)) return local;

  const cached = cache.get(q);
  if (cached) return cached;

  let remote: PlaceSuggestion[] = [];
  try {
    remote = await searchRemote(q);
  } catch {
    remote = [];
  }

  const merged: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const place of [...local, ...remote]) {
    if (seen.has(place.name)) continue;
    seen.add(place.name);
    merged.push(place);
  }
  const result = merged.slice(0, limit);
  if (remote.length > 0) cache.set(q, result);
  return result;
}

/** 城市名 → 经纬度：先查本地库，查不到再问服务端地点接口。 */
export async function geocodePlace(name: string): Promise<GeoPoint | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const city = cityByName.get(trimmed);
  if (city) return { lat: city.lat, lon: city.lon };
  const [match] = await searchPlaces(trimmed, 1);
  return match && match.lat !== null && match.lon !== null ? { lat: match.lat, lon: match.lon } : null;
}

/**
 * 正式提交前的坐标闸门：已有合法坐标直接复用，否则等待城市解析。
 * 超时或解析失败一律返回 null，由界面阻止进入 AI 分析。
 */
export async function resolvePlaceCoordinates(
  name: string,
  lat: number | null | undefined,
  lon: number | null | undefined,
  options: {
    timeoutMs?: number;
    resolver?: (placeName: string) => Promise<GeoPoint | null>;
  } = {},
): Promise<GeoPoint | null> {
  if (hasValidCoordinates(lat, lon)) return { lat: Number(lat), lon: Number(lon) };
  const timeoutMs = options.timeoutMs ?? PLACE_RESOLUTION_TIMEOUT_MS;
  const resolver = options.resolver ?? geocodePlace;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver(name).catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function getIpPlaceHint(): Promise<PlaceSuggestion | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.functions.invoke("places-ip-hint", { method: "GET" });
    if (error) return null;
    return (data?.place as PlaceSuggestion | null) ?? null;
  } catch {
    return null;
  }
}

export function formatCoords(lat: number | null, lon: number | null) {
  if (!hasValidCoordinates(lat, lon)) return "";
  return `${Number(lat).toFixed(2)}, ${Number(lon).toFixed(2)}`;
}

function toSuggestion(city: (typeof cities)[number]): PlaceSuggestion {
  return {
    id: city.id,
    name: city.name,
    detail: `${city.nameEn} · ${city.country}`,
    nameEn: city.nameEn,
    country: city.country,
    lat: city.lat,
    lon: city.lon,
    source: "local",
  };
}
