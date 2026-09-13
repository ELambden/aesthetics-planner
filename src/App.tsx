import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe, RefreshCw, ShieldCheck } from "lucide-react";
import { AreaDetail } from "./components/AreaDetail";
import { ClinicPanel } from "./components/ClinicPanel";
import { MapView } from "./components/MapView";
import { RankedZones } from "./components/RankedZones";
import { StationPanel } from "./components/StationPanel";
import { analyseStations } from "./lib/stations";
import { ScoreControls } from "./components/ScoreControls";
import { getAreas, getClinics, getConfig, getDensityOverlay, getStations, MAP_LOAD_ERROR } from "./lib/api";
import { PRESET_WEIGHTS } from "./lib/scoring";
import type {
  AppConfig,
  Clinic,
  ClinicReviewStatus,
  DensityFeatureCollection,
  OpportunityFeature,
  ScorePreset,
  ScoreWeights,
  Station,
  StationDataset,
  StationRadius
} from "./types/domain";

const initialConfig: AppConfig = {
  googleMapsKey: "",
  osApiKey: "",
  mapCenter: { lat: 51.66, lng: 0.42 },
  mapZoom: 9,
  accessProtected: false
};

function App() {
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [preset, setPreset] = useState<ScorePreset>("balanced");
  const [weights, setWeights] = useState<ScoreWeights>(PRESET_WEIGHTS.balanced);
  const [areas, setAreas] = useState<OpportunityFeature[]>([]);
  const [densityOverlay, setDensityOverlay] = useState<DensityFeatureCollection | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [stationData, setStationData] = useState<StationDataset>();
  const [stationRadius, setStationRadius] = useState<StationRadius>(1);
  const [showStations, setShowStations] = useState(true);
  const [selectedStationId, setSelectedStationId] = useState<string>();
  const [stationFocus, setStationFocus] = useState(0);
  const [clinicStatus, setClinicStatus] = useState<ClinicReviewStatus | "all">("all");
  const [selectedArea, setSelectedArea] = useState<OpportunityFeature>();
  const [selectedClinic, setSelectedClinic] = useState<Clinic>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    try {
      const nextConfig = await getConfig();
      const [nextAreas, nextClinics, nextDensityOverlay, nextStations] = await Promise.all([
        getAreas(weights),
        getClinics("all"),
        getDensityOverlay(),
        getStations()
      ]);
      if (requestId !== latestRequest.current) return;
      setConfig(nextConfig);
      setAreas(nextAreas.features);
      setDensityOverlay(nextDensityOverlay);
      setClinics(nextClinics);
      setStationData(nextStations);
      setSelectedArea((current) =>
        nextAreas.features.find((area) => area.properties.areaCode === current?.properties.areaCode)
          ?? nextAreas.features[0]
      );
    } catch {
      if (requestId === latestRequest.current) {
        setError(MAP_LOAD_ERROR);
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [weights]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function changePreset(nextPreset: ScorePreset) {
    setPreset(nextPreset);
    setWeights(PRESET_WEIGHTS[nextPreset]);
  }

  const visibleClinics = useMemo(() => clinics.filter((clinic) => clinicStatus === "all" || clinic.reviewStatus === clinicStatus), [clinics, clinicStatus]);
  const stationAnalyses = useMemo(() => analyseStations(stationData?.stations ?? [], clinics, stationRadius), [stationData, clinics, stationRadius]);
  const selectedStation = stationAnalyses.find((item) => item.station.id === selectedStationId);

  function selectArea(area: OpportunityFeature) {
    setSelectedArea(area);
    setSelectedStationId(undefined);
  }

  function selectStation(station: Station) {
    setSelectedStationId(station.id);
    setSelectedClinic(undefined);
    setSelectedArea(areas.find((area) => area.properties.areaCode === station.areaCode));
    setShowStations(true);
    setStationFocus((value) => value + 1);
  }

  function selectNearbyClinic(clinic: Clinic) {
    setClinicStatus("all");
    setSelectedClinic(clinic);
  }

  const staleClinics = useMemo(
    () => clinics.filter((clinic) => new Date(clinic.expiresAt).getTime() < Date.now()).length,
    [clinics]
  );

  if (error || (loading && areas.length === 0)) {
    return (
      <main className="auth-screen">
        <section className="auth-panel" role={error ? "alert" : "status"}>
          <ShieldCheck aria-hidden="true" />
          <h1>Essex Opportunity Map</h1>
          <p>{error || "Loading map…"}</p>
          {error && <button onClick={() => window.location.reload()}>Reload map</button>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Essex Aesthetics Opportunity Map</h1>
          <span>ONS 2021 LSOA density over {config.osApiKey ? "OS Vector Tiles" : "OpenStreetMap"}</span>
        </div>
        <div className="topbar-actions">
          <div className="private-badge">
            {config.accessProtected ? <ShieldCheck aria-hidden="true" /> : <Globe aria-hidden="true" />}
            <span>{config.accessProtected ? "Private analysis" : "Location analysis"}</span>
          </div>
          <button className="icon-button" type="button" onClick={() => void loadData()} title="Refresh data">
            <RefreshCw aria-hidden="true" className={loading ? "spin" : ""} />
          </button>
          {config.accessProtected && <a href="/cdn-cgi/access/logout">Sign out</a>}
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <ScoreControls
            preset={preset}
            weights={weights}
            onPresetChange={changePreset}
            onWeightsChange={setWeights}
          />
          <RankedZones
            areas={areas}
            selectedAreaCode={selectedArea?.properties.areaCode}
            onSelect={selectArea}
          />
        </aside>

        <MapView
          osApiKey={config.osApiKey}
          center={config.mapCenter}
          zoom={config.mapZoom}
          areas={areas}
          densityOverlay={densityOverlay}
          clinics={visibleClinics}
          stations={stationData?.stations ?? []}
          showStations={showStations}
          onShowStations={setShowStations}
          selectedStation={selectedStation}
          stationRadius={stationRadius}
          stationFocus={stationFocus}
          onSelectStation={selectStation}
          selectedArea={selectedArea}
          selectedClinic={selectedClinic}
          onSelectArea={selectArea}
          onSelectClinic={setSelectedClinic}
        />

        <aside className="right-rail">
          <AreaDetail area={selectedArea} />
          {stationData && <StationPanel dataset={stationData} analyses={stationAnalyses}
            selectedStationId={selectedStationId} radius={stationRadius}
            onRadiusChange={setStationRadius} onSelect={selectStation}
            onClear={() => setSelectedStationId(undefined)} onSelectClinic={selectNearbyClinic} />}
          <ClinicPanel
            googleMapsKey={config.googleMapsKey}
            clinics={visibleClinics}
            selectedClinic={selectedClinic}
            statusFilter={clinicStatus}
            onStatusFilter={setClinicStatus}
            onSelectClinic={setSelectedClinic}
          />
          {staleClinics > 0 && (
            <div className="stale-warning">{staleClinics} Places records need refresh.</div>
          )}
        </aside>
      </div>
    </main>
  );
}

export default App;
