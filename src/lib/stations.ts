import type { Feature, Polygon } from "geojson";
import type { Clinic, Station, StationRadius } from "../types/domain";

const EARTH_RADIUS_KM = 6371;
const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (angle: number) => angle * 180 / Math.PI;

export type StationAnalysis = {
  station: Station;
  coverage: "inside" | "edge" | "outside";
  count500m: number;
  count1km: number;
  count: number;
  nearest?: { clinic: Clinic; distanceKm: number };
  nearby: Array<{ clinic: Clinic; distanceKm: number }>;
};

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function stationCoverage(station: Station, radius: StationRadius): StationAnalysis["coverage"] {
  if (!station.inStudyArea) return "outside";
  // Conservative margin for the source boundaries and local projection approximation.
  return station.boundaryDistanceKm <= radius + 0.025 ? "edge" : "inside";
}

export function analyseStations(stations: Station[], clinics: Clinic[], radius: StationRadius): StationAnalysis[] {
  const eligible = clinics.filter((clinic) => clinic.reviewStatus !== "excluded" && clinic.status !== "CLOSED_PERMANENTLY");
  return stations.map((station) => {
    const distances = eligible.map((clinic) => ({ clinic, distanceKm: distanceKm(station, clinic) }))
      .sort((a, b) => a.distanceKm - b.distanceKm || a.clinic.id.localeCompare(b.clinic.id));
    const nearby = distances.filter((item) => item.distanceKm <= radius + 1e-9);
    return {
      station, coverage: stationCoverage(station, radius),
      count500m: distances.filter((item) => item.distanceKm <= 0.5 + 1e-9).length,
      count1km: distances.filter((item) => item.distanceKm <= 1 + 1e-9).length,
      count: nearby.length, nearest: distances[0], nearby
    };
  }).sort((a, b) => {
    const outsideOrder = Number(a.coverage === "outside") - Number(b.coverage === "outside");
    if (outsideOrder) return outsideOrder;
    if (a.coverage !== "outside" && a.count !== b.count) return a.count - b.count;
    return a.station.name.localeCompare(b.station.name);
  });
}

export function stationRadiusPolygon(station: Station, radiusKm: StationRadius): Feature<Polygon> {
  const latitude = radians(station.lat);
  const longitude = radians(station.lng);
  const angle = radiusKm / EARTH_RADIUS_KM;
  const ring: number[][] = [];
  for (let step = 0; step < 64; step += 1) {
    const bearing = 2 * Math.PI * step / 64;
    const lat = Math.asin(Math.sin(latitude) * Math.cos(angle) + Math.cos(latitude) * Math.sin(angle) * Math.cos(bearing));
    const lng = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(latitude), Math.cos(angle) - Math.sin(latitude) * Math.sin(lat));
    ring.push([degrees(lng), degrees(lat)]);
  }
  ring.push([...ring[0]]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function stationRadiusLabel(radius: StationRadius) {
  return radius === 0.5 ? "500 m" : "1 km";
}
