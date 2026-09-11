import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type { Feature, Point } from "geojson";
import type { Clinic, ClinicConfidence, ClinicReviewStatus } from "../src/types/domain";

type OvertureFeature = Feature<Point, Record<string, unknown>>;

const bbox = "-0.18,51.38,1.38,52.18";
const rawPath = resolve("generated/overture-places.geojsonseq");
const clinicsPath = resolve("public/data/clinics.json");

const includePatterns = [
  /aesthetic/i,
  /aesthetics/i,
  /skin.?care/i,
  /skin clinic/i,
  /laser hair removal/i,
  /laser skin/i,
  /inject/i,
  /botox/i,
  /filler/i,
  /cosmetic dermatology/i,
  /cosmetic skin/i,
  /cosmetic surgeon/i,
  /plastic surgeon/i,
  /dermatology/i,
  /rejuvenation/i,
  /anti.?age/i,
  /medical spa/i,
  /medi.?spa/i
];

const strongPatterns = [
  /aesthetic/i,
  /inject/i,
  /botox/i,
  /filler/i,
  /laser hair removal/i,
  /laser skin/i,
  /skin clinic/i,
  /cosmetic surgeon/i,
  /plastic surgeon/i,
  /dermatology/i,
  /medical spa/i,
  /medi.?spa/i
];
const excludePatterns = [/hairdresser/i, /barber/i, /nail/i, /brow/i, /lash/i, /tanning/i, /massage/i, /physio/i, /chiropr/i, /perfume/i, /retail/i, /pharmacy/i, /supply/i];
const hardExcludePatterns = [
  /dentist/i,
  /dental/i,
  /orthodont/i,
  /teeth whitening/i,
  /laser tag/i,
  /arcade/i,
  /automotive/i,
  /contractor/i,
  /kitchen/i,
  /industrial/i,
  /engineering/i,
  /metal fabricator/i,
  /event planning/i,
  /party/i,
  /music venue/i,
  /arts and crafts/i,
  /hobby shop/i,
  /school/i,
  /academy/i,
  /training/i,
  /cosmetic and beauty supplies/i,
  /beauty product supplier/i
];
const anyPostcodePattern = /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i;
const postcodeTailPattern = /(?:^|,\s*)([A-Z]{1,2}\d{1,2}[A-Z]?)(?:\s?\d[A-Z]{0,2})?\s*$/i;
const targetOutwardPostcodePattern = /^(?:RM\d{1,2}|CM\d{1,2}|SS\d{1,2}|CO\d{1,2}|IG(?:7|9|10)|EN9|CB1[01])$/i;
const targetPostcodePattern = /\b(?:RM\d{1,2}|CM\d{1,2}|SS\d{1,2}|CO\d{1,2}|IG(?:7|9|10)|EN9|CB1[01])\s?\d[A-Z]{2}\b/i;
const targetLocalityPattern = /(?:^|,\s*)(Havering|Romford|Hornchurch|Upminster|Rainham|Brentwood|Billericay|Basildon|Chelmsford|Maldon|Southend(?:-on-Sea)?|Leigh-on-Sea|Rayleigh|Rochford|Grays|Thurrock|Lakeside|Colchester|Clacton(?:-on-Sea)?|Braintree|Witham|Harlow|Epping|Loughton|Chigwell|Buckhurst Hill|Saffron Walden|Essex)(?:,|$|\s+[A-Z]{1,2}\d)/i;

await mkdir(resolve("generated"), { recursive: true });
await mkdir(resolve("public/data"), { recursive: true });

if (!existsSync(rawPath) || process.env.OVERTURE_FORCE_DOWNLOAD === "1") {
  const cli = findOvertureCli();
  if (!cli) {
    throw new Error(
      [
        "Overture CLI is not installed.",
        "Set it up locally with:",
        "  python3 -m venv .venv",
        "  .venv/bin/pip install overturemaps",
        "Then rerun:",
        "  npm run data:refresh-overture"
      ].join("\n")
    );
  }

  const download = spawnSync(
    cli,
    ["download", "--bbox", bbox, "-f", "geojsonseq", "--type", "place", "-o", rawPath],
    { encoding: "utf8" }
  );

  if (download.status !== 0) {
    throw new Error(`Overture download failed:\n${download.stderr || download.stdout}`);
  }
} else {
  console.log(`Using existing ${rawPath}; set OVERTURE_FORCE_DOWNLOAD=1 to fetch again`);
}

const fetchedAt = new Date().toISOString();
const clinics: Clinic[] = [];
let placeCount = 0;

const lines = createInterface({ input: createReadStream(rawPath), crlfDelay: Infinity });
for await (const rawLine of lines) {
  const line = rawLine.replace(/^\x1e/, "").trim();
  if (!line) continue;
  placeCount += 1;
  const feature = JSON.parse(line) as OvertureFeature;
  const clinic = normalizeFeature(feature, fetchedAt);
  if (clinic) clinics.push(clinic);
}

const deduped = dedupeClinics(clinics);
await writeFile(clinicsPath, JSON.stringify(deduped, null, 2));

const summary = deduped.reduce<Record<string, number>>((counts, clinic) => {
  counts[clinic.confidence] = (counts[clinic.confidence] ?? 0) + 1;
  return counts;
}, {});

console.log(`Downloaded ${placeCount} Overture places for bbox ${bbox}`);
console.log(`Wrote ${deduped.length} aesthetics candidates to public/data/clinics.json`);
console.log(`Confidence summary: ${JSON.stringify(summary)}`);

function findOvertureCli() {
  const local = resolve(".venv/bin/overturemaps");
  if (existsSync(local)) return local;
  const global = spawnSync("command", ["-v", "overturemaps"], {
    encoding: "utf8",
    shell: true
  });
  return global.status === 0 ? global.stdout.trim() : null;
}

function normalizeFeature(feature: OvertureFeature, fetchedAt: string): Clinic | null {
  const lng = feature.geometry.coordinates[0];
  const lat = feature.geometry.coordinates[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const p = feature.properties ?? {};
  const name = extractName(p);
  const categories = extractCategories(p);
  const address = extractAddress(p);
  const haystack = [name, address, ...categories, JSON.stringify(p.websites ?? ""), JSON.stringify(p.socials ?? "")].join(" ");
  const strongMatches = strongPatterns.filter((pattern) => pattern.test(haystack)).length;
  const includeMatches = includePatterns.filter((pattern) => pattern.test(haystack)).length;
  const excludeMatches = excludePatterns.filter((pattern) => pattern.test(haystack)).length;
  const hardExcludeMatches = hardExcludePatterns.filter((pattern) => pattern.test(haystack)).length;
  const overtureConfidence = Number(p.confidence ?? 0);
  const hasStrongAestheticsSignal = strongMatches > 0 || /skin care|medical spa|medi.?spa|laser hair removal|dermatologist|plastic surgeon|cosmetic surgeon/i.test(categories.join(" "));
  const hasAnyPostcode = anyPostcodePattern.test(address);
  const postcodeTail = address.match(postcodeTailPattern)?.[1];
  const hasTargetPostcodeTail = postcodeTail ? targetOutwardPostcodePattern.test(postcodeTail) : true;
  const insideTargetByAddress =
    targetPostcodePattern.test(address) ||
    (!hasAnyPostcode && hasTargetPostcodeTail && targetLocalityPattern.test(address));
  const relevanceScore = strongMatches * 5 + includeMatches * 2 + overtureConfidence * 2 - excludeMatches * 5;

  if (!name || hardExcludeMatches > 0 || !insideTargetByAddress || !hasStrongAestheticsSignal || relevanceScore < 4) return null;

  const confidence = classifyConfidence(relevanceScore, overtureConfidence);
  const sourceId = String(p.id ?? feature.id ?? `overture-${lat}-${lng}`);
  const websites = extractStringList(p.websites).filter((value) => /^https?:\/\//i.test(value));
  const phones = extractStringList(p.phones);

  return {
    id: sourceId.replace(/[^a-zA-Z0-9_-]/g, "-"),
    placeId: sourceId,
    name,
    address,
    lat,
    lng,
    status: "UNKNOWN",
    reviewStatus: classifyReviewStatus(confidence),
    confidence,
    source: "overture_maps",
    categories: categories.length ? categories : ["candidate aesthetics provider"],
    websiteUri: websites[0],
    nationalPhoneNumber: phones[0],
    fetchedAt,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    evidence: [
      {
        source: "overture_maps",
        sourceId,
        label: "Matched Overture Maps Places candidate",
        url: websites[0],
        matchedAt: fetchedAt
      }
    ]
  };
}

function extractName(properties: Record<string, unknown>) {
  const names = properties.names as Record<string, unknown> | undefined;
  if (typeof names?.primary === "string") return names.primary;
  if (typeof names?.common === "string") return names.common;
  if (names?.common && typeof names.common === "object") {
    const common = names.common as Record<string, unknown>;
    const values = Object.values(common).flatMap((value) => (Array.isArray(value) ? value : [value]));
    const first = values.find((value) => typeof value === "string");
    if (typeof first === "string") return first;
  }
  if (typeof properties.name === "string") return properties.name;
  return "";
}

function extractCategories(properties: Record<string, unknown>) {
  const raw = properties.categories ?? properties.taxonomy ?? properties.basic_category;
  const values = extractStringList(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    values.push(...extractStringList((raw as Record<string, unknown>).primary));
    values.push(...extractStringList((raw as Record<string, unknown>).alternate));
    values.push(...extractStringList((raw as Record<string, unknown>).main));
  }
  return [...new Set(values.map((value) => value.replace(/_/g, " ")))].filter(Boolean);
}

function extractAddress(properties: Record<string, unknown>) {
  const addresses = properties.addresses;
  const first = Array.isArray(addresses) ? addresses[0] : addresses;
  if (!first || typeof first !== "object") return "";
  const address = first as Record<string, unknown>;
  const freeform = extractStringList(address.freeform).join(", ");
  const locality = extractStringList(address.locality).join(", ");
  const postcode = extractStringList(address.postcode).join(", ");
  return [freeform, locality, postcode].filter(Boolean).join(", ");
}

function extractStringList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(extractStringList);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(extractStringList);
  return [];
}

function classifyConfidence(score: number, overtureConfidence: number): ClinicConfidence {
  if (score >= 10 || (score >= 7 && overtureConfidence >= 0.6)) return "high";
  if (score >= 5 || overtureConfidence >= 0.55) return "medium";
  return "low";
}

function classifyReviewStatus(_confidence: ClinicConfidence): ClinicReviewStatus {
  return "needs_review";
}

function dedupeClinics(clinics: Clinic[]) {
  const byKey = new Map<string, Clinic>();
  for (const clinic of clinics) {
    const key = `${clinic.name.toLowerCase().replace(/[^a-z0-9]/g, "")}:${clinic.lat.toFixed(3)}:${clinic.lng.toFixed(3)}`;
    const current = byKey.get(key);
    if (!current || confidenceRank(clinic.confidence) > confidenceRank(current.confidence)) {
      byKey.set(key, clinic);
    }
  }
  return [...byKey.values()].sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
}

function confidenceRank(confidence: ClinicConfidence) {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}
