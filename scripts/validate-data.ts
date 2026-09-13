import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { sampleAreas, sampleClinics } from "../src/data/sampleData";
import type { Clinic, OpportunityFeatureCollection, StationDataset } from "../src/types/domain";

const areas: OpportunityFeatureCollection = existsSync(resolve("public/data/opportunity-areas.geojson"))
  ? JSON.parse(await readFile(resolve("public/data/opportunity-areas.geojson"), "utf8"))
  : sampleAreas;

const clinics: Clinic[] = existsSync(resolve("public/data/clinics.json"))
  ? JSON.parse(await readFile(resolve("public/data/clinics.json"), "utf8"))
  : sampleClinics;

const errors: string[] = [];

if (areas.type !== "FeatureCollection") errors.push("Areas file is not a FeatureCollection");
if (!areas.features.length) errors.push("No opportunity areas found");
if (!clinics.length) errors.push("No clinics found");

for (const feature of areas.features) {
  const p = feature.properties;
  if (!p.areaCode) errors.push("Area missing areaCode");
  if (!feature.geometry?.coordinates?.length) errors.push(`${p.areaCode} missing geometry`);
  if (!Number.isFinite(p.propertyMedian) || p.propertyMedian <= 0) {
    errors.push(` invalid propertyMedian: `);
  }
  for (const key of ["overallScore", "densityScore", "accessGapScore", "affluenceScore"] as const) {
    if (!Number.isFinite(p[key]) || p[key] < 0 || p[key] > 100) {
      errors.push(`${p.areaCode} invalid ${key}: ${p[key]}`);
    }
  }
}

for (const clinic of clinics) {
  if (!clinic.placeId) errors.push(`${clinic.id} missing placeId`);
  if (!Number.isFinite(clinic.lat) || !Number.isFinite(clinic.lng)) errors.push(`${clinic.id} invalid coordinates`);
  if (new Date(clinic.expiresAt).getTime() < new Date(clinic.fetchedAt).getTime()) {
    errors.push(`${clinic.id} cache expiry is before fetchedAt`);
  }
}

const stationData: StationDataset = JSON.parse(await readFile("public/data/stations.json", "utf8"));
if (!stationData.stations.length || !Number.isFinite(Date.parse(stationData.updatedAt))) errors.push("Station snapshot is empty or undated");
const stationIds = new Set<string>();
for (const station of stationData.stations) {
  if (stationIds.has(station.id)) errors.push(`Duplicate station ${station.id}`);
  stationIds.add(station.id);
  if (!station.id || !station.name || !station.sourceIds.length || !station.modes.length) errors.push("Station missing identity or source");
  if (!Number.isFinite(station.lat) || !Number.isFinite(station.lng) || station.lat < 51.38 || station.lat > 52.18 || station.lng < -0.35 || station.lng > 1.38) errors.push(`Station coordinates outside map: ${station.id}`);
  if (typeof station.inStudyArea !== "boolean" || !Number.isFinite(station.boundaryDistanceKm) || station.boundaryDistanceKm < 0) errors.push(`Invalid station coverage: ${station.id}`);
}
const densityHash = createHash("sha256").update(await readFile("public/data/density-overlay.geojson")).digest("hex");
if (stationData.coverageSourceSha256 !== densityHash) errors.push("Run data:build-stations after changing the density polygons");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${areas.features.length} areas, ${clinics.length} clinics and ${stationData.stations.length} stations`);
