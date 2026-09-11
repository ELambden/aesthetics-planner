import type { Feature, FeatureCollection, Polygon } from "geojson";

export type ScorePreset = "balanced" | "density-gap" | "affluent-demand";

export type ClinicReviewStatus = "confirmed" | "needs_review" | "excluded";
export type ClinicSource = "google_places" | "overture_maps" | "companies_house" | "cqc" | "save_face" | "jccp" | "manual";
export type ClinicConfidence = "high" | "medium" | "low";

export type ClinicEvidence = {
  source: ClinicSource;
  sourceId?: string;
  label: string;
  url?: string;
  matchedAt: string;
};

export type Clinic = {
  id: string;
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  status: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";
  reviewStatus: ClinicReviewStatus;
  confidence: ClinicConfidence;
  source: ClinicSource;
  categories: string[];
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  fetchedAt: string;
  expiresAt: string;
  evidence?: ClinicEvidence[];
  notes?: string;
};

export type OpportunityProperties = {
  areaCode: string;
  areaName: string;
  localAuthority: string;
  population: number;
  populationDensity: number;
  targetAgeShare: number;
  imdDecile: number;
  propertyMedian: number;
  nearestClinicKm: number;
  clinicCount2Km: number;
  clinicCount5Km: number;
  clinicCount10Km: number;
  densityScore: number;
  accessGapScore: number;
  affluenceScore: number;
  overallScore: number;
  rank: number;
  centroid: [number, number];
};

export type OpportunityFeature = Feature<Polygon, OpportunityProperties>;

export type OpportunityFeatureCollection = FeatureCollection<Polygon, OpportunityProperties>;

export type DensityProperties = OpportunityProperties & {
  densityClass: number;
};

export type DensityFeatureCollection = FeatureCollection<Polygon, DensityProperties>;

export type ScoreWeights = {
  density: number;
  access: number;
  affluence: number;
};

export type AppConfig = {
  googleMapsKey: string;
  osApiKey: string;
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  accessProtected: boolean;
};
