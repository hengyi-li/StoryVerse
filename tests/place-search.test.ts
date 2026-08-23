import { afterEach, describe, expect, it, vi } from "vitest";
import { extractAge, extractCity } from "../src/lib/story-hints";
import { geocodePlace, hasValidCoordinates, resolvePlaceCoordinates, searchPlaces } from "../src/services/place-search";

afterEach(() => vi.useRealTimers());

describe("本地识别与地点搜索", () => {
  it("识别中英文年龄和正文中的城市", () => {
    expect(extractAge("那一年我二十七岁，独自去了上海。")).toBe(27);
    expect(extractAge("I was 31 years old when it happened.")).toBe(31);
    expect(extractCity("后来我搬到了上海市生活。")?.name).toBe("上海");
    expect(extractCity("桌上放着一块大理石。")).toBeNull();
  });

  it("在本地城市库中搜索并解析坐标", async () => {
    const results = await searchPlaces("Tokyo");
    expect(results[0]?.name).toBe("东京");
    expect(results[0]?.source).toBe("local");
    expect(await geocodePlace("东京")).toMatchObject({ lat: expect.any(Number), lon: expect.any(Number) });
  });

  it("无需远程接口即可用中英文搜索德黑兰", async () => {
    const chinese = await searchPlaces("德黑兰");
    const english = await searchPlaces("Tehran");
    const alternateSpelling = await searchPlaces("Teheran");

    expect(chinese[0]).toMatchObject({ name: "德黑兰", nameEn: "Tehran", country: "伊朗", source: "local" });
    expect(english[0]?.name).toBe("德黑兰");
    expect(alternateSpelling[0]?.name).toBe("德黑兰");
    expect(await geocodePlace("德黑兰")).toMatchObject({ lat: 35.6892, lon: 51.389 });
  });

  it("提交前复用合法坐标，缺失时等待解析结果", async () => {
    const resolver = vi.fn().mockResolvedValue({ lat: 64.13548, lon: -21.89541 });
    expect(hasValidCoordinates(39.9042, 116.4074)).toBe(true);
    expect(hasValidCoordinates(null, 116.4074)).toBe(false);
    expect(await resolvePlaceCoordinates("北京", 39.9042, 116.4074, { resolver })).toEqual({
      lat: 39.9042,
      lon: 116.4074,
    });
    expect(resolver).not.toHaveBeenCalled();

    expect(await resolvePlaceCoordinates("Reykjavik", null, null, { resolver })).toEqual({
      lat: 64.13548,
      lon: -21.89541,
    });
    expect(resolver).toHaveBeenCalledWith("Reykjavik");
  });

  it("地点解析失败或超时不会伪造坐标", async () => {
    expect(
      await resolvePlaceCoordinates("不存在的地点", null, null, {
        resolver: vi.fn().mockResolvedValue(null),
      }),
    ).toBeNull();

    vi.useFakeTimers();
    const pending = resolvePlaceCoordinates("网络超时地点", null, null, {
      timeoutMs: 50,
      resolver: () => new Promise(() => undefined),
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBeNull();
  });
});
