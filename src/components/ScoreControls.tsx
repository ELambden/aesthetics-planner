import { Banknote, Building2, SlidersHorizontal, UsersRound } from "lucide-react";
import { PRESET_WEIGHTS } from "../lib/scoring";
import type { ScorePreset, ScoreWeights } from "../types/domain";

type Props = {
  preset: ScorePreset;
  weights: ScoreWeights;
  onPresetChange: (preset: ScorePreset) => void;
  onWeightsChange: (weights: ScoreWeights) => void;
};

const sliders: Array<{ key: keyof ScoreWeights; label: string; icon: typeof UsersRound }> = [
  { key: "density", label: "Demand density", icon: UsersRound },
  { key: "access", label: "Access gap", icon: Building2 },
  { key: "affluence", label: "Affluence", icon: Banknote }
];

export function ScoreControls({ preset, weights, onPresetChange, onWeightsChange }: Props) {
  const totalWeight = weights.density + weights.access + weights.affluence;

  return (
    <section className="panel score-panel" aria-label="Score controls">
      <div className="panel-title panel-title-rich">
        <div className="panel-icon">
          <SlidersHorizontal aria-hidden="true" />
        </div>
        <div>
          <h2>Scoring</h2>
          <span>Three-factor opportunity model</span>
        </div>
      </div>

      <div className="segmented" role="tablist" aria-label="Score preset">
        {Object.keys(PRESET_WEIGHTS).map((key) => (
          <button
            key={key}
            className={preset === key ? "active" : ""}
            onClick={() => onPresetChange(key as ScorePreset)}
            type="button"
          >
            {labelPreset(key as ScorePreset)}
          </button>
        ))}
      </div>

      <div className="weight-summary" aria-label="Weight split">
        {sliders.map((slider) => (
          <i
            key={slider.key}
            className={`weight-${slider.key}`}
            style={{ flexGrow: weights[slider.key] / Math.max(1, totalWeight) }}
          />
        ))}
      </div>

      <div className="slider-stack">
        {sliders.map((slider) => {
          const Icon = slider.icon;
          return (
            <label key={slider.key} className="slider-row">
              <span>
                <span className="slider-label">
                  <Icon aria-hidden="true" />
                  {slider.label}
                </span>
                <strong>{weights[slider.key]}</strong>
              </span>
              <input
                type="range"
                min="0"
                max="70"
                value={weights[slider.key]}
                onChange={(event) =>
                  onWeightsChange({
                    ...weights,
                    [slider.key]: Number(event.target.value)
                  })
                }
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}

function labelPreset(preset: ScorePreset) {
  if (preset === "density-gap") return "Density gap";
  if (preset === "affluent-demand") return "Affluent";
  return "Balanced";
}
