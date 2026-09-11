import { MapPin, TrendingUp } from "lucide-react";
import { formatCurrency, formatKm, formatNumber } from "../lib/scoring";
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
              onClick={() => onSelect(area)}
            >
              <span className="rank-number">{p.rank}</span>
              <span className="rank-main">
                <strong>{p.areaName}</strong>
                <span>
                  {p.localAuthority} · {formatKm(p.nearestClinicKm)} nearest · {p.clinicCount5Km} within 5 km
                </span>
              </span>
              <span className="score-pill">
                <TrendingUp aria-hidden="true" />
                {p.overallScore}
              </span>
              <span className="rank-meta">
                <span>{formatNumber(p.populationDensity)}/km2</span>
                <span>{formatCurrency(p.propertyMedian)}</span>
              </span>
              <span className="rank-spark" aria-hidden="true">
                <i style={{ width: `${Math.max(4, p.densityScore)}%` }} />
                <i style={{ width: `${Math.max(4, p.accessGapScore)}%` }} />
                <i style={{ width: `${Math.max(4, p.affluenceScore)}%` }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
