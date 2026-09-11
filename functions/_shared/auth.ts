import { createRemoteJWKSet, jwtVerify } from "jose";

export type Env = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OS_API_KEY?: string;
  GOOGLE_MAPS_BROWSER_KEY?: string;
};

type AccessConfig = { issuer: string; audience: string[] };

// Keep Cloudflare's public signing keys cached between requests.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function getAccessConfig(env: Env): AccessConfig | null {
  const issuer = env.ACCESS_TEAM_DOMAIN?.trim().replace(/\/$/, "");
  const audience = env.ACCESS_AUD?.split(",").map((value) => value.trim()).filter(Boolean);
  if (!issuer || !/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer)) {
    return null;
  }
  if (!audience?.length || audience.some((value) => !/^[a-f0-9]{64}$/.test(value))) return null;
  return { issuer, audience };
}

export async function isAuthenticated(request: Request, config: AccessConfig): Promise<boolean> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return false;

  try {
    let keys = keySets.get(config.issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(config.issuer + "/cdn-cgi/access/certs"));
      keySets.set(config.issuer, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
      clockTolerance: 5
    });
    return typeof payload.email === "string" && payload.email.length > 0;
  } catch {
    // Missing, forged, expired or unverifiable tokens never grant access.
    return false;
  }
}

export function privateResponse(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("Cache-Control", "private, no-store");
  secured.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return secured;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return privateResponse(new Response(JSON.stringify(data), { ...init, headers }));
}
