import { BarChart3 } from "lucide-react";
import { formatCurrency, formatKm, formatNumber } from "../lib/scoring";
import type { OpportunityFeature } from "../types/domain";

type Props = {
  area?: OpportunityFeature;
};

export function AreaDetail({ area }: Props) {
  if (!area) {
    return (
      <section className="panel detail-panel" aria-label="Area details">
        <div className="panel-title">
          <BarChart3 aria-hidden="true" />
          <h2>Area Detail</h2>
        </div>
        <div className="empty-state">Select a zone to inspect score drivers.</div>
      </section>
    );
  }

  const p = area.properties;
  return (
    <section className="panel detail-panel" aria-label="Area details">
      <div className="panel-title">
        <BarChart3 aria-hidden="true" />
        <h2>{p.areaName}</h2>
      </div>
      <div className="score-large">
        <div className="score-summary">
          <span>Average score:</span>
          <strong>{p.overallScore}</strong>
        </div>
        <span>Rank {p.rank}</span>
      </div>
      <div className="metric-grid">
        <Metric label="Pop. density (km²)" value={formatNumber(p.populationDensity)} />
        <Metric label="Nearest clinic:" value={formatKm(p.nearestClinicKm)} />
        <Metric label="2 km clinics" value={String(p.clinicCount2Km)} />
        <Metric label="Median sale" value={formatCurrency(p.propertyMedian)} />
      </div>
      <div className="driver-list">
        <Driver label="Population density" value={p.densityScore} />
        <Driver label="Accessibility of nearby clinics" value={p.accessGapScore} />
        <Driver label="Affluence" value={p.affluenceScore} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Driver({ label, value }: { label: string; value: number }) {
  return (
    <div className="driver">
      <span>{label}</span>
      <div className="driver-bar">
        <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}
