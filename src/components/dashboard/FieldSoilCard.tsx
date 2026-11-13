import React, { useEffect, useState, useCallback } from 'react';
import {
  Layers,
  RefreshCw,
  Info,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  Database,
  BarChart3,
  FlaskConical,
} from 'lucide-react';
import {
  soilApi,
  type SoilProfileResponse,
  type TopsoilSummary,
  type SoilMeasurement,
} from '../../services/soilApi';

interface FieldSoilCardProps {
  fieldId: string;
  fieldName: string;
  fieldAreaHa: number;
  notify?: (msg: string) => void;
}

const DEPTH_LABELS: Record<string, string> = {
  '0-5cm': '0–5 cm',
  '5-15cm': '5–15 cm',
  '15-30cm': '15–30 cm',
  '30-60cm': '30–60 cm',
  '60-100cm': '60–100 cm',
  '100-200cm': '100–200 cm',
};

const PROPERTY_DISPLAY: Record<
  string,
  { label: string; unit: string; description: string; optimal?: string }
> = {
  phh2o: { label: 'pH (H₂O)', unit: 'pH', description: 'Acidity in water extract', optimal: '6.0–7.2' },
  soc: { label: 'Organic Carbon', unit: 'g/kg', description: 'Soil organic carbon (SOC)' },
  clay: { label: 'Clay Content', unit: '%', description: 'Particles < 2 µm' },
  sand: { label: 'Sand Content', unit: '%', description: 'Particles 50–2000 µm' },
  silt: { label: 'Silt Content', unit: '%', description: 'Particles 2–50 µm' },
  bdod: { label: 'Bulk Density', unit: 'g/cm³', description: 'Fine earth dry bulk density' },
  cec: { label: 'CEC', unit: 'mmol(c)/kg', description: 'Cation exchange capacity' },
  nitrogen: { label: 'Total Nitrogen', unit: 'g/kg', description: 'Total elemental nitrogen' },
};

export const FieldSoilCard: React.FC<FieldSoilCardProps> = ({
  fieldId,
  fieldName,
  fieldAreaHa,
  notify,
}) => {
  const [profile, setProfile] = useState<SoilProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [extracting, setExtracting] = useState<boolean>(false);
  const [selectedDepth, setSelectedDepth] = useState<string>('0-30cm');
  const [error, setError] = useState<string | null>(null);

  // Load profile
  const fetchProfile = useCallback(async () => {
    if (!fieldId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await soilApi.getSoilProfile(fieldId);
      setProfile(data);
    } catch (err: any) {
      // 404 or not extracted is normal
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [fieldId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Handle Extraction trigger
  const handleExtract = async (refresh: boolean = false) => {
    setExtracting(true);
    setError(null);
    try {
      if (notify) {
        notify(refresh ? 'Refreshing SoilGrids rasters...' : 'Extracting SoilGrids data...');
      }
      const data = refresh
        ? await soilApi.refreshSoil(fieldId)
        : await soilApi.extractSoil(fieldId);
      setProfile(data);
      if (notify) {
        notify('Soil profile updated successfully from ISRIC SoilGrids.');
      }
    } catch (err: any) {
      console.error('Soil extraction failed:', err);
      setError(err?.message || 'Soil extraction failed');
      if (notify) {
        notify('Soil extraction failed. Please try again.');
      }
    } finally {
      setExtracting(false);
    }
  };

  const isSubpixel = fieldAreaHa < 6.25 || profile?.is_subpixel;

  // Filter measurements for currently selected depth interval
  const currentDepthMeasurements = profile?.measurements.filter(
    (m) => m.depth_interval === selectedDepth
  ) || [];

  if (loading) {
    return (
      <div className="bg-[#fcfcfc] border border-[#e8e8e8] rounded-xl p-4 text-center my-3">
        <div className="w-5 h-5 border-2 border-[#1fa35b] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-[#888]">Loading soil profile...</p>
      </div>
    );
  }

  // Not started or no measurements
  if (!profile || profile.status === 'not_started' || profile.measurements.length === 0) {
    return (
      <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-xl p-4 my-3 text-center">
        <div className="w-10 h-10 rounded-xl bg-[#1fa35b]/10 text-[#1fa35b] flex items-center justify-center mx-auto mb-2.5">
          <Layers size={20} />
        </div>
        <h4 className="text-xs font-bold text-[#1f2937] mb-1">Soil Data Not Extracted</h4>
        <p className="text-[11px] text-[#6b7280] leading-relaxed mb-3">
          Retrieve real 250m resolution soil properties (pH, organic carbon, sand/silt/clay texture, bulk density, CEC, nitrogen) from ISRIC SoilGrids for this field's exact polygon.
        </p>
        <button
          onClick={() => handleExtract(false)}
          disabled={extracting}
          className="w-full py-2 px-3 rounded-lg bg-[#1fa35b] hover:bg-[#188a4c] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50"
        >
          {extracting ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Extracting SoilGrids (250m)...</span>
            </>
          ) : (
            <>
              <FlaskConical size={14} />
              <span>Fetch Soil Data</span>
            </>
          )}
        </button>
      </div>
    );
  }

  const topsoil = profile.topsoil_summary;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-3.5 my-3 shadow-sm space-y-3">
      {/* Header with Title and Refresh */}
      <div className="flex items-center justify-between border-b border-[#f0f0f0] pb-2.5">
        <div className="flex items-center gap-1.5">
          <FlaskConical size={16} className="text-[#1fa35b]" />
          <h4 className="text-xs font-bold text-[#1f2937]">Soil Characteristics</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-[#f3f4f6] text-[#4b5563] px-2 py-0.5 rounded-full font-medium">
            SoilGrids 250m
          </span>
          <button
            onClick={() => handleExtract(true)}
            disabled={extracting}
            className="p-1 rounded-md hover:bg-[#f3f4f6] text-[#6b7280] hover:text-[#111] transition"
            title="Refresh SoilGrids data"
          >
            <RefreshCw size={13} className={extracting ? 'animate-spin text-[#1fa35b]' : ''} />
          </button>
        </div>
      </div>

      {/* Subpixel Resolution Warning if < 6.25 ha */}
      {isSubpixel && (
        <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-lg p-2.5 flex items-start gap-2 text-[#92400e]">
          <Info size={14} className="mt-0.5 shrink-0 text-[#b45309]" />
          <div className="text-[11px] leading-tight">
            <strong>Subpixel Resolution Note:</strong> At 250m raster resolution (6.25 ha/pixel), this field ({fieldAreaHa.toFixed(2)} ha) is smaller than a single pixel. Extracted values represent the dominant 250m SoilGrids cell encompassing the field centroid.
          </div>
        </div>
      )}

      {/* Depth Interval Switcher */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-bold text-[#374151]">Depth Layer</label>
          <span className="text-[10px] text-[#9ca3af]">
            {selectedDepth === '0-30cm' ? 'Topsoil Composite' : 'Individual Layer'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => setSelectedDepth('0-30cm')}
            className={`py-1 px-1.5 text-[10px] font-semibold rounded transition text-center truncate ${
              selectedDepth === '0-30cm'
                ? 'bg-[#1fa35b] text-white shadow-xs'
                : 'bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#4b5563]'
            }`}
          >
            0–30 cm (Top)
          </button>
          {['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm', '100-200cm'].map((depthKey) => (
            <button
              key={depthKey}
              onClick={() => setSelectedDepth(depthKey)}
              className={`py-1 px-1.5 text-[10px] font-semibold rounded transition text-center truncate ${
                selectedDepth === depthKey
                  ? 'bg-[#1fa35b] text-white shadow-xs'
                  : 'bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#4b5563]'
              }`}
            >
              {DEPTH_LABELS[depthKey] || depthKey}
            </button>
          ))}
        </div>
      </div>

      {/* VIEW: Topsoil 0-30 cm Summary */}
      {selectedDepth === '0-30cm' && topsoil && (
        <div className="space-y-2.5">
          {/* USDA Texture Classification Highlight */}
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[#166534] uppercase tracking-wide">
                USDA Texture Class
              </span>
              <span className="text-xs font-black text-[#15803d]">
                {topsoil.texture_class}
              </span>
            </div>
            {/* Texture Bar (Sand / Silt / Clay) */}
            <div className="w-full h-2 rounded-full overflow-hidden bg-[#e5e7eb] flex my-1.5">
              <div
                style={{ width: `${topsoil.sand_pct}%` }}
                className="bg-[#f59e0b]"
                title={`Sand: ${topsoil.sand_pct}%`}
              />
              <div
                style={{ width: `${topsoil.silt_pct}%` }}
                className="bg-[#3b82f6]"
                title={`Silt: ${topsoil.silt_pct}%`}
              />
              <div
                style={{ width: `${topsoil.clay_pct}%` }}
                className="bg-[#ef4444]"
                title={`Clay: ${topsoil.clay_pct}%`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#4b5563]">
              <span className="flex items-center gap-1">
                <i className="w-2 h-2 rounded-full bg-[#f59e0b] inline-block" /> Sand: {topsoil.sand_pct}%
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2 h-2 rounded-full bg-[#3b82f6] inline-block" /> Silt: {topsoil.silt_pct}%
              </span>
              <span className="flex items-center gap-1">
                <i className="w-2 h-2 rounded-full bg-[#ef4444] inline-block" /> Clay: {topsoil.clay_pct}%
              </span>
            </div>
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[10px] text-[#6b7280] block">Soil pH (H₂O)</span>
              <strong className="text-sm font-bold text-[#111827]">{topsoil.ph.toFixed(1)}</strong>
              <span className="text-[10px] text-[#15803d] block mt-0.5">
                {topsoil.ph < 5.5 ? 'Acidic' : topsoil.ph > 7.5 ? 'Alkaline' : 'Optimal'}
              </span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[10px] text-[#6b7280] block">Organic Carbon</span>
              <strong className="text-sm font-bold text-[#111827]">
                {topsoil.organic_carbon_g_kg.toFixed(1)}{' '}
                <small className="text-[10px] font-normal text-[#6b7280]">g/kg</small>
              </strong>
              <span className="text-[10px] text-[#6b7280] block mt-0.5">
                ({topsoil.organic_carbon_pct.toFixed(2)}% SOC)
              </span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[10px] text-[#6b7280] block">Bulk Density</span>
              <strong className="text-sm font-bold text-[#111827]">
                {topsoil.bulk_density_g_cm3.toFixed(2)}{' '}
                <small className="text-[10px] font-normal text-[#6b7280]">g/cm³</small>
              </strong>
              <span className="text-[10px] text-[#6b7280] block mt-0.5">Fine earth density</span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2">
              <span className="text-[10px] text-[#6b7280] block">Cation Exch. (CEC)</span>
              <strong className="text-sm font-bold text-[#111827]">
                {topsoil.cec_mmol_kg.toFixed(1)}{' '}
                <small className="text-[10px] font-normal text-[#6b7280]">mmol(c)/kg</small>
              </strong>
              <span className="text-[10px] text-[#6b7280] block mt-0.5">Nutrient retention</span>
            </div>

            <div className="bg-[#f9fafb] border border-[#f3f4f6] rounded-lg p-2 col-span-2">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-[#6b7280] block">Total Nitrogen</span>
                  <strong className="text-sm font-bold text-[#111827]">
                    {topsoil.total_nitrogen_g_kg.toFixed(2)}{' '}
                    <small className="text-[10px] font-normal text-[#6b7280]">g/kg</small>
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#6b7280] block">C : N Ratio</span>
                  <strong className="text-xs font-bold text-[#374151]">
                    {topsoil.total_nitrogen_g_kg > 0
                      ? (topsoil.organic_carbon_g_kg / topsoil.total_nitrogen_g_kg).toFixed(1)
                      : '—'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: Individual Depth Layer Measurements */}
      {selectedDepth !== '0-30cm' && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">
            Measurements at {DEPTH_LABELS[selectedDepth] || selectedDepth}
          </div>
          {currentDepthMeasurements.length === 0 ? (
            <p className="text-xs text-[#999] py-2 text-center">
              No measurements recorded for this depth layer.
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
              {currentDepthMeasurements.map((m) => {
                const meta = PROPERTY_DISPLAY[m.property_name] || {
                  label: m.property_name,
                  unit: m.unit,
                  description: '',
                };
                return (
                  <div
                    key={m.property_name}
                    className="flex items-center justify-between py-1.5 px-2 bg-[#f9fafb] rounded-lg text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#1f2937] block leading-tight">
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-[#9ca3af]">
                        Range: {m.minimum_value} – {m.maximum_value} {m.unit}
                      </span>
                    </div>
                    <div className="text-right">
                      <strong className="font-bold text-[#111827]">
                        {m.mean_value}{' '}
                        <span className="text-[10px] font-normal text-[#6b7280]">{m.unit}</span>
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Provenance & Citation Metadata Footer */}
      <div className="pt-2 border-t border-[#f0f0f0] text-[10px] text-[#9ca3af] flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span>Source: ISRIC SoilGrids v2.0.0 (250m)</span>
          <span>Coverage: {profile.coverage_percentage}%</span>
        </div>
        {profile.extraction_date && (
          <div className="flex justify-between">
            <span>Extracted: {new Date(profile.extraction_date).toLocaleDateString()}</span>
            <span>Cells: {topsoil?.valid_pixel_count || 1}</span>
          </div>
        )}
      </div>
    </div>
  );
};

