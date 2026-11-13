import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';

interface MapLegendProps {
  mode: 'dashboard' | 'explorer';
  hasSavedFields: boolean;
  hasSelectedField: boolean;
  hasUserLocation: boolean;
  hasDfbkBoundaries?: boolean;
  hasPredictions?: boolean;
  className?: string;
}

export const MapLegend: React.FC<MapLegendProps> = ({
  mode,
  hasSavedFields,
  hasSelectedField,
  hasUserLocation,
  hasDfbkBoundaries = false,
  hasPredictions = false,
  className = '',
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // Determine which sections to display
  const showSavedField = hasSavedFields;
  const showSelectedField = hasSelectedField;
  const showUserLocation = hasUserLocation;
  const showDfbk = mode === 'explorer' || hasDfbkBoundaries;
  const showAiPrediction = hasPredictions;

  const activeEntryCount =
    (showSavedField ? 1 : 0) +
    (showSelectedField ? 1 : 0) +
    (showUserLocation ? 1 : 0) +
    (showDfbk ? 1 : 0) +
    (showAiPrediction ? 1 : 0);

  if (activeEntryCount === 0) {
    return null;
  }

  return (
    <div
      className={`absolute bottom-6 left-6 z-[450] select-none transition-all ${className}`}
    >
      <div className="bg-[#141414]/95 backdrop-blur-md border border-[#333]/90 shadow-2xl rounded-2xl p-3 text-white w-64 max-w-xs transition">
        {/* Header / Collapse Toggle */}
        <div
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between gap-2 cursor-pointer pb-1"
        >
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#aaa]">
            <Layers size={14} className="text-[#1fa35b]" />
            <span>Map Legend</span>
          </div>
          <button
            type="button"
            className="text-[#888] hover:text-white transition p-1 rounded-md hover:bg-[#222]"
            title={collapsed ? 'Expand Legend' : 'Collapse Legend'}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Legend Content */}
        {!collapsed && (
          <div className="pt-2.5 border-t border-[#2a2a2a] mt-1 space-y-3">
            {/* Section 1: User Selection & Saved Farms */}
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777]">
                Your Fields & Status
              </div>

              {/* Saved Field — Exclusively Emerald Green */}
              {showSavedField && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border-2 border-[#1fa35b] bg-[#1fa35b]/35 shadow-[0_0_6px_rgba(31,163,91,0.3)] shrink-0" />
                    <span className="text-[#f3f4f6] text-xs font-medium">
                      Saved Field
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#1fa35b] bg-[#1fa35b]/15 px-1.5 py-0.5 rounded border border-[#1fa35b]/30">
                    My Farm
                  </span>
                </div>
              )}

              {/* Selected Field — Vibrant Orange */}
              {showSelectedField && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border-2 border-[#ff7a1a] bg-[#ff7a1a]/40 shadow-[0_0_6px_rgba(255,122,26,0.3)] shrink-0" />
                    <span className="text-[#f3f4f6] text-xs font-medium">
                      Selected Field
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#ff7a1a] bg-[#ff7a1a]/15 px-1.5 py-0.5 rounded border border-[#ff7a1a]/30">
                    Active
                  </span>
                </div>
              )}

              {/* Current GPS Location — Blue */}
              {showUserLocation && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full border-2 border-white bg-[#2563eb] shadow-[0_0_8px_#3b82f6] shrink-0" />
                    <span className="text-[#f3f4f6] text-xs font-medium">
                      Your Location
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#60a5fa] bg-[#2563eb]/20 px-1.5 py-0.5 rounded border border-[#3b82f6]/30">
                    GPS
                  </span>
                </div>
              )}

              {/* AI-Predicted Field — Purple Dashed Outline */}
              {showAiPrediction && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded shrink-0"
                      style={{
                        border: '2px dashed #a855f7',
                        backgroundColor: 'rgba(168, 85, 247, 0.25)',
                        boxShadow: '0 0 6px rgba(168, 85, 247, 0.35)',
                      }}
                    />
                    <span className="text-[#f3f4f6] text-xs font-medium">
                      AI-predicted field
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#c084fc] bg-[#a855f7]/15 px-1.5 py-0.5 rounded border border-[#a855f7]/30">
                    AI CNN
                  </span>
                </div>
              )}
            </div>

            {/* Section 2: Official DFBK Boundaries (Explorer mode) */}
            {showDfbk && (
              <div className="space-y-2 pt-2 border-t border-[#262626]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#777]">
                  Official DFBK Boundaries
                </div>

                {/* Arable Land (AL) — Golden Wheat / Amber */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border-2 border-[#eab308] bg-[#eab308]/30 shrink-0" />
                    <span className="text-[#f3f4f6] text-xs font-medium">
                      Arable Cropland
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#eab308] bg-[#eab308]/15 px-1.5 py-0.5 rounded border border-[#eab308]/30">
                    AL
                  </span>
                </div>

                {/* Grassland (GL) — Sky Blue / Azure */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border-2 border-[#38bdf8] bg-[#38bdf8]/30 shrink-0" />
                    <span className="text-[#f3f4f6] text-xs font-medium">
                      Grassland / Pasture
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#38bdf8] bg-[#38bdf8]/15 px-1.5 py-0.5 rounded border border-[#38bdf8]/30">
                    GL
                  </span>
                </div>

                {/* Permanent Crops (DK) — Purple / Orchid */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded border-2 border-[#c084fc] bg-[#c084fc]/30 shrink-0" />
                    <span className="text-[#f3f4f6] text-xs font-medium">
                      Permanent Crops
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#c084fc] bg-[#c084fc]/15 px-1.5 py-0.5 rounded border border-[#c084fc]/30">
                    DK
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
