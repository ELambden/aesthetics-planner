import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, GeoJSONSource, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Layers, LocateFixed, Minus, Plus, TrainFront } from "lucide-react";
import { stationRadiusPolygon, type StationAnalysis } from "../lib/stations";
import { formatNumber } from "../lib/scoring";
import type { Clinic, DensityFeatureCollection, OpportunityFeature, Station, StationRadius } from "../types/domain";

// Bundle the worker and its shared module, including the GitHub Pages base path.
maplibregl.setWorkerUrl(mapWorkerUrl);

type Props = {
  osApiKey: string;
  center: { lat: number; lng: number };
  zoom: number;
  areas: OpportunityFeature[];
  densityOverlay: DensityFeatureCollection | null;
  clinics: Clinic[];
  stations: Station[];
  showStations: boolean;
  onShowStations: (show: boolean) => void;
  selectedStation?: StationAnalysis;
  stationRadius: StationRadius;
  stationFocus: number;
  onSelectStation: (station: Station) => void;
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
  stations,
  showStations,
  onShowStations,
  selectedStation,
  stationRadius,
  stationFocus,
  onSelectStation,
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
      if (map.queryRenderedFeatures(event.point, { layers: ["clinic-points", "station-pins"].filter((id) => map.getLayer(id)) }).length) return;
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
      if (map.getLayer("station-pins") && map.queryRenderedFeatures(event.point, { layers: ["station-pins"] }).length) return;
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

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: stations.map((station) => ({ type: "Feature", geometry: { type: "Point", coordinates: [station.lng, station.lat] },
        properties: { id: station.id, name: station.name } }))
    };
    const source = map.getSource("stations") as GeoJSONSource | undefined;
    if (source) { source.setData(data); return; }
    map.addImage("station-pin", makeStationPin(), { pixelRatio: 2 });
    map.addSource("stations", { type: "geojson", data,
      attribution: '<a href="https://beta-naptan.dft.gov.uk/">NaPTAN</a> © Crown copyright · <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3.0</a>' });
    map.addLayer({ id: "station-pins", type: "symbol", source: "stations", layout: {
      "icon-image": "station-pin", "icon-anchor": "bottom", "icon-allow-overlap": true,
      "icon-ignore-placement": true, "icon-size": 0.7
    } });
    map.addSource("station-radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "station-radius-fill", type: "fill", source: "station-radius",
      paint: { "fill-color": "#2563c5", "fill-opacity": 0.12 } }, "clinic-points");
    map.addLayer({ id: "station-radius-line", type: "line", source: "station-radius",
      paint: { "line-color": "#2563c5", "line-width": 2, "line-dasharray": [3, 2] } }, "clinic-points");
  }, [mapReady, stations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer("station-pins")) return;
    for (const id of ["station-pins", "station-radius-fill", "station-radius-line"]) {
      map.setLayoutProperty(id, "visibility", showStations ? "visible" : "none");
    }
    map.setLayoutProperty("station-pins", "icon-size", ["case", ["==", ["get", "id"], selectedStation?.station.id ?? ""], 1, 0.7]);
    const source = map.getSource("station-radius") as GeoJSONSource;
    source.setData({ type: "FeatureCollection", features: selectedStation ? [stationRadiusPolygon(selectedStation.station, stationRadius)] : [] });
    const highlight = showStations && selectedStation && selectedStation.coverage !== "outside";
    map.setPaintProperty("clinic-points", "circle-opacity", highlight
      ? ["case", ["in", ["get", "id"], ["literal", selectedStation.nearby.map((item) => item.clinic.id)]], 1, 0.4]
      : 1);
  }, [mapReady, selectedStation, showStations, stationRadius]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !showStations) return;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 24 });
    const selectStation = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties.id;
      const station = stations.find((item) => item.id === id);
      popup.remove();
      if (station) onSelectStation(station);
    };
    const enterStation = (event: maplibregl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const station = stations.find((item) => item.id === event.features?.[0]?.properties.id);
      if (station) popup.setLngLat([station.lng, station.lat]).setText(station.name).addTo(map);
    };
    const leaveStation = () => { map.getCanvas().style.cursor = ""; popup.remove(); };
    map.on("click", "station-pins", selectStation);
    map.on("mouseenter", "station-pins", enterStation);
    map.on("mouseleave", "station-pins", leaveStation);
    return () => {
      popup.remove();
      map.getCanvas().style.cursor = "";
      map.off("click", "station-pins", selectStation);
      map.off("mouseenter", "station-pins", enterStation);
      map.off("mouseleave", "station-pins", leaveStation);
    };
  }, [mapReady, stations, showStations, onSelectStation]);

  useEffect(() => {
    if (!mapReady || !selectedStation) return;
    mapRef.current?.flyTo({ center: [selectedStation.station.lng, selectedStation.station.lat], zoom: 13, duration: 700 });
  }, [mapReady, selectedStation?.station.id, stationFocus]);

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
        <label className="station-layer-toggle">
          <input type="checkbox" checked={showStations} onChange={(event) => onShowStations(event.target.checked)} />
          <TrainFront aria-hidden="true" /> Stations
        </label>
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
          aria-label={selectedStation ? "Centre map on selected station" : "Centre map on selected area"}
          title={selectedStation ? `Centre map on ${selectedStation.station.name}` : selectedArea ? `Centre map on ${selectedArea.properties.areaName}` : "Select an area or station to centre the map"}
          disabled={!mapReady || (!selectedArea && !selectedStation)}
          onClick={() => selectedStation ? onSelectStation(selectedStation.station) : selectedArea && flyToArea(selectedArea)}
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

function makeStationPin(): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create station marker");
  context.beginPath();
  context.moveTo(32, 76);
  context.bezierCurveTo(24, 61, 6, 46, 6, 29);
  context.arc(32, 29, 26, Math.PI, 0);
  context.bezierCurveTo(58, 46, 40, 61, 32, 76);
  context.closePath();
  context.fillStyle = "#2563c5";
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#ffffff";
  context.fillRect(21, 17, 22, 24);
  context.fillStyle = "#2563c5";
  context.fillRect(24, 21, 16, 9);
  context.beginPath();
  context.arc(26, 36, 2, 0, Math.PI * 2);
  context.arc(38, 36, 2, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.beginPath();
  context.moveTo(26, 42); context.lineTo(22, 47);
  context.moveTo(38, 42); context.lineTo(42, 47);
  context.stroke();
  return context.getImageData(0, 0, 64, 80);
}
