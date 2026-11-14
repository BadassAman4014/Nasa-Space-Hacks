import React, { useEffect, useState } from 'react';
import { Sprout, Database, Activity, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { FieldCategory, FieldContextData } from './types';

interface AgriculturalLoadingCardProps {
  category: FieldCategory;
  fieldName: string;
  contextData: FieldContextData | null;
  onFinished: () => void;
}

interface StepItem {
  id: number;
  label: string;
  icon: typeof Sprout;
  doneAtPercent: number;
}

export const AgriculturalLoadingCard: React.FC<AgriculturalLoadingCardProps> = ({
  category,
  fieldName,
  contextData,
  onFinished,
}) => {
  const [progress, setProgress] = useState(15);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps: StepItem[] = [
    {
      id: 1,
      label: `Retrieving field geometry & coordinates for ${fieldName}`,
      icon: Database,
      doneAtPercent: 30,
    },
    {
      id: 2,
      label: category === 'fertilizer' || category === 'soil'
        ? 'Querying ISRIC SoilGrids v2.0 (pH, SOC, N-P-K, bulk density)'
        : 'Connecting to agricultural knowledge base & crop records',
      icon: Sprout,
      doneAtPercent: 60,
    },
    {
      id: 3,
      label: 'Analyzing Sentinel-2 satellite vegetation index & multi-year NDVI',
      icon: Activity,
      doneAtPercent: 85,
    },
    {
      id: 4,
      label: category === 'fertilizer'
        ? 'Formulating German DüV regulation & split-nitrogen prescription'
        : 'Synthesizing context-aware agronomic intelligence',
      icon: ShieldCheck,
      doneAtPercent: 100,
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            onFinished();
          }, 450);
          return 100;
        }
        const next = prev + Math.floor(Math.random() * 14) + 12;
        return next > 100 ? 100 : next;
      });
    }, 280);

    return () => clearInterval(interval);
  }, [onFinished]);

  useEffect(() => {
    const stepIdx = steps.findIndex((s) => progress <= s.doneAtPercent);
    if (stepIdx !== -1) {
      setCurrentStepIndex(stepIdx);
    } else {
      setCurrentStepIndex(steps.length - 1);
    }
  }, [progress, steps]);

  const sd = (contextData as any)?.structured_data;
  const soil = contextData?.soilgrids || (sd ? {
    ph_h2o: sd.ph || 6.42,
    soc_g_kg: sd.organic_carbon_pct ? Number((sd.organic_carbon_pct * 10).toFixed(1)) : 19.4,
    texture_class: sd.texture || 'Sandy Loam',
    total_nitrogen_g_kg: sd.total_nitrogen_g_kg || 3.23,
    c_n_ratio: 6.0,
    sand_percent: sd.sand_pct || 75.5,
    silt_percent: 16.6,
    clay_percent: 7.8,
    bulk_density_g_cm3: 1.46,
    cec_mmol_kg: sd.cec || 240.1,
    source: 'ISRIC SoilGrids v2.0',
    depth: '0-30cm',
  } : null);

  return (
    <div className="agricultural-loading-card">
      {/* Confirmation header */}
      <div className="loading-card-header">
        <div className="loading-badge">
          <span className="live-dot" />
          <span>Setting up context</span>
        </div>
        <h3 className="loading-title">
          Calibrating {fieldName}
          {category && <span className="loading-category-pill">{category}</span>}
        </h3>
        <p className="loading-subtitle">
          Retrieving ground-truth soil parameters and satellite observations for this session.
        </p>
      </div>

      {/* Clean progress bar without gradients */}
      <div className="progress-bar-wrapper">
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <div className="progress-labels">
          <span className="progress-status-text">
            {progress < 100 ? 'Synchronizing data...' : 'Context initialized'}
          </span>
          <span className="progress-percent-text">{Math.min(100, progress)}%</span>
        </div>
      </div>

      {/* Step List */}
      <div className="loading-steps-list">
        {steps.map((s, idx) => {
          const isDone = progress >= s.doneAtPercent;
          const isCurrent = idx === currentStepIndex && !isDone;
          const Icon = s.icon;

          return (
            <div
              key={s.id}
              className={`loading-step-item ${isDone ? 'done' : ''} ${isCurrent ? 'active' : ''}`}
            >
              <div className="step-icon-wrapper">
                {isDone ? (
                  <CheckCircle2 size={15} className="step-check-icon" />
                ) : (
                  <Icon
                    size={15}
                    className={isCurrent ? 'step-active-icon' : 'step-pending-icon'}
                  />
                )}
              </div>
              <span className="step-label">{s.label}</span>
              {isCurrent && <span className="step-spinner" />}
            </div>
          );
        })}
      </div>

      {/* Live SoilGrids Preview Chips if available */}
      {soil && progress > 50 && (
        <div className="loading-data-preview">
          <div className="preview-label">Live Soil Profile (ISRIC 250m):</div>
          <div className="preview-chips-row">
            <span className="preview-chip">
              <strong>pH:</strong> {soil.ph_h2o}
            </span>
            <span className="preview-chip">
              <strong>SOC:</strong> {soil.soc_g_kg} g/kg
            </span>
            <span className="preview-chip">
              <strong>Texture:</strong> {soil.texture_class}
            </span>
            <span className="preview-chip">
              <strong>Total N:</strong> {soil.total_nitrogen_g_kg} g/kg
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
