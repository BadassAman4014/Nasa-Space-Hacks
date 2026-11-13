import L from 'leaflet';
import type { FieldWeatherSummary } from '../../services/weatherApi';

export function createVirtualStationDivIcon(
  station: FieldWeatherSummary,
  isSelected: boolean = false
): L.DivIcon {
  // Weather icon representation
  let iconSvg = `
    <svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="5" />
      <path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  `;

  if (station.icon === 'partly_cloudy') {
    iconSvg = `
      <svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v2m4.9 1.5 1.4-1.4M20 10h2M18.4 16.6l1.4 1.4" />
        <path d="M17.5 19H9a5 5 0 1 1 5-7.5 4.5 4.5 0 0 1 3.5 7.5z" fill="#f59e0b" fill-opacity="0.3" stroke="#f59e0b" />
      </svg>
    `;
  } else if (station.icon === 'cloudy') {
    iconSvg = `
      <svg class="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 19H9a5 5 0 1 1 4.7-6.7A4.5 4.5 0 0 1 20 16a3.5 3.5 0 0 1-2.5 3z" />
      </svg>
    `;
  } else if (station.icon.includes('rain')) {
    iconSvg = `
      <svg class="w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 13v6m-4-4v6m-4-2v6M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
      </svg>
    `;
  }

  const borderClass = isSelected
    ? 'border-emerald-500 ring-2 ring-emerald-400/60 shadow-emerald-500/20'
    : 'border-slate-200/90 hover:border-slate-400 shadow-black/30';

  // Fixed dimensional container (width: 130px, anchor at [65, 48])
  // This guarantees exact sub-pixel pinning to field centroid at ALL zoom levels
  const html = `
    <div style="width: 130px; height: 76px; position: relative; pointer-events: auto; user-select: none;">
      <!-- 1. Floating Station Card -->
      <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%);"
           class="flex items-center gap-1.5 px-2 py-1 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border ${borderClass} transition-transform hover:scale-105 cursor-pointer whitespace-nowrap">
        <div class="flex-shrink-0 flex items-center justify-center">
          ${iconSvg}
        </div>
        <div class="flex flex-col text-left leading-none">
          <div class="flex items-center gap-1">
            <span class="text-[11px] font-black text-slate-900 tracking-tight">${Math.round(station.temperature_c)}°</span>
            ${isSelected ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>' : ''}
          </div>
          <span class="text-[9px] font-medium text-slate-500 mt-0.5">
            ${Math.round(station.wind_speed_ms)} m/s ${station.wind_arrow}
          </span>
        </div>
      </div>

      <!-- 2. Vertical Stem Pin (links card bottom at y=28 to ground dot at y=48) -->
      <div style="position: absolute; top: 28px; left: 64px; width: 2px; height: 18px; background: rgba(255,255,255,0.95); box-shadow: 0 1px 3px rgba(0,0,0,0.5); pointer-events: none;"></div>

      <!-- 3. Ground Anchor Dot: Center is EXACTLY at (65px, 48px) -->
      <div style="position: absolute; top: 44px; left: 61px; width: 8px; height: 8px; border-radius: 9999px; background: #ffffff; border: 2px solid #0f172a; box-shadow: 0 1px 4px rgba(0,0,0,0.8); pointer-events: none;"></div>

      <!-- 4. Field Name Label: Fixed directly beneath ground anchor -->
      <div style="position: absolute; top: 54px; left: 50%; transform: translateX(-50%); pointer-events: none;"
           class="px-2 py-0.5 rounded-md bg-white/95 backdrop-blur-sm border border-slate-200 text-[10px] font-extrabold text-slate-800 tracking-wide shadow-md whitespace-nowrap">
        ${station.field_name}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-virtual-station-marker border-0 bg-transparent',
    iconSize: [130, 76],
    iconAnchor: [65, 48], // Exactly aligns to center of the Ground Anchor Dot (65, 48)
  });
}
