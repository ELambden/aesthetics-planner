import type {
  OpportunityFeature,
  OpportunityFeatureCollection,
  ScorePreset,
  ScoreWeights
} from "../types/domain";

export const PRESET_WEIGHTS: Record<ScorePreset, ScoreWeights> = {
  balanced: { density: 35, access: 40, affluence: 25 },
  "density-gap": { density: 42, access: 48, affluence: 10 },
  "affluent-demand": { density: 22, access: 24, affluence: 54 }
};

export function clampScore(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreFeature(feature: OpportunityFeature, weights: ScoreWeights): OpportunityFeature {
  const total = Math.max(1, weights.density + weights.access + weights.affluence);
  const p = feature.properties;
  const overallScore = clampScore(
    (p.densityScore * weights.density +
      p.accessGapScore * weights.access +
      p.affluenceScore * weights.affluence) /
      total
  );

  return {
    ...feature,
    properties: {
      ...p,
      overallScore
    }
  };
}

export function rankFeatures(
  collection: OpportunityFeatureCollection,
  weights: ScoreWeights
): OpportunityFeatureCollection {
  const ranked = collection.features
    .map((feature) => scoreFeature(feature, weights))
    .sort((a, b) => b.properties.overallScore - a.properties.overallScore)
    .map((feature, index) => ({
      ...feature,
      properties: {
        ...feature.properties,
        rank: index + 1
      }
    }));

  return {
    ...collection,
    features: ranked
  };
}

export function opportunityColor(score: number) {
  if (score >= 78) return "#177245";
  if (score >= 66) return "#4f9d69";
  if (score >= 54) return "#f2b84b";
  if (score >= 42) return "#e17b45";
  return "#a8473c";
}

export function formatKm(value: number) {
  return `${value.toFixed(value < 10 ? 1 : 0)} km`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(Math.round(value));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}
