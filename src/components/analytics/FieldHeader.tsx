import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  MapPin,
  Layers,
  CheckCircle2,
  ChevronDown,
  CloudSun,
} from 'lucide-react';
import { FieldStatusSummary } from '../../services/fieldAnalyticsApi';
import { SavedField } from '../../services/boundariesApi';
import { useI18n } from '../../i18n';

export type WorkspaceTab = 'map' | 'health' | 'water' | 'status' | 'data';

interface FieldHeaderProps {
  summary: FieldStatusSummary;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  onClose: () => void;
  fields?: SavedField[];
  locationLabel?: string;
  onSelectField?: (fieldId: string) => void;
  onOpenWeather?: () => void;
}

export const FieldHeader: React.FC<FieldHeaderProps> = ({
  summary,
  activeTab,
  setActiveTab,
  onClose,
  fields = [],
  locationLabel,
  onSelectField,
  onOpenWeather,
}) => {
  const { t, formatHectares } = useI18n();
  const [fieldDropdownOpen, setFieldDropdownOpen] = useState(false);
  const fieldDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fieldDropdownRef.current && !fieldDropdownRef.current.contains(e.target as Node)) {
        setFieldDropdownOpen(false);
      }
    };
    if (fieldDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [fieldDropdownOpen]);

  return (
    <header className="field-analytics-header sticky top-0 z-30 flex flex-col bg-white px-4 pt-4 shadow-sm md:px-8">
      <div className="flex w-full min-w-0 items-center gap-3.5 overflow-x-auto whitespace-nowrap pb-4 pr-[200px]">
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-gray-600 hover:text-gray-900 bg-white/80 hover:bg-white transition flex items-center justify-center border border-black/[0.06] shadow-xs cursor-pointer"
          title="Close / Back to Map"
          aria-label="Back to Map"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="relative" ref={fieldDropdownRef}>
          <div className="flex items-center gap-2.5">
            {/* Field Name with Dropdown Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFieldDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 -ml-2 rounded-xl hover:bg-white/80 transition group border border-transparent hover:border-black/[0.04] text-left cursor-pointer"
                aria-expanded={fieldDropdownOpen}
                aria-haspopup="listbox"
                title="Click to switch field"
              >
                <h1 className="text-xl font-bold text-gray-900 tracking-tight group-hover:text-emerald-700 transition">
                  {summary.name}
                </h1>
                <ChevronDown
                  size={18}
                  className={`text-gray-400 group-hover:text-gray-700 transition-transform duration-200 ${
                    fieldDropdownOpen ? 'rotate-180 text-emerald-600' : ''
                  }`}
                />
              </button>

              {/* Field Switcher Dropdown Menu */}
              {fieldDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-72 md:w-80 bg-white rounded-2xl shadow-xl border border-gray-200 p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between text-xs font-semibold text-gray-500">
                    <span className="flex items-center gap-1.5 text-gray-700">
                      <Layers size={13} className="text-emerald-600" />
                      Select Field
                    </span>
                    <span className="text-[11px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                      {fields.length} available
                    </span>
                  </div>

                  {/* Field list */}
                  <div className="max-h-64 overflow-y-auto py-1 space-y-1">
                    {fields.length === 0 ? (
                      <div className="p-3 text-xs text-gray-400 text-center">No other fields found</div>
                    ) : (
                      fields.map((f) => {
                        const isCurrent = f.id === summary.field_id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              onSelectField?.(f.id);
                              setFieldDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                              isCurrent
                                ? 'bg-emerald-50 text-emerald-950 font-medium border border-emerald-200/80 shadow-xs'
                                : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                            }`}
                          >
                            <div className="space-y-0.5 min-w-0 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold truncate text-gray-900">{f.name}</span>
                                {f.current_crop ? (
                                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-normal">
                                    {f.current_crop}
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-amber-50 text-amber-700/80 border border-amber-200/50 px-1.5 py-0.2 rounded font-normal">
                                    Unassigned
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500 flex items-center gap-2">
                                <span>{f.area_hectares ? f.area_hectares.toFixed(2) : '—'} ha</span>
                                <span>•</span>
                                <span className="truncate">{f.farm_name || 'My Farm'}</span>
                              </div>
                            </div>
                            {isCurrent && (
                              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-0.5 flex flex-nowrap items-center gap-2.5 text-sm font-medium text-gray-600">
            <span className="font-bold text-gray-800">{formatHectares(summary.area_ha)}</span>
            <span>•</span>
            <span className="text-gray-700">{summary.current_crop || t('analytics.noCropAssigned')}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-gray-500">
              <Layers size={12} /> {summary.farm_name}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-gray-500">
              <MapPin size={12} /> {locationLabel || 'Resolving field location'}
            </span>
            {summary.current_weather && (
              <button onClick={onOpenWeather} className="flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800 hover:bg-sky-100">
                <CloudSun size={13} /> {Math.round(summary.current_weather.temperature_c)}°C · {summary.current_weather.condition}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Centered analytics navigation */}
      <nav
        className="flex w-full items-center justify-start gap-2 overflow-x-auto border-t border-slate-100 sm:justify-center"
        aria-label="Field analytics sections"
      >
        {/* Field Map */}
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`border-b-2 px-5 py-3 text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'map' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('fieldAnalytics.tabs.map')}
        </button>

        {/* Field Health Trend */}
        <button
          type="button"
          onClick={() => setActiveTab('health')}
          className={`border-b-2 px-5 py-3 text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'health' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('fieldAnalytics.tabs.health')}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('water')}
          className={`border-b-2 px-5 py-3 text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'water' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Water
        </button>

        {/* Status */}
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`border-b-2 px-5 py-3 text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeTab === 'status'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('fieldAnalytics.tabs.status')}
        </button>

        {/* Tab 4: Data +23 */}
        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={`border-b-2 px-5 py-3 text-sm font-bold transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'data'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <span>{t('fieldAnalytics.tabs.data')}</span>
          <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 text-[10px] font-extrabold">
            +23
          </span>
        </button>
      </nav>
    </header>
  );
};
