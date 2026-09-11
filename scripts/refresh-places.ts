import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Clinic, ClinicConfidence, ClinicReviewStatus } from "../src/types/domain";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  businessStatus?: Clinic["status"];
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
};

type RawPlace = GooglePlace & {
  query: string;
  targetPlace: string;
};

const targetPlaces = [
  "Romford",
  "Hornchurch",
  "Upminster",
  "Rainham Havering",
  "Brentwood Essex",
  "Billericay Essex",
  "Basildon Essex",
  "Chelmsford Essex",
  "Maldon Essex",
  "Southend-on-Sea",
  "Leigh-on-Sea",
  "Rayleigh Essex",
  "Rochford Essex",
  "Grays Thurrock",
  "Lakeside Thurrock",
  "Colchester Essex",
  "Clacton-on-Sea",
  "Braintree Essex",
  "Witham Essex",
  "Harlow Essex",
  "Epping Essex",
  "Loughton Essex",
  "Saffron Walden Essex"
];

const serviceTerms = [
  "aesthetic clinic",
  "skin clinic",
  "injectables clinic",
  "botox clinic",
  "dermal fillers clinic",
  "laser skin clinic",
  "cosmetic dermatology clinic",
  "medical aesthetics clinic"
];

const includePatterns = [
  /aesthetic/i,
  /aesthetics/i,
  /skin/i,
  /laser/i,
  /inject/i,
  /botox/i,
  /filler/i,
  /cosmetic/i,
  /dermatology/i,
  /rejuvenation/i,
  /anti.?age/i,
  /medical spa/i
];

const weakBeautyPatterns = [/beauty/i, /salon/i, /spa/i, /clinic/i, /wellness/i];
const excludePatterns = [/hair/i, /nail/i, /brow/i, /lash/i, /tanning/i, /barber/i, /massage/i, /physio/i, /chiropr/i];

const apiKey = process.env.GOOGLE_PLACES_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_PLACES_API_KEY is required for data:refresh-places");
}

const rawByPlaceId = new Map<string, RawPlace>();
let requestCount = 0;

for (const targetPlace of targetPlaces) {
  for (const term of serviceTerms) {
    const query = `${term} ${targetPlace}`;
    requestCount += 1;
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.businessStatus",
          "places.rating",
          "places.userRatingCount",
          "places.types",
          "places.googleMapsUri",
          "places.websiteUri",
          "places.nationalPhoneNumber"
        ].join(",")
      },
      body: JSON.stringify({
        textQuery: query,
        regionCode: "GB",
        languageCode: "en-GB",
        maxResultCount: 20,
        locationBias: {
          rectangle: {
            low: { latitude: 51.38, longitude: -0.35 },
            high: { latitude: 52.18, longitude: 1.38 }
          }
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Places request failed for "${query}": ${response.status} ${detail}`);
    }

    const payload = (await response.json()) as { places?: GooglePlace[] };
    for (const place of payload.places ?? []) {
      if (!place.id || !place.location) continue;
      if (!isInsideTargetBounds(place.location.latitude, place.location.longitude)) continue;
      const current = rawByPlaceId.get(place.id);
      if (!current || confidenceRank(classifyPlace(place).confidence) > confidenceRank(classifyPlace(current).confidence)) {
        rawByPlaceId.set(place.id, { ...place, query, targetPlace });
      }
    }
  }
}

const fetchedAt = new Date().toISOString();
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const rawPlaces = [...rawByPlaceId.values()];
const clinics = rawPlaces.map((place) => normalizeClinic(place, fetchedAt, expiresAt));

await mkdir(resolve("generated"), { recursive: true });
await mkdir(resolve("public/data"), { recursive: true });
await writeFile(
  resolve("generated/places-raw.json"),
  JSON.stringify(
    {
      fetchedAt,
      expiresAt,
      source: "Google Places API places:searchText",
      requestCount,
      targetPlaces,
      serviceTerms,
      places: rawPlaces
    },
    null,
    2
  )
);
await writeFile(resolve("public/data/clinics.json"), JSON.stringify(clinics, null, 2));

const summary = clinics.reduce<Record<string, number>>((counts, clinic) => {
  counts[clinic.confidence] = (counts[clinic.confidence] ?? 0) + 1;
  return counts;
}, {});

console.log(`Ran ${requestCount} Google Places Text Search requests`);
console.log(`Wrote ${clinics.length} unique candidate clinics to public/data/clinics.json`);
console.log(`Confidence summary: ${JSON.stringify(summary)}`);

function normalizeClinic(place: RawPlace, fetchedAt: string, expiresAt: string): Clinic {
  const classification = classifyPlace(place);
  return {
    id: place.id.replace(/[^a-zA-Z0-9_-]/g, "-"),
    placeId: place.id,
    name: place.displayName?.text ?? "Unnamed clinic",
    address: place.formattedAddress ?? "",
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    status: place.businessStatus ?? "UNKNOWN",
    reviewStatus: classification.reviewStatus,
    confidence: classification.confidence,
    source: "google_places",
    categories: classification.categories,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    googleMapsUri: place.googleMapsUri,
    websiteUri: place.websiteUri,
    nationalPhoneNumber: place.nationalPhoneNumber,
    fetchedAt,
    expiresAt,
    evidence: [
      {
        source: "google_places",
        sourceId: place.id,
        label: `Matched Google Places query: ${place.query}`,
        url: place.googleMapsUri,
        matchedAt: fetchedAt
      }
    ]
  };
}

function classifyPlace(place: GooglePlace): {
  confidence: ClinicConfidence;
  reviewStatus: ClinicReviewStatus;
  categories: string[];
} {
  const haystack = [place.displayName?.text, place.formattedAddress, ...(place.types ?? [])].join(" ");
  const strongMatches = includePatterns.filter((pattern) => pattern.test(haystack)).length;
  const weakMatches = weakBeautyPatterns.filter((pattern) => pattern.test(haystack)).length;
  const exclusions = excludePatterns.filter((pattern) => pattern.test(haystack)).length;
  const operationalBoost = place.businessStatus === "OPERATIONAL" ? 1 : 0;
  const reviewBoost = (place.userRatingCount ?? 0) >= 10 ? 1 : 0;
  const score = strongMatches * 3 + weakMatches + operationalBoost + reviewBoost - exclusions * 3;

  const categories = new Set<string>();
  if (/aesthetic|inject|botox|filler/i.test(haystack)) categories.add("injectables/aesthetics");
  if (/skin|dermatology|rejuvenation/i.test(haystack)) categories.add("skin clinic");
  if (/laser|ipl/i.test(haystack)) categories.add("laser/IPL");
  if (/doctor|medical|health|clinic/i.test(haystack)) categories.add("medical/clinic");
  if (categories.size === 0) categories.add("candidate aesthetics provider");

  if (place.businessStatus === "CLOSED_PERMANENTLY") {
    return { confidence: "low", reviewStatus: "excluded", categories: [...categories] };
  }
  if (score >= 7) return { confidence: "high", reviewStatus: "needs_review", categories: [...categories] };
  if (score >= 3) return { confidence: "medium", reviewStatus: "needs_review", categories: [...categories] };
  return { confidence: "low", reviewStatus: "needs_review", categories: [...categories] };
}

function isInsideTargetBounds(lat: number, lng: number) {
  return lat >= 51.38 && lat <= 52.18 && lng >= -0.35 && lng <= 1.38;
}

function confidenceRank(confidence: ClinicConfidence) {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}
