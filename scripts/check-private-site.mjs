import { readFile } from "node:fs/promises";

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("Usage: npm run pages:verify -- https://PROJECT.pages.dev [https://DEPLOYMENT.PROJECT.pages.dev]");
  process.exit(1);
}
const html = await readFile("dist/index.html", "utf8");
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
const paths = ["/", "/index.html", "/api/config", "/data/clinics.json",
  "/data/opportunity-areas.geojson", "/data/density-overlay.geojson", ...assets];
let failures = 0;
for (const input of inputs) {
  const base = new URL(input);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Use an HTTPS site address with no path, credentials or query string.");
  }
  for (const path of paths) {
    for (const forged of [false, true]) {
      try {
        const response = await fetch(new URL(path, base), {
          redirect: "manual",
          headers: forged ? { "cf-access-jwt-assertion": "invalid.token.signature" } : {},
          signal: AbortSignal.timeout(15000)
        });
        const location = response.headers.get("location");
        const redirect = location ? new URL(location, base) : null;
        const loginRedirect = [302, 303, 307, 308].includes(response.status) && redirect?.protocol === "https:"
          && (redirect.hostname.endsWith(".cloudflareaccess.com") || redirect.origin === base.origin)
          && redirect.pathname.startsWith("/cdn-cgi/access/login");
        const denied = response.status === 401 || response.status === 403;
        await response.body?.cancel();
        if (!denied && !loginRedirect) {
          failures++;
          console.error("CHECK FAILED", base.hostname + path, response.status,
            response.status === 503 ? "(setup incomplete or service unavailable)" : "(expected Access login or denial)");
        } else {
          console.log("Blocked", base.hostname + path, forged ? "(forged token)" : "(anonymous)");
        }
      } catch (error) {
        failures++;
        console.error("CHECK FAILED", base.hostname + path, error.message);
      }
    }
  }
}
if (failures) process.exit(1);
console.log("Unauthenticated requests were blocked. Now test an allowed and an unlisted email in a browser; these checks do not prove the email policy is correct.");
