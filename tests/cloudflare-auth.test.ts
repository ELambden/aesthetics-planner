import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { onRequest } from "../functions/_middleware";
import { getAccessConfig, type Env } from "../functions/_shared/auth";

const issuer = "https://lina-test.cloudflareaccess.com";
const audience = "a".repeat(64);
const env: Env = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: audience };
let signingKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  signingKey = pair.privateKey;
  const jwk = { ...await exportJWK(pair.publicKey), kid: "lina-test-key", alg: "RS256", use: "sig" };
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    expect(String(url)).toBe(issuer + "/cdn-cgi/access/certs");
    return Response.json({ keys: [jwk] });
  }));
});

afterAll(() => vi.unstubAllGlobals());

async function token(overrides: JWTPayload = {}, key = signingKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer, aud: [audience], sub: "partner-id", email: "partner@example.com",
    iat: now, exp: now + 3600, ...overrides
  }).setProtectedHeader({ alg: "RS256", kid: "lina-test-key" }).sign(key);
}

async function request(path: string, assertion?: string, settings: Env = env) {
  const next = vi.fn(async () => new Response("private map data", {
    headers: { "Content-Type": "application/geo+json", "Cache-Control": "public, max-age=3600" }
  }));
  const response = await onRequest({
    request: new Request("https://lina-location-map.pages.dev" + path, {
      headers: assertion ? { "cf-access-jwt-assertion": assertion } : {}
    }),
    env: settings, next
  });
  return { response, next };
}

describe("Cloudflare Access protection", () => {
  it.each(["/", "/index.html", "/assets/app.js", "/data/clinics.json",
    "/data/density-overlay.geojson", "/data/opportunity-areas.geojson", "/api/config", "/api/auth/login"])(
    "blocks direct unauthenticated requests to %s", async (path) => {
      const { response, next } = await request(path);
      expect(response.status).toBe(403);
      expect(next).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain("private map data");
    }
  );

  it("keeps an unconfigured deployment closed", async () => {
    const { response, next } = await request("/data/clinics.json", undefined, {});
    expect(response.status).toBe(503);
    expect(next).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([
    "http://lina-test.cloudflareaccess.com",
    "https://lina-test.cloudflareaccess.com.attacker.example",
    "https://attacker.example",
    "https://lina-test.cloudflareaccess.com/path"
  ])("rejects an invalid team domain: %s", (domain) => {
    expect(getAccessConfig({ ...env, ACCESS_TEAM_DOMAIN: domain })).toBeNull();
  });

  it("rejects placeholder or missing audiences", () => {
    expect(getAccessConfig({ ACCESS_TEAM_DOMAIN: issuer })).toBeNull();
    expect(getAccessConfig({ ...env, ACCESS_AUD: "your-audience" })).toBeNull();
  });

  it("accepts a signed partner token and prevents shared caching", async () => {
    const { response, next } = await request("/data/clinics.json", await token());
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
    expect(await response.text()).toBe("private map data");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("content-type")).toBe("application/geo+json");
  });

  it.each([
    { aud: ["b".repeat(64)] },
    { iss: "https://another-team.cloudflareaccess.com" },
    { exp: 1 },
    { exp: undefined },
    { email: undefined },
    { nbf: Math.floor(Date.now() / 1000) + 3600 }
  ])("rejects an invalid token claim: %j", async (claims) => {
    const { response, next } = await request("/", await token(claims));
    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects forged signatures", async () => {
    const attacker = await generateKeyPair("RS256");
    const { response, next } = await request("/", await token({}, attacker.privateKey));
    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects malformed tokens", async () => {
    const { response, next } = await request("/", "invalid.token.signature");
    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a separately protected preview application's audience when configured", async () => {
    const previewAudience = "b".repeat(64);
    const { response } = await request("/", await token({ aud: [previewAudience] }),
      { ...env, ACCESS_AUD: audience + "," + previewAudience });
    expect(response.status).toBe(200);
  });
});
