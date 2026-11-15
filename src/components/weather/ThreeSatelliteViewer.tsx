import React from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { ThreeJsSimulationParams } from '../../services/weatherApi';

interface ThreeSatelliteViewerProps {
  fieldName?: string;
  timestamp?: string;
  simulationParams?: ThreeJsSimulationParams;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

/**
 * The previous viewer drew procedural crop rows, terrain relief, and cloud
 * shadows that were not derived from field data. Keep the panel unavailable
 * until real imagery and DEM geometry are supplied to this component.
 */
export const ThreeSatelliteViewer: React.FC<ThreeSatelliteViewerProps> = ({
  fieldName,
  timestamp,
  isExpanded = false,
  onToggleExpand,
}) => (
  <div className="relative w-full h-full min-h-[140px] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner flex items-center justify-center p-6">
    <div className="text-center max-w-sm">
      <p className="text-sm font-semibold text-slate-700">3D field surface unavailable</p>
      <p className="mt-1 text-xs text-slate-500">
        No georeferenced imagery and elevation mesh are loaded{fieldName ? ` for ${fieldName}` : ''}.
        No procedural surface is shown.
      </p>
      {timestamp && <p className="mt-2 text-[10px] text-slate-400">Weather timestamp: {timestamp}</p>}
    </div>
    {onToggleExpand && (
      <button
        type="button"
        onClick={onToggleExpand}
        title={isExpanded ? 'Collapse' : 'Expand 3D view'}
        className="absolute top-2 right-2 p-1 rounded-md bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 shadow-sm"
      >
        {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
    )}
  </div>
);
