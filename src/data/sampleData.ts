import type { Clinic, OpportunityFeatureCollection } from "../types/domain";

const now = "2026-09-09T00:00:00.000Z";
const expires = "2026-10-09T00:00:00.000Z";

export const sampleClinics: Clinic[] = [
  {
    id: "clinic-romford-1",
    placeId: "sample-romford-1",
    name: "Romford Skin & Aesthetics",
    address: "South Street, Romford",
    lat: 51.577,
    lng: 0.183,
    status: "OPERATIONAL",
    reviewStatus: "confirmed",
    confidence: "high",
    source: "google_places",
    categories: ["skin clinic", "injectables"],
    rating: 4.7,
    userRatingCount: 94,
    fetchedAt: now,
    expiresAt: expires
  },
  {
    id: "clinic-brentwood-1",
    placeId: "sample-brentwood-1",
    name: "Brentwood Aesthetic Clinic",
    address: "High Street, Brentwood",
    lat: 51.621,
    lng: 0.304,
    status: "OPERATIONAL",
    reviewStatus: "confirmed",
    confidence: "high",
    source: "google_places",
    categories: ["medical spa", "laser"],
    rating: 4.9,
    userRatingCount: 71,
    fetchedAt: now,
    expiresAt: expires
  },
  {
    id: "clinic-chelmsford-1",
    placeId: "sample-chelmsford-1",
    name: "Chelmsford Cosmetic Dermatology",
    address: "Moulsham Street, Chelmsford",
    lat: 51.732,
    lng: 0.474,
    status: "OPERATIONAL",
    reviewStatus: "needs_review",
    confidence: "medium",
    source: "google_places",
    categories: ["cosmetic dermatology"],
    rating: 4.5,
    userRatingCount: 43,
    fetchedAt: now,
    expiresAt: expires
  },
  {
    id: "clinic-southend-1",
    placeId: "sample-southend-1",
    name: "Southend Laser & Skin",
    address: "Queens Road, Southend-on-Sea",
    lat: 51.541,
    lng: 0.713,
    status: "OPERATIONAL",
    reviewStatus: "confirmed",
    confidence: "high",
    source: "google_places",
    categories: ["laser", "skin clinic"],
    rating: 4.4,
    userRatingCount: 58,
    fetchedAt: now,
    expiresAt: expires
  },
  {
    id: "clinic-colchester-1",
    placeId: "sample-colchester-1",
    name: "Colchester Facial Aesthetics",
    address: "Head Street, Colchester",
    lat: 51.889,
    lng: 0.899,
    status: "OPERATIONAL",
    reviewStatus: "needs_review",
    confidence: "medium",
    source: "google_places",
    categories: ["injectables", "skin clinic"],
    rating: 4.8,
    userRatingCount: 39,
    fetchedAt: now,
    expiresAt: expires
  }
];

export const sampleAreas: OpportunityFeatureCollection = {
  type: "FeatureCollection",
  features: [
    area("E01000001", "Upminster & Cranham", "Havering", 51.56, 0.25, 8500, 4720, 38, 8, 557000, 5.8, 0, 1, 2, 78, 74, 88, 82),
    area("E01000002", "Hornchurch North", "Havering", 51.56, 0.22, 9200, 6810, 36, 7, 472000, 3.4, 0, 2, 3, 89, 62, 74, 75),
    area("E01000003", "Romford Town", "Havering", 51.58, 0.18, 10700, 8360, 34, 5, 386000, 0.8, 2, 4, 7, 94, 28, 52, 56),
    area("E01000004", "Rainham & Wennington", "Havering", 51.51, 0.19, 7900, 3680, 35, 4, 352000, 6.9, 0, 1, 3, 59, 82, 43, 64),
    area("E01000005", "Brentwood West", "Brentwood", 51.62, 0.3, 7600, 4210, 39, 9, 604000, 1.1, 1, 2, 4, 65, 35, 95, 65),
    area("E01000006", "Billericay Central", "Basildon", 51.63, 0.42, 8100, 5020, 40, 8, 538000, 7.1, 0, 1, 3, 75, 84, 89, 82),
    area("E01000007", "Chelmsford South", "Chelmsford", 51.72, 0.47, 9600, 6210, 37, 7, 444000, 1.5, 1, 3, 6, 83, 39, 71, 62),
    area("E01000008", "Maldon & Heybridge", "Maldon", 51.73, 0.69, 7200, 2920, 41, 7, 421000, 15.2, 0, 0, 1, 47, 96, 73, 72),
    area("E01000009", "Southend Westcliff", "Southend-on-Sea", 51.54, 0.69, 11600, 9220, 35, 5, 338000, 1.4, 1, 3, 5, 97, 41, 50, 61),
    area("E01000010", "Thurrock Lakeside", "Thurrock", 51.49, 0.28, 8800, 4890, 33, 4, 316000, 9.8, 0, 1, 4, 71, 88, 38, 67),
    area("E01000011", "Colchester Lexden", "Colchester", 51.89, 0.88, 7900, 4090, 38, 8, 466000, 1.2, 1, 2, 3, 63, 36, 82, 61),
    area("E01000012", "Harlow East", "Harlow", 51.77, 0.1, 9100, 7040, 34, 3, 298000, 12.4, 0, 0, 2, 91, 94, 29, 71)
  ]
};

function area(
  areaCode: string,
  areaName: string,
  localAuthority: string,
  lat: number,
  lng: number,
  population: number,
  populationDensity: number,
  targetAgeShare: number,
  imdDecile: number,
  propertyMedian: number,
  nearestClinicKm: number,
  clinicCount2Km: number,
  clinicCount5Km: number,
  clinicCount10Km: number,
  densityScore: number,
  accessGapScore: number,
  affluenceScore: number,
  overallScore: number
) {
  const dx = 0.028;
  const dy = 0.018;
  return {
    type: "Feature" as const,
    properties: {
      areaCode,
      areaName,
      localAuthority,
      population,
      populationDensity,
      targetAgeShare,
      imdDecile,
      propertyMedian,
      nearestClinicKm,
      clinicCount2Km,
      clinicCount5Km,
      clinicCount10Km,
      densityScore,
      accessGapScore,
      affluenceScore,
      overallScore,
      rank: 0,
      centroid: [lng, lat] as [number, number]
    },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [lng - dx, lat - dy],
          [lng + dx, lat - dy],
          [lng + dx, lat + dy],
          [lng - dx, lat + dy],
          [lng - dx, lat - dy]
        ]
      ]
    }
  };
}
