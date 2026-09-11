import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import XLSX from "xlsx";
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from "geojson";
import type { OpportunityFeatureCollection, OpportunityProperties } from "../src/types/domain";
import { rankFeatures } from "../src/lib/scoring";
import { sampleClinics } from "../src/data/sampleData";

type Ts006Row = {
  code: string;
  name: string;
  density: number;
};

type DensityProperties = OpportunityProperties & {
  densityClass: number;
};

type AnyFeature = Feature<Geometry, Record<string, unknown>>;

type HousePriceRow = {
  code: string;
  price: number;
};

const ts006Path = resolve("TS006-2021-1-filtered-2026-09-09T13_15_06Z.csv");
const oaPath = resolve("Output_Areas_2021_EW_BGC_V2_7890430654982992473.geojson");
const centroidPath = resolve("Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BFC_V10_-5478898981376037530.csv");
const housePricePath = resolve("HPSSA Dataset 46 - Median price paid for residential properties by LSOA.xls");

const targetAuthorities = new Set([
  "Havering",
  "Basildon",
  "Braintree",
  "Brentwood",
  "Castle Point",
  "Chelmsford",
  "Colchester",
  "Epping Forest",
  "Harlow",
  "Maldon",
  "Rochford",
  "Tendring",
  "Uttlesford",
  "Southend-on-Sea",
  "Thurrock"
]);

for (const path of [ts006Path, oaPath, centroidPath, housePricePath]) {
  if (!existsSync(path)) {
    throw new Error(`Missing required source file: ${path}`);
  }
}

const densityRows = parseTs006(await readFile(ts006Path, "utf8")).filter((row) =>
  targetAuthorities.has(authorityFromLsoaName(row.name))
);
const densityByCode = new Map(densityRows.map((row) => [row.code, row]));
const centroidByCode = parseCentroids(await readFile(centroidPath, "utf8"));
const densityValues = densityRows.map((row) => row.density).sort((a, b) => a - b);
const housePriceByCode = new Map(
  parseHousePrices(housePricePath)
    .filter((row) => densityByCode.has(row.code))
    .map((row) => [row.code, row.price])
);
const housePriceValues = [...housePriceByCode.values()].sort((a, b) => a - b);
const authorityFallbackPrices = buildAuthorityFallbackPrices(densityRows, housePriceByCode);
const clinicsForScoring = await loadClinicsForScoring();

const oaGeojson = JSON.parse(await readFile(oaPath, "utf8")) as FeatureCollection<
  Polygon | MultiPolygon,
  Record<string, unknown>
>;

const densityFeatures: Array<Feature<Polygon | MultiPolygon, DensityProperties>> = [];
const lsoaSummary = new Map<string, OpportunityProperties>();

for (const feature of oaGeojson.features as AnyFeature[]) {
  const code = String(feature.properties?.LSOA21CD ?? "");
  const row = densityByCode.get(code);
  if (!row || !feature.geometry) continue;

  const authority = authorityFromLsoaName(row.name);
  const centroid = centroidByCode.get(code) ?? centroidFromGeometry(feature.geometry);
  const densityScore = percentile(row.density, densityValues);
  const propertyMedian = housePriceByCode.get(code) ?? authorityFallbackPrices.get(authority) ?? median(housePriceValues);
  const affluenceScore = percentile(propertyMedian, housePriceValues);
  const distances = clinicDistances(centroid[1], centroid[0]);
  const nearestClinicKm = distances[0] ?? 99;
  const clinicCount2Km = distances.filter((distance) => distance <= 2).length;
  const clinicCount5Km = distances.filter((distance) => distance <= 5).length;
  const clinicCount10Km = distances.filter((distance) => distance <= 10).length;
  const accessGapScore = Math.max(
    0,
    Math.min(100, Math.round(nearestClinicKm * 9 + (3 - clinicCount5Km) * 8 - clinicCount2Km * 10))
  );
  const summary: OpportunityProperties =
    lsoaSummary.get(code) ??
    {
      areaCode: code,
      areaName: row.name,
      localAuthority: authority,
      population: Math.round(row.density),
      populationDensity: row.density,
      targetAgeShare: 36,
      imdDecile: Math.max(1, Math.min(10, Math.ceil(affluenceScore / 10))),
      propertyMedian,
      nearestClinicKm,
      clinicCount2Km,
      clinicCount5Km,
      clinicCount10Km,
      densityScore,
      accessGapScore,
      affluenceScore,
      overallScore: 0,
      rank: 0,
      centroid
    };

  lsoaSummary.set(code, summary);
  densityFeatures.push({
    type: "Feature",
    geometry: feature.geometry as Polygon | MultiPolygon,
    properties: {
      ...summary,
      densityClass: Math.min(9, Math.floor(densityScore / 10))
    }
  });
}

const opportunityAreas: OpportunityFeatureCollection = rankFeatures(
  {
    type: "FeatureCollection",
    features: [...lsoaSummary.values()].map((properties) => ({
      type: "Feature",
      properties,
      geometry: squareAround(properties.centroid[1], properties.centroid[0])
    }))
  },
  { density: 48, access: 22, affluence: 30 }
);

await mkdir(resolve("public/data"), { recursive: true });
await writeFile(
  resolve("public/data/density-overlay.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: densityFeatures })
);
await writeFile(resolve("public/data/opportunity-areas.geojson"), JSON.stringify(opportunityAreas, null, 2));

const missingPrices = densityRows.length - housePriceByCode.size;
console.log(
  `Built density overlay with ${densityFeatures.length} OA polygons across ${opportunityAreas.features.length} LSOAs`
);
console.log(
  `Applied year ending Mar 2023 LSOA house prices to ${housePriceByCode.size} LSOAs; ${missingPrices} used authority/area fallback`
);

function parseTs006(csv: string): Ts006Row[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [code, name, observation] = splitCsvLine(line);
      return { code, name, density: Number(observation) };
    })
    .filter((row) => row.code && row.name && Number.isFinite(row.density));
}

function parseHousePrices(path: string): HousePriceRow[] {
  const workbook = XLSX.readFile(path, { cellDates: false });
  const sheet = workbook.Sheets["1a"] ?? workbook.Sheets[workbook.SheetNames[5]];
  if (!sheet) throw new Error("Could not find house-price sheet 1a");

  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: ""
  });
  const headerIndex = rows.findIndex((row) => row.includes("LSOA code"));
  if (headerIndex === -1) throw new Error("Could not find LSOA code header in house-price sheet");

  const header = rows[headerIndex];
  const codeIndex = header.indexOf("LSOA code");
  const priceIndex = header.indexOf("Year ending Mar 2023");
  if (codeIndex === -1 || priceIndex === -1) {
    throw new Error("House-price sheet is missing LSOA code or Year ending Mar 2023 columns");
  }

  return rows
    .slice(headerIndex + 1)
    .map((row) => ({
      code: row[codeIndex],
      price: parsePrice(row[priceIndex])
    }))
    .filter((row) => row.code && Number.isFinite(row.price));
}

function parsePrice(value: string) {
  const cleaned = String(value).replace(/[,£\s]/g, "");
  if (!cleaned || cleaned === ":") return Number.NaN;
  return Number(cleaned);
}

function parseCentroids(csv: string) {
  const rows = csv.trim().split(/\r?\n/);
  const headers = splitCsvLine(rows[0]).map((header) => header.replace(/^\uFEFF/, ""));
  const codeIndex = headers.indexOf("LSOA21CD");
  const latIndex = headers.indexOf("LAT");
  const lngIndex = headers.indexOf("LONG");
  const centroids = new Map<string, [number, number]>();

  for (const row of rows.slice(1)) {
    const cols = splitCsvLine(row);
    const code = cols[codeIndex];
    const lat = Number(cols[latIndex]);
    const lng = Number(cols[lngIndex]);
    if (code && Number.isFinite(lat) && Number.isFinite(lng)) {
      centroids.set(code, [lng, lat]);
    }
  }

  return centroids;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

function authorityFromLsoaName(name: string) {
  return name.replace(/\s+\d{3}[A-Z]$/, "");
}

function percentile(value: number, sortedValues: number[]) {
  if (!sortedValues.length) return 0;
  const index = sortedValues.findIndex((candidate) => candidate >= value);
  const rank = index === -1 ? sortedValues.length - 1 : index;
  return Math.round((rank / Math.max(1, sortedValues.length - 1)) * 100);
}

function buildAuthorityFallbackPrices(rows: Ts006Row[], prices: Map<string, number>) {
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const price = prices.get(row.code);
    if (typeof price !== "number" || !Number.isFinite(price)) continue;
    const authority = authorityFromLsoaName(row.name);
    grouped.set(authority, [...(grouped.get(authority) ?? []), price]);
  }
  return new Map([...grouped.entries()].map(([authority, values]) => [authority, median(values)]));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1] ?? sorted[middle] ?? 0;
  const upper = sorted[middle] ?? lower;
  return sorted.length % 2 === 0 ? Math.round((lower + upper) / 2) : upper;
}

async function loadClinicsForScoring() {
  const generatedPath = resolve("public/data/clinics.json");
  if (!existsSync(generatedPath)) return sampleClinics;

  try {
    const clinics = JSON.parse(await readFile(generatedPath, "utf8")) as typeof sampleClinics;
    const usable = clinics.filter(
      (clinic) => clinic.reviewStatus !== "excluded" && clinic.status !== "CLOSED_PERMANENTLY"
    );
    return usable.length ? usable : sampleClinics;
  } catch {
    return sampleClinics;
  }
}

function clinicDistances(lat: number, lng: number) {
  return clinicsForScoring
    .map((clinic) => haversineKm(lat, lng, clinic.lat, clinic.lng))
    .sort((a, b) => a - b);
}

function centroidFromGeometry(geometry: Geometry): [number, number] {
  if (geometry.type === "GeometryCollection") return [0, 0];
  const points: Array<[number, number]> = [];
  collectPoints(geometry.coordinates as unknown[], points);
  const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [lng, lat];
}

function collectPoints(value: unknown[], points: Array<[number, number]>) {
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    points.push([value[0], value[1]] as [number, number]);
    return;
  }
  for (const item of value) collectPoints(item as unknown[], points);
}

function squareAround(lat: number, lng: number): Polygon {
  const dx = 0.004;
  const dy = 0.003;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - dx, lat - dy],
        [lng + dx, lat - dy],
        [lng + dx, lat + dy],
        [lng - dx, lat + dy],
        [lng - dx, lat - dy]
      ]
    ]
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
