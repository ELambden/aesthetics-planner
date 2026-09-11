import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAreas, getClinics, getConfig, getDensityOverlay } from "../src/lib/api";
import { PRESET_WEIGHTS } from "../src/lib/scoring";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hosted map data", () => {
  it("uses the repository subpath for all map data on GitHub Pages", async () => {
    vi.stubEnv("BASE_URL", "/another-repository/");
    const fetchMock = vi.fn(async (path: string) => {
      expect(path.startsWith("/another-repository/data/")).toBe(true);
      return new Response(await readFile("public/" + path.slice("/another-repository/".length), "utf8"), {
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await getAreas(PRESET_WEIGHTS.balanced);
    await getClinics("all");
    await getDensityOverlay();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("runs the GitHub Pages build without a server configuration or login", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "github-pages");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const config = await getConfig();
    expect(config.accessProtected).toBe(false);
    expect(config.mapCenter).toEqual({ lat: 51.66, lng: 0.42 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads and ranks the real local dataset, and filters the real clinics", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) =>
      new Response(await readFile("public" + path, "utf8"), {
        headers: { "Content-Type": path.endsWith(".geojson") ? "application/geo+json" : "application/json" }
      })
    ));
    const localAreas = JSON.parse(await readFile("public/data/opportunity-areas.geojson", "utf8"));
    const localClinics = JSON.parse(await readFile("public/data/clinics.json", "utf8"));
    const areas = await getAreas(PRESET_WEIGHTS.balanced);
    expect(areas.features.length).toBe(localAreas.features.length);
    expect(areas.features.length).toBeGreaterThan(100);
    expect(areas.features[0].properties.rank).toBe(1);
    expect((await getClinics("all")).length).toBe(localClinics.length);
    expect((await getClinics("needs_review")).every((clinic) => clinic.reviewStatus === "needs_review")).toBe(true);
    expect((await getDensityOverlay()).features.length).toBeGreaterThan(0);
  });

  it.each([401, 403, 404, 503])("never substitutes sample data after HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status })));
    await expect(getAreas(PRESET_WEIGHTS.balanced)).rejects.toThrow();
    await expect(getClinics("all")).rejects.toThrow();
    await expect(getDensityOverlay()).rejects.toThrow();
  });

  it("handles an expired Access session returning an HTML login page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Sign in</html>", {
      headers: { "Content-Type": "text/html" }
    })));
    await expect(getAreas(PRESET_WEIGHTS.balanced)).rejects.toThrow("session may have expired");
  });

  it("requires the authenticated configuration endpoint in production", async () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    await expect(getConfig()).rejects.toThrow();
  });
});
