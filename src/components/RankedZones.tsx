import { MapPin, TrendingUp } from "lucide-react";
import { clampScore, formatCurrency, formatKm, formatNumber } from "../lib/scoring";
import type { OpportunityFeature } from "../types/domain";

type Props = {
  areas: OpportunityFeature[];
  selectedAreaCode?: string;
  onSelect: (area: OpportunityFeature) => void;
};

export function RankedZones({ areas, selectedAreaCode, onSelect }: Props) {
  return (
    <section className="panel ranked-panel" aria-label="Ranked opportunity zones">
      <div className="panel-title panel-title-rich">
        <div className="panel-icon">
          <MapPin aria-hidden="true" />
        </div>
        <div>
          <h2>Ranked Zones</h2>
          <span>{formatNumber(areas.length)} LSOAs sorted by opportunity</span>
        </div>
      </div>
      <div className="rank-list">
        {areas.map((area) => {
          const p = area.properties;
          return (
            <button
              type="button"
              key={p.areaCode}
              className={selectedAreaCode === p.areaCode ? "rank-row selected" : "rank-row"}
              aria-pressed={selectedAreaCode === p.areaCode}
              onClick={() => onSelect(area)}
            >
              <span className="rank-header">
                <span className="rank-number">{p.rank}</span>
                <span className="rank-main">
                  <strong>{p.areaName}</strong>
                  <span>{p.localAuthority}</span>
                </span>
                <span className="score-pill" aria-label={`Opportunity score ${p.overallScore} out of 100`}>
                  <TrendingUp aria-hidden="true" />
                  {p.overallScore}
                </span>
              </span>
              <span className="rank-proximity">
                {formatKm(p.nearestClinicKm)} to nearest clinic · {p.clinicCount5Km} within 5 km
              </span>
              <span className="rank-meta">
                <span>{formatNumber(p.populationDensity)} people/km²</span>
                <span title="Median property price">{formatCurrency(p.propertyMedian)} median home</span>
              </span>
              <span className="rank-drivers">
                <RankDriver label="Population density" score={p.densityScore} tone="density" />
                <RankDriver label="Accessibility of nearby clinics" score={p.accessGapScore} tone="access" />
                <RankDriver label="Affluence" score={p.affluenceScore} tone="affluence" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RankDriver({ label, score, tone }: { label: string; score: number; tone: string }) {
  const value = clampScore(score);
  return (
    <span className={`rank-driver rank-driver-${tone}`}>
      <span>{label}</span>
      <span className="rank-driver-track" aria-hidden="true">
        <i style={{ width: `${value}%` }} />
      </span>
      <span className="rank-driver-value" aria-label={`${value} out of 100`}>{value}</span>
    </span>
  );
}
