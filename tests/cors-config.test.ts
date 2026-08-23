import { afterEach, describe, expect, it, vi } from "vitest";
import { corsHeaders, handleOptions, isAllowedOrigin } from "../supabase/functions/_shared/http.ts";

afterEach(() => vi.unstubAllGlobals());

function configureOrigins(value = "") {
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) => (key === "FRONTEND_ORIGINS" ? value : undefined),
    },
  });
}

describe("Edge Function CORS", () => {
  it("默认只允许本地开发来源", () => {
    configureOrigins();
    expect(isAllowedOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isAllowedOrigin("http://localhost:4173")).toBe(true);
    expect(isAllowedOrigin("https://chelsealeezc.github.io")).toBe(false);
  });

  it("腾讯云和未来正式域名只能通过 FRONTEND_ORIGINS 显式加入", () => {
    configureOrigins("https://demo.tcloudbaseapp.com,https://www.storyverse.example");
    expect(isAllowedOrigin("https://demo.tcloudbaseapp.com")).toBe(true);
    expect(isAllowedOrigin("https://www.storyverse.example")).toBe(true);
    expect(isAllowedOrigin("https://attacker.example")).toBe(false);
  });

  it("陌生来源不会获得 Access-Control-Allow-Origin", () => {
    configureOrigins("https://demo.tcloudbaseapp.com");
    const allowed = corsHeaders(
      new Request("https://api.example", { headers: { Origin: "https://demo.tcloudbaseapp.com" } }),
    );
    const blocked = corsHeaders(
      new Request("https://api.example", { headers: { Origin: "https://attacker.example" } }),
    );
    expect(allowed["Access-Control-Allow-Origin"]).toBe("https://demo.tcloudbaseapp.com");
    expect(blocked["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("预检请求允许 Supabase 区域路由使用 x-region 请求头", () => {
    configureOrigins("https://demo.tcloudbaseapp.com");
    const response = handleOptions(
      new Request("https://api.example", {
        method: "OPTIONS",
        headers: {
          Origin: "https://demo.tcloudbaseapp.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, apikey, content-type, x-client-info, x-region",
        },
      }),
    );

    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("https://demo.tcloudbaseapp.com");
    expect(response?.headers.get("Access-Control-Allow-Headers")?.split(/,\s*/)).toContain("x-region");
  });
});
