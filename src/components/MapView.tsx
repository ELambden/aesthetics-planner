import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, GeoJSONSource, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Layers, MapPinned } from "lucide-react";
import { formatNumber } from "../lib/scoring";
import type { Clinic, DensityFeatureCollection, OpportunityFeature } from "../types/domain";

type Props = {
  googleMapsKey: string;
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
  googleMapsKey,
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
  const [basemapLabel, setBasemapLabel] = useState(osApiKey ? "Loading OS basemap" : "Open fallback basemap");

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
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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

    map.on("click", "density-fill", (event) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      const areaCode = feature?.properties?.areaCode as string | undefined;
      const area = areaCode ? rankedByCode.get(areaCode) : undefined;
      if (area) onSelectArea(area);
    });

    map.on("mouseenter", "density-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "density-fill", () => {
      map.getCanvas().style.cursor = "";
    });
  }, [densityOverlay, mapReady, onSelectArea, rankedByCode]);

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

    map.on("click", "clinic-points", (event) => {
      const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
      const id = feature?.properties?.id as string | undefined;
      const clinic = clinics.find((candidate) => candidate.id === id);
      if (clinic) onSelectClinic(clinic);
    });
  }, [clinics, mapReady, onSelectClinic, selectedClinic?.id]);

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
        <div className="density-scale" aria-label="Population density scale">
          <div className="scale-title">Population density</div>
          <div className="scale-ramp" />
          <div className="scale-labels">
            <span>{densityStats ? `${formatNumber(densityStats.min)}/km2` : "Low"}</span>
            <span>{densityStats ? `${formatNumber(densityStats.max)}/km2` : "High"}</span>
          </div>
          <div className="scale-notes">Low · Moderate · High</div>
        </div>
      </div>

      <div ref={mapNode} className="google-map" />
      {mapError && <div className="map-error">Some basemap tiles failed; density data remains interactive.</div>}

      <div className="street-view-panel">
        <div className="street-title">
          <MapPinned aria-hidden="true" />
          <span>{selectedArea ? selectedArea.properties.areaName : "Selected zone"}</span>
        </div>
        <div className="zone-actions">
          {selectedArea && (
            <button type="button" onClick={() => flyToArea(selectedArea)}>
              Centre map
            </button>
          )}
          {selectedClinic && googleMapsKey && (
            <iframe
              title={`Street View for ${selectedClinic.name}`}
              className="street-view"
              src={`https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(
                googleMapsKey
              )}&location=${selectedClinic.lat},${selectedClinic.lng}&heading=40&pitch=0&fov=80`}
              loading="lazy"
            />
          )}
          {!selectedClinic && <div className="street-placeholder">Select areas to inspect density; clinics come next.</div>}
        </div>
      </div>
    </section>
  );
}

async function getInitialStyle(osApiKey: string): Promise<{ style: StyleSpecification; label: string }> {
  if (!osApiKey) return { style: fallbackStyle(), label: "Open fallback basemap" };

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
    return { style: fallbackStyle(), label: "Open fallback basemap" };
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
