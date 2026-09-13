import { useEffect, useRef, useState } from "react";
import { LocateFixed, TrainFront, X } from "lucide-react";
import { formatKm } from "../lib/scoring";
import { stationRadiusLabel, type StationAnalysis } from "../lib/stations";
import type { Clinic, Station, StationDataset, StationRadius } from "../types/domain";

type Props = {
  dataset: StationDataset;
  analyses: StationAnalysis[];
  selectedStationId?: string;
  radius: StationRadius;
  onRadiusChange: (radius: StationRadius) => void;
  onSelect: (station: Station) => void;
  onClear: () => void;
  onSelectClinic: (clinic: Clinic) => void;
};

export function StationPanel({ dataset, analyses, selectedStationId, radius, onRadiusChange, onSelect, onClear, onSelectClinic }: Props) {
  const [query, setQuery] = useState("");
  const [includeOutside, setIncludeOutside] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const selected = analyses.find((item) => item.station.id === selectedStationId);
  const radiusLabel = stationRadiusLabel(radius);
  const search = query.trim().toLocaleLowerCase();
  const listed = analyses.filter((item) => (includeOutside || item.coverage !== "outside") &&
    `${item.station.name} ${item.station.locality}`.toLocaleLowerCase().includes(search));

  useEffect(() => {
    if (selectedStationId) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedStationId]);

  return (
    <section className="panel station-panel" aria-label="Stations and nearby clinics">
      <div className="panel-title panel-title-rich">
        <div className="panel-icon station-icon"><TrainFront aria-hidden="true" /></div>
        <div>
          <h2>Stations</h2>
          <span>{dataset.stations.filter((station) => station.inStudyArea).length} in study area · {dataset.stations.length} across map</span>
        </div>
      </div>
      <div className="station-options">
        <div className="station-radius-control">
          <span id="station-radius-label">Nearby clinic radius</span>
          <div role="group" aria-labelledby="station-radius-label">
            {([0.5, 1] as const).map((value) => (
              <button key={value} type="button" aria-pressed={radius === value} onClick={() => onRadiusChange(value)}>
                {stationRadiusLabel(value)}
              </button>
            ))}
          </div>
        </div>
        <label className="station-search">
          <span>Find a station</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Station name or locality" />
        </label>
        <label className="station-outside-toggle">
          <input type="checkbox" checked={includeOutside} onChange={(event) => setIncludeOutside(event.target.checked)} />
          <span>Include stations outside study area</span>
        </label>
      </div>

      {selected && (
        <div className="station-detail" ref={detailRef}>
          <div className="station-detail-heading">
            <h3>{selected.station.name}</h3>
            <button type="button" onClick={onClear} aria-label="Clear selected station" title="Clear selected station"><X aria-hidden="true" /></button>
          </div>
          <p className="station-description">{selected.station.modes.join(" · ")} · {selected.station.locality}</p>
          <button className="station-centre" type="button" onClick={() => onSelect(selected.station)}>
            <LocateFixed aria-hidden="true" /> Centre on station
          </button>
          {selected.coverage === "outside" ? (
            <p className="station-coverage-note">Outside the Essex/Havering study area. Clinic coverage here has not been assessed, so this station is excluded from the opportunity shortlist.</p>
          ) : (
            <>
              {selected.coverage === "edge" && <p className="station-coverage-note">This radius reaches the study-area boundary. Nearby clinic counts may be incomplete.</p>}
              <div className="station-counts">
                <div><span>Within 500 m</span><strong>{selected.count500m}</strong></div>
                <div><span>Within 1 km</span><strong>{selected.count1km}</strong></div>
              </div>
              {selected.nearest ? (
                <button className="station-nearest" type="button" onClick={() => onSelectClinic(selected.nearest!.clinic)}>
                  <span>Nearest mapped clinic</span>
                  <strong>{selected.nearest.clinic.name}</strong>
                  <span>{formatKm(selected.nearest.distanceKm)} · straight-line distance</span>
                </button>
              ) : <p>No eligible clinic records are available.</p>}
              <p className="station-nearby-title">{selected.count ? `${selected.count} mapped ${selected.count === 1 ? "clinic" : "clinics"} within ${radiusLabel}` : `No mapped clinics within ${radiusLabel}.`}</p>
              {selected.nearby.length > 0 && (
                <div className="station-nearby-list" aria-label="Clinics within station radius">
                  {selected.nearby.map(({ clinic, distanceKm }) => (
                    <button type="button" key={clinic.id} onClick={() => onSelectClinic(clinic)}>
                      <span>{clinic.name}</span><span>{Math.round(distanceKm * 1000)} m</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="station-list-heading">{listed.length} stations · fewest nearby clinics first</div>
      <div className="station-list" aria-label="Station shortlist">
        {listed.map((item) => (
          <button className={item.station.id === selectedStationId ? "station-row selected" : "station-row"}
            type="button" key={item.station.id} aria-pressed={item.station.id === selectedStationId} onClick={() => onSelect(item.station)}>
            <TrainFront aria-hidden="true" />
            <span className="station-row-main">
              <strong>{item.station.name}</strong>
              <small>{item.coverage === "outside" ? "Outside study area" : item.coverage === "edge" ? "Study-area boundary" : item.station.modes.join(" · ")}</small>
            </span>
            <span className="station-row-count">{item.coverage === "outside" ? "Not assessed" : <><strong>{item.count}</strong><small>within {radiusLabel}</small></>}</span>
          </button>
        ))}
        {!listed.length && <p className="station-empty">No matching stations. Try another name or include stations outside the study area.</p>}
      </div>
      <details className="station-data-note">
        <summary>About these counts and station data</summary>
        <p>Distances are straight-line distances from station access points. Counts use all mapped clinic candidates, including unreviewed records, and exclude rejected or permanently closed records. Clinic display filters do not change these counts.</p>
        <p>A low count suggests a location to investigate; it does not establish unmet demand. Coverage flags use the Essex/Havering study boundary and do not guarantee a complete clinic inventory.</p>
        <p>Rail includes National Rail, Overground and Elizabeth line stations. Nearby same-name interchange records are combined into one pin. Active station access records are used; individual platforms and entrances are not separate pins.</p>
        <p>Station snapshot: {new Date(dataset.updatedAt).toLocaleDateString("en-GB")}. <a href="https://beta-naptan.dft.gov.uk/" target="_blank" rel="noreferrer">Department for Transport NaPTAN</a>. © Crown copyright, <a href={dataset.licenceUrl} target="_blank" rel="noreferrer">Open Government Licence v3.0</a>.</p>
      </details>
    </section>
  );
}
