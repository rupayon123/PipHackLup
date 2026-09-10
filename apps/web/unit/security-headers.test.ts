import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("global browser security headers", () => {
  it("protects every route from framing, MIME confusion, and unused browser capabilities", async () => {
    const routes = await nextConfig.headers?.();
    const global = routes?.find((route) => route.source === "/:path*");
    const headers = new Map(
      global?.headers.map((header) => [header.key.toLowerCase(), header.value]),
    );

    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("permissions-policy")).toContain("microphone=()");
  });

  it("ships a restrictive content security policy for app and Discord avatar assets", async () => {
    const routes = await nextConfig.headers?.();
    const csp = routes
      ?.flatMap((route) => route.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("https://cdn.discordapp.com");
    expect(csp).not.toContain("https://*");
  });
});
