import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { hasTrustedMutationOrigin } from "../lib/request-security";

afterEach(() => {
  delete process.env.NEXTAUTH_URL;
});

describe("hasTrustedMutationOrigin", () => {
  it("accepts the request's own origin", () => {
    const request = new NextRequest("https://piphacklup.test/api/remove", {
      headers: { origin: "https://piphacklup.test" },
    });

    expect(hasTrustedMutationOrigin(request)).toBe(true);
  });

  it("accepts the configured public origin behind a proxy", () => {
    process.env.NEXTAUTH_URL = "https://piphacklup.vercel.app";
    const request = new NextRequest("http://internal.test/api/remove", {
      headers: { origin: "https://piphacklup.vercel.app" },
    });

    expect(hasTrustedMutationOrigin(request)).toBe(true);
  });

  it("rejects missing, malformed, and cross-site origins", () => {
    const missing = new NextRequest("https://piphacklup.test/api/remove");
    const malformed = new NextRequest("https://piphacklup.test/api/remove", {
      headers: { origin: "not a URL" },
    });
    const crossSite = new NextRequest("https://piphacklup.test/api/remove", {
      headers: { origin: "https://attacker.example" },
    });

    expect(hasTrustedMutationOrigin(missing)).toBe(false);
    expect(hasTrustedMutationOrigin(malformed)).toBe(false);
    expect(hasTrustedMutationOrigin(crossSite)).toBe(false);
  });
});
