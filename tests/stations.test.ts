import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { analyseStations, distanceKm, stationCoverage, stationRadiusPolygon } from "../src/lib/stations";
import { sampleClinics } from "../src/data/sampleData";
import type { Clinic, Station, StationDataset } from "../src/types/domain";

const station: Station = { id: "one", name: "One", lat: 51.5, lng: 0, modes: ["Rail"], locality: "Test", sourceIds: ["one"], inStudyArea: true, boundaryDistanceKm: 2 };
const clinic = (id: string, lat: number, extra: Partial<Clinic> = {}): Clinic => ({ ...sampleClinics[0], id, lat, lng: 0, status: "UNKNOWN", reviewStatus: "needs_review", ...extra });

describe("station proximity analysis", () => {
  it("uses kilometre distances and handles coincident and antipodal points", () => {
    expect(distanceKm({lat: 0, lng: 0}, {lat: 0, lng: 1})).toBeCloseTo(111.195, 3);
    expect(distanceKm(station, station)).toBe(0);
    expect(distanceKm({lat: 0, lng: 0}, {lat: 0, lng: 180})).toBeCloseTo(Math.PI * 6371, 6);
  });

  it("counts both radii, orders nearby clinics and excludes rejected and permanently closed records", () => {
    const clinics = [clinic("far", 51.52), clinic("middle", 51.507), clinic("near", 51.502),
      clinic("rejected", 51.5001, {reviewStatus: "excluded"}), clinic("closed", 51.5002, {status: "CLOSED_PERMANENTLY"})];
    const [small] = analyseStations([station], clinics, 0.5);
    const [large] = analyseStations([station], clinics, 1);
    expect(small.count500m).toBe(1);
    expect(small.count1km).toBe(2);
    expect(small.count).toBe(1);
    expect(large.count).toBe(2);
    expect(large.nearby.map(item => item.clinic.id)).toEqual(["near", "middle"]);
    expect(large.nearest?.clinic.id).toBe("near");
  });

  it("includes a clinic on the radius boundary despite floating-point rounding", () => {
    const boundary = clinic("boundary", station.lat + 0.5 / 6371 * 180 / Math.PI);
    expect(analyseStations([station], [boundary], 0.5)[0].count).toBe(1);
  });

  it("keeps unavailable coverage separate from a measured zero and changes boundary flags with radius", () => {
    const outside = {...station, id: "outside", name: "A outside", inStudyArea: false};
    const edge = {...station, boundaryDistanceKm: 0.75};
    expect(stationCoverage(outside, 0.5)).toBe("outside");
    expect(stationCoverage(edge, 0.5)).toBe("inside");
    expect(stationCoverage(edge, 1)).toBe("edge");
    expect(stationCoverage({...station, boundaryDistanceKm: 0.51}, 0.5)).toBe("edge");
    const ranked = analyseStations([outside, station], [], 1);
    expect(ranked.map(item => item.station.id)).toEqual(["one", "outside"]);
    expect(ranked[0].count).toBe(0);
    expect(ranked[0].nearest).toBeUndefined();
  });

  it("sorts the study-area shortlist by clinic count", () => {
    const other = {...station, id: "quiet", name: "Quiet", lat: 51.7};
    expect(analyseStations([station, other], [clinic("near", 51.502)], 1).map(item => item.station.id)).toEqual(["quiet", "one"]);
  });

  it.each([0.5, 1] as const)("draws a closed %s km radius matching the distance measure", (radius) => {
    const ring = stationRadiusPolygon(station, radius).geometry.coordinates[0];
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const [lng, lat] of ring) expect(distanceKm(station, {lng, lat})).toBeCloseTo(radius, 7);
  });
});

describe("real station snapshot", () => {
  it("includes regional rail and tube stations, combines Upminster interchange, and flags London coverage", async () => {
    const {stations} = JSON.parse(await readFile("public/data/stations.json", "utf8")) as StationDataset;
    for (const name of ["Chelmsford", "Colchester", "Romford", "Chingford", "Epping", "Beaulieu Park"])
      expect(stations.some(station => station.name === name)).toBe(true);
    const upminster = stations.filter(station => station.name === "Upminster");
    expect(upminster).toHaveLength(1);
    expect(upminster[0].modes).toEqual(expect.arrayContaining(["Rail", "Underground"]));
    expect(upminster[0].inStudyArea).toBe(true);
    expect(stations.find(station => station.name === "Epping")?.inStudyArea).toBe(true);
    expect(stations.find(station => station.name === "Liverpool Street")?.inStudyArea).toBe(false);
    const sourceIds = stations.flatMap(station => station.sourceIds);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
  });
});
