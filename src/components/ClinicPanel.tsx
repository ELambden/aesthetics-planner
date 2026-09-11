import { Building2, CircleCheck, CircleHelp, CircleX, ExternalLink, Phone } from "lucide-react";
import type { Clinic, ClinicReviewStatus } from "../types/domain";

const confidenceOrder = { high: 3, medium: 2, low: 1 } as const;

type Props = {
  clinics: Clinic[];
  selectedClinic?: Clinic;
  statusFilter: ClinicReviewStatus | "all";
  onStatusFilter: (status: ClinicReviewStatus | "all") => void;
  onSelectClinic?: (clinic: Clinic) => void;
};

export function ClinicPanel({ clinics, selectedClinic, statusFilter, onStatusFilter, onSelectClinic }: Props) {
  const sortedClinics = [...clinics].sort((a, b) => {
    const confidenceDelta = confidenceOrder[b.confidence ?? "low"] - confidenceOrder[a.confidence ?? "low"];
    if (confidenceDelta !== 0) return confidenceDelta;
    return a.name.localeCompare(b.name);
  });

  return (
    <section className="panel clinic-panel" aria-label="Competitor clinics">
      <div className="panel-title panel-title-rich">
        <div className="panel-icon amber">
          <Building2 aria-hidden="true" />
        </div>
        <div>
          <h2>Clinics</h2>
          <span>{clinics.length} visible Overture candidates</span>
        </div>
      </div>
      <div className="clinic-tabs" role="tablist" aria-label="Clinic status">
        {(["all", "confirmed", "needs_review", "excluded"] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={statusFilter === status ? "active" : ""}
            onClick={() => onStatusFilter(status)}
          >
            {statusLabel(status)}
          </button>
        ))}
      </div>
      <div className="metric-grid clinic-metrics">
        <Metric label="Visible" value={String(clinics.length)} />
        <Metric label="High confidence" value={String(clinics.filter((clinic) => clinic.confidence === "high").length)} />
        <Metric
          label="Confirmed"
          value={String(clinics.filter((clinic) => clinic.reviewStatus === "confirmed").length)}
        />
        <Metric
          label="Review"
          value={String(clinics.filter((clinic) => clinic.reviewStatus === "needs_review").length)}
        />
      </div>
      {selectedClinic ? (
        <div className="clinic-detail">
          {statusIcon(selectedClinic.reviewStatus)}
          <strong>{selectedClinic.name}</strong>
          <span>{selectedClinic.address}</span>
          <span>{selectedClinic.categories.join(", ")}</span>
          <div className="clinic-chip-row">
            <span className={`confidence-chip ${selectedClinic.confidence}`}>{confidenceLabel(selectedClinic.confidence)}</span>
            <span className="source-chip">{selectedClinic.source.replace("_", " ")}</span>
          </div>
          <div className="clinic-links">
            {selectedClinic.googleMapsUri && (
              <a href={selectedClinic.googleMapsUri} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" /> Google
              </a>
            )}
            {selectedClinic.websiteUri && (
              <a href={selectedClinic.websiteUri} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" /> Website
              </a>
            )}
            {selectedClinic.nationalPhoneNumber && (
              <a href={`tel:${selectedClinic.nationalPhoneNumber}`}>
                <Phone aria-hidden="true" /> Call
              </a>
            )}
          </div>
          <small>Cache expires {new Date(selectedClinic.expiresAt).toLocaleDateString("en-GB")}</small>
        </div>
      ) : (
        <div className="clinic-detail muted">Select a clinic marker for details.</div>
      )}
      <div className="clinic-list">
        {sortedClinics.map((clinic) => (
          <button
            type="button"
            key={clinic.id}
            className={selectedClinic?.id === clinic.id ? "clinic-row selected" : "clinic-row"}
            onClick={() => onSelectClinic?.(clinic)}
          >
            <span className={`confidence-dot ${clinic.confidence}`} />
            <span>
              <strong>{clinic.name}</strong>
              <small>{clinic.address || clinic.categories.join(", ")}</small>
            </span>
            <em>{clinic.confidence}</em>
          </button>
        ))}
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

function statusLabel(status: ClinicReviewStatus | "all") {
  if (status === "needs_review") return "Review";
  if (status === "confirmed") return "Confirmed";
  if (status === "excluded") return "Excluded";
  return "All";
}

function confidenceLabel(confidence = "low") {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}

function statusIcon(status: ClinicReviewStatus) {
  if (status === "confirmed") return <CircleCheck className="status confirmed" aria-hidden="true" />;
  if (status === "excluded") return <CircleX className="status excluded" aria-hidden="true" />;
  return <CircleHelp className="status review" aria-hidden="true" />;
}
