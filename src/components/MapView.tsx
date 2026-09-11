import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, GeoJSONSource, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Layers, LocateFixed, Minus, Plus } from "lucide-react";
import { formatNumber } from "../lib/scoring";
import type { Clinic, DensityFeatureCollection, OpportunityFeature } from "../types/domain";

// Bundle the worker and its shared module, including the GitHub Pages base path.
maplibregl.setWorkerUrl(mapWorkerUrl);

type Props = {
  osApiKey: string;
  center: { lat: number; lng: number };
  zoom: number;
  areas: OpportunityFeature[];
  densityOverlay: DensityFeatureCollection | null;
  clinics: Clinic[];
  selectedArea?: OpportunityFeature;
  selectedClinic?: Clinic;
  onSelectArea: (area: OpportunityFeature) => void;
  onSelectClinic: (clinic: Clinic) => void;
};

const osStyleUrl = "https://api.os.uk/maps/vector/v1/vts/resources/styles?srs=3857";
const essexBounds: [[number, number], [number, number]] = [
  [-0.35, 51.38],
  [1.38, 52.18]
];

export function MapView({
  osApiKey,
  center,
  zoom,
  areas,
  densityOverlay,
  clinics,
  selectedArea,
  selectedClinic,
  onSelectArea,
  onSelectClinic
}: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [basemapLabel, setBasemapLabel] = useState(osApiKey ? "Loading OS basemap" : "OpenStreetMap basemap");

  const rankedByCode = useMemo(() => new Map(areas.map((area) => [area.properties.areaCode, area])), [areas]);
  const densityStats = useMemo(() => {
    const values = densityOverlay?.features
      .map((feature) => feature.properties.populationDensity)
      .filter((value) => Number.isFinite(value)) ?? [];
    if (!values.length) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [densityOverlay]);
  const selectedCode = selectedArea?.properties.areaCode;

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;

    let cancelled = false;
    let map: MapLibreMap | null = null;

    async function createMap() {
      const { style, label } = await getInitialStyle(osApiKey);
      if (cancelled || !mapNode.current) return;

      setBasemapLabel(label);
      map = new maplibregl.Map({
        container: mapNode.current,
        style,
        center: [center.lng, center.lat],
        zoom,
        minZoom: 7,
        maxZoom: 18,
        maxBounds: essexBounds,
        attributionControl: false
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

      map.on("load", () => setMapReady(true));
      map.on("error", () => {
        setMapError(true);
      });
      mapRef.current = map;
    }

    void createMap();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [center.lat, center.lng, osApiKey, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !densityOverlay) return;

    const source = map.getSource("density-overlay") as GeoJSONSource | undefined;
    if (source) {
      source.setData(densityOverlay);
      return;
    }

    map.addSource("density-overlay", {
      type: "geojson",
      data: densityOverlay
    });

    const firstSymbol = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;

    map.addLayer(
      {
        id: "density-fill",
        type: "fill",
        source: "density-overlay",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "densityScore"],
            20,
            "#8d3f3d",
            45,
            "#d67d4a",
            60,
            "#efc45a",
            75,
            "#67a96a",
            92,
            "#15724d"
          ],
          "fill-opacity": 0.58,
          "fill-outline-color": "rgba(255,255,255,0.05)"
        }
      },
      firstSymbol
    );

    map.addLayer({
      id: "density-selected-line",
      type: "line",
      source: "density-overlay",
      filter: ["==", ["get", "areaCode"], ""],
      paint: {
        "line-color": "#111827",
        "line-width": 2.5
      }
    });
  }, [densityOverlay, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const selectArea = (event: maplibregl.MapLayerMouseEvent) => {
      if (map.queryRenderedFeatures(event.point, { layers: ["clinic-points"] }).length) return;
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      const areaCode = feature?.properties?.areaCode as string | undefined;
      const area = areaCode ? rankedByCode.get(areaCode) : undefined;
      if (area) onSelectArea(area);
    };
    const enterArea = () => { map.getCanvas().style.cursor = "pointer"; };
    const leaveArea = () => { map.getCanvas().style.cursor = ""; };
    map.on("click", "density-fill", selectArea);
    map.on("mouseenter", "density-fill", enterArea);
    map.on("mouseleave", "density-fill", leaveArea);
    return () => {
      map.off("click", "density-fill", selectArea);
      map.off("mouseenter", "density-fill", enterArea);
      map.off("mouseleave", "density-fill", leaveArea);
    };
  }, [mapReady, onSelectArea, rankedByCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.getLayer("density-selected-line")) return;
    map.setFilter("density-selected-line", ["==", ["get", "areaCode"], selectedCode ?? ""]);
  }, [mapReady, selectedCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    const clinicGeojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: clinics.map((clinic) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [clinic.lng, clinic.lat] },
        properties: { id: clinic.id, name: clinic.name, reviewStatus: clinic.reviewStatus, confidence: clinic.confidence }
      }))
    };

    const source = map.getSource("clinics") as GeoJSONSource | undefined;
    if (source) {
      source.setData(clinicGeojson);
      updateClinicSelection(map, selectedClinic?.id);
      return;
    }

    map.addSource("clinics", { type: "geojson", data: clinicGeojson });
    map.addLayer({
      id: "clinic-points",
      type: "circle",
      source: "clinics",
      paint: {
        "circle-radius": ["case", ["==", ["get", "id"], selectedClinic?.id ?? ""], 9, 6],
        "circle-color": ["case", ["==", ["get", "confidence"], "high"], "#0f766e", ["==", ["get", "confidence"], "medium"], "#b45309", "#7c2d12"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2
      }
    });
  }, [clinics, mapReady, selectedClinic?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const selectClinic = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      const id = feature?.properties?.id as string | undefined;
      const clinic = clinics.find((candidate) => candidate.id === id);
      if (clinic) onSelectClinic(clinic);
    };
    const enterClinic = () => { map.getCanvas().style.cursor = "pointer"; };
    const leaveClinic = () => { map.getCanvas().style.cursor = ""; };
    map.on("click", "clinic-points", selectClinic);
    map.on("mouseenter", "clinic-points", enterClinic);
    map.on("mouseleave", "clinic-points", leaveClinic);
    return () => {
      map.off("click", "clinic-points", selectClinic);
      map.off("mouseenter", "clinic-points", enterClinic);
      map.off("mouseleave", "clinic-points", leaveClinic);
    };
  }, [clinics, mapReady, onSelectClinic]);

  useEffect(() => {
    if (!mapReady || !selectedClinic) return;
    mapRef.current?.flyTo({ center: [selectedClinic.lng, selectedClinic.lat], zoom: 13.4, duration: 700 });
  }, [mapReady, selectedClinic]);

  function flyToArea(area: OpportunityFeature) {
    mapRef.current?.flyTo({ center: area.properties.centroid, zoom: 12.2, duration: 700 });
    onSelectArea(area);
  }

  return (
    <section className="map-shell" aria-label="Opportunity map">
      <div className="map-toolbar">
        <div>
          <Layers aria-hidden="true" />
          <span>{basemapLabel}</span>
        </div>
      </div>

      <div ref={mapNode} className="google-map" />
      {mapError && <div className="map-error">Some map features could not load. Reload to try again.</div>}

      <div className="density-scale" aria-label="Population density scale">
        <div className="scale-ramp" aria-hidden="true" />
        <div className="scale-labels">
          <span>{densityStats ? `${formatNumber(densityStats.min)}/km²` : "—"}</span>
          <span>{densityStats ? `${formatNumber(densityStats.max)}/km²` : "—"}</span>
        </div>
      </div>

      <div className="map-controls" role="group" aria-label="Map controls">
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={!mapReady}
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
        >
          <Plus aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={!mapReady}
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Centre map on selected area"
          title={selectedArea ? `Centre map on ${selectedArea.properties.areaName}` : "Select an area to centre the map"}
          disabled={!mapReady || !selectedArea}
          onClick={() => selectedArea && flyToArea(selectedArea)}
        >
          <LocateFixed aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

async function getInitialStyle(osApiKey: string): Promise<{ style: StyleSpecification; label: string }> {
  if (!osApiKey) return { style: fallbackStyle(), label: "OpenStreetMap basemap" };

  try {
    const response = await fetch(`${osStyleUrl}&key=${encodeURIComponent(osApiKey)}`);
    if (!response.ok) throw new Error("OS style request failed");
    const style = (await response.json()) as StyleSpecification;
    const keyedTileUrl = `https://api.os.uk/maps/vector/v1/vts/tile/{z}/{y}/{x}.pbf?key=${encodeURIComponent(
      osApiKey
    )}&srs=3857`;

    return {
      style: {
        ...style,
        sources: {
          ...style.sources,
          esri: {
            type: "vector",
            tiles: [keyedTileUrl],
            maxzoom: 15,
            attribution: "Contains OS data © Crown copyright and database rights"
          }
        }
      },
      label: "OS Vector Tile basemap"
    };
  } catch {
    return { style: fallbackStyle(), label: "OpenStreetMap basemap" };
  }
}

function updateClinicSelection(map: MapLibreMap, selectedClinicId?: string) {
  if (!map.getLayer("clinic-points")) return;
  map.setPaintProperty("clinic-points", "circle-radius", [
    "case",
    ["==", ["get", "id"], selectedClinicId ?? ""],
    9,
    6
  ]);
}

function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm"
      }
    ]
  };
}
