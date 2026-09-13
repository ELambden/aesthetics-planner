import { rankFeatures } from "./scoring";
import type {
  AppConfig,
  Clinic,
  ClinicReviewStatus,
  DensityFeatureCollection,
  OpportunityFeatureCollection,
  ScoreWeights,
  StationDataset
} from "../types/domain";

export const MAP_LOAD_ERROR = import.meta.env.MODE === "github-pages"
  ? "The map could not load. Reload to try again."
  : "The map could not load. Your session may have expired. Reload to sign in and try again.";

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(import.meta.env.BASE_URL + path.replace(/^\/+/, ""), { cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !/(?:application\/json|application\/geo\+json)/i.test(contentType)) {
    throw new Error(MAP_LOAD_ERROR);
  }
  return response.json() as Promise<T>;
}

export async function getConfig(): Promise<AppConfig> {
  // GitHub Pages is explicitly public and has no server configuration endpoint.
  // Cloudflare production still requires its authenticated endpoint.
  if (import.meta.env.DEV || import.meta.env.MODE === "github-pages") {
    return {
      googleMapsKey: import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? "",
      osApiKey: import.meta.env.VITE_OS_API_KEY ?? "",
      mapCenter: { lat: 51.66, lng: 0.42 },
      mapZoom: 9,
      accessProtected: false
    };
  }
  return readJson<AppConfig>("/api/config");
}

export async function getAreas(weights: ScoreWeights): Promise<OpportunityFeatureCollection> {
  const areas = await readJson<OpportunityFeatureCollection>("/data/opportunity-areas.geojson");
  return rankFeatures(areas, weights);
}

export async function getClinics(status: ClinicReviewStatus | "all"): Promise<Clinic[]> {
  const clinics = await readJson<Clinic[]>("/data/clinics.json");
  return clinics.filter((clinic) => status === "all" || clinic.reviewStatus === status);
}

export async function getDensityOverlay(): Promise<DensityFeatureCollection> {
  return readJson<DensityFeatureCollection>("/data/density-overlay.geojson");
}

export async function getStations(): Promise<StationDataset> {
  return readJson<StationDataset>("/data/stations.json");
}
