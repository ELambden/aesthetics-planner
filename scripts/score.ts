import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { sampleAreas, sampleClinics } from "../src/data/sampleData";
import { PRESET_WEIGHTS, rankFeatures } from "../src/lib/scoring";
import type { Clinic, OpportunityFeature, OpportunityFeatureCollection } from "../src/types/domain";

type RawPlacesFile = {
  fetchedAt: string;
  places: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    businessStatus?: Clinic["status"];
    rating?: number;
    userRatingCount?: number;
    types?: string[];
  }>;
};

const clinics = await loadClinicsForScoring();

const scoredAreas: OpportunityFeatureCollection = rankFeatures(
  {
    ...sampleAreas,
    features: sampleAreas.features.map((feature) => scoreAccess(feature, clinics))
  },
  PRESET_WEIGHTS.balanced
);

await mkdir(resolve("public/data"), { recursive: true });
await mkdir(resolve("generated"), { recursive: true });
await writeFile(resolve("public/data/opportunity-areas.geojson"), JSON.stringify(scoredAreas, null, 2));
await writeFile(resolve("public/data/clinics.json"), JSON.stringify(clinics, null, 2));
await writeFile(
  resolve("generated/scored-areas.json"),
  JSON.stringify(
    scoredAreas.features.map((feature) => ({
      area_code: feature.properties.areaCode,
      area_name: feature.properties.areaName,
      local_authority: feature.properties.localAuthority,
      overall_score: feature.properties.overallScore,
      payload: JSON.stringify(feature)
    })),
    null,
    2
  )
);

console.log(`Scored ${scoredAreas.features.length} areas against ${clinics.length} clinics`);

async function loadClinicsForScoring(): Promise<Clinic[]> {
  const clinicsPath = resolve("public/data/clinics.json");
  if (existsSync(clinicsPath)) {
    const clinics = JSON.parse(await readFile(clinicsPath, "utf8")) as Clinic[];
    if (clinics.length) return clinics;
  }

  if (existsSync(resolve("generated/places-raw.json"))) {
    return normalizePlaces(JSON.parse(await readFile(resolve("generated/places-raw.json"), "utf8")) as RawPlacesFile);
  }

  return sampleClinics;
}

function normalizePlaces(raw: RawPlacesFile): Clinic[] {
  const fetchedAt = raw.fetchedAt || new Date().toISOString();
  const expiresAt = new Date(new Date(fetchedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return raw.places
    .filter((place) => place.id && place.location?.latitude && place.location?.longitude)
    .map((place) => ({
      id: place.id.replace(/[^a-zA-Z0-9_-]/g, "-"),
      placeId: place.id,
      name: place.displayName?.text ?? "Unnamed clinic",
      address: place.formattedAddress ?? "",
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
      status: place.businessStatus ?? "UNKNOWN",
      reviewStatus: "needs_review",
      confidence: "medium",
      source: "google_places",
      categories: classifyTypes(place.types ?? []),
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      fetchedAt,
      expiresAt
    }));
}

function classifyTypes(types: string[]) {
  const labels = new Set<string>();
  if (types.some((type) => type.includes("beauty"))) labels.add("beauty");
  if (types.some((type) => type.includes("spa"))) labels.add("medical spa");
  if (types.some((type) => type.includes("health") || type.includes("doctor"))) labels.add("health");
  if (labels.size === 0) labels.add("aesthetics");
  return [...labels];
}

function scoreAccess(feature: OpportunityFeature, nextClinics: Clinic[]): OpportunityFeature {
  const [lng, lat] = feature.properties.centroid;
  const distances = nextClinics
    .filter((clinic) => clinic.status !== "CLOSED_PERMANENTLY" && clinic.reviewStatus !== "excluded")
    .map((clinic) => haversineKm(lat, lng, clinic.lat, clinic.lng))
    .sort((a, b) => a - b);

  const nearestClinicKm = distances[0] ?? 99;
  const clinicCount2Km = distances.filter((distance) => distance <= 2).length;
  const clinicCount5Km = distances.filter((distance) => distance <= 5).length;
  const clinicCount10Km = distances.filter((distance) => distance <= 10).length;
  const accessGapScore = Math.max(
    0,
    Math.min(100, Math.round(nearestClinicKm * 9 + (3 - clinicCount5Km) * 8 - clinicCount2Km * 10))
  );

  return {
    ...feature,
    properties: {
      ...feature.properties,
      nearestClinicKm,
      clinicCount2Km,
      clinicCount5Km,
      clinicCount10Km,
      accessGapScore
    }
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}
