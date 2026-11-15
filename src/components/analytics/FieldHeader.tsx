import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  MapPin,
  Layers,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { FieldStatusSummary } from '../../services/fieldAnalyticsApi';
import { SavedField } from '../../services/boundariesApi';
import { useI18n } from '../../i18n';

export type WorkspaceTab = 'map' | 'health' | 'status' | 'data';

interface FieldHeaderProps {
  summary: FieldStatusSummary;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  onClose: () => void;
  fields?: SavedField[];
  onSelectField?: (fieldId: string) => void;
}

export const FieldHeader: React.FC<FieldHeaderProps> = ({
  summary,
  activeTab,
  setActiveTab,
  onClose,
  fields = [],
  onSelectField,
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
    <header className="bg-[#f1f4f2]/90 backdrop-blur-md px-6 md:px-8 py-4 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between gap-4 sticky top-0 z-30 transition-all">
      {/* Left: Back button & Field Title/Subtitle */}
      <div className="flex items-center gap-3.5 min-w-[260px] shrink-0">
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

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-gray-500 mt-0.5 font-medium">
            <span className="font-bold text-gray-800">{formatHectares(summary.area_ha)}</span>
            <span>•</span>
            <span className="text-gray-700">{summary.current_crop || t('analytics.noCropAssigned')}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-gray-500">
              <Layers size={12} /> {summary.farm_name}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-gray-500">
              <MapPin size={12} /> {summary.location}
            </span>
          </div>
        </div>
      </div>

      {/* Middle: 5 Navigation Tabs (OneSoil Architecture) */}
      <div className="flex items-center bg-slate-200/50 p-1 rounded-2xl border border-black/[0.04] flex-shrink-0">
        {/* Field Map */}
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'map' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Field Map
        </button>

        {/* Field Health Trend */}
        <button
          type="button"
          onClick={() => setActiveTab('health')}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'health' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Field Health
        </button>

        {/* Tab 1: Status */}
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`px-3 py-1.5 text-xs font-bold rounded-xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'status'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('analytics.statusTab')}
        </button>

        {/* Tab 4: Data +23 */}
        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={`px-2.5 py-1.5 text-xs font-bold rounded-xl transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'data'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span>{t('analytics.dataTab')}</span>
          <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 text-[10px] font-extrabold">
            +23
          </span>
        </button>

      </div>
    </header>
  );
};
