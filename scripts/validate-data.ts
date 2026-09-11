import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { sampleAreas, sampleClinics } from "../src/data/sampleData";
import type { Clinic, OpportunityFeatureCollection } from "../src/types/domain";

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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${areas.features.length} areas and ${clinics.length} clinics`);
