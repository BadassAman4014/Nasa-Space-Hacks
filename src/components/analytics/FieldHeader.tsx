import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  X,
  Download,
  RefreshCw,
  Sparkles,
  MapPin,
  Layers,
  CheckCircle2,
  FileSpreadsheet,
  FlaskConical,
  UploadCloud,
  MoreVertical,
  Activity,
  FileText,
  BarChart3,
  Database,
  ChevronDown,
  Check
} from 'lucide-react';
import { FieldStatusSummary } from '../../services/fieldAnalyticsApi';
import { SavedField } from '../../services/boundariesApi';

export type WorkspaceTab = 'status' | 'report' | 'prescription' | 'data' | 'yield';

interface FieldHeaderProps {
  summary: FieldStatusSummary;
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  onExport: () => void;
  onRefresh: () => void;
  onClose: () => void;
  refreshing: boolean;
  notify?: (msg: string) => void;
  fields?: SavedField[];
  onSelectField?: (fieldId: string) => void;
}

export const FieldHeader: React.FC<FieldHeaderProps> = ({
  summary,
  activeTab,
  setActiveTab,
  onExport,
  onRefresh,
  onClose,
  refreshing,
  notify = () => {},
  fields = [],
  onSelectField,
}) => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
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
    <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
      {/* Left: Back button & Field Title/Subtitle */}
      <div className="flex items-center gap-3.5">
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition flex items-center justify-center border border-gray-200"
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
                className="flex items-center gap-1.5 px-2 py-0.5 -ml-2 rounded-xl hover:bg-gray-100 transition group border border-transparent hover:border-gray-200 text-left cursor-pointer"
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
                                {f.current_crop && (
                                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-normal">
                                    {f.current_crop}
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
            <span className="font-bold text-gray-800">{summary.area_ha.toFixed(2)} ha</span>
            <span>•</span>
            <span className="text-gray-700">{summary.current_crop || 'No crop assigned'}</span>
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
      <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 flex-shrink-0">
        {/* Tab 1: Status */}
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap ${
            activeTab === 'status'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Status
        </button>

        {/* Tab 2: Field Report */}
        <button
          type="button"
          onClick={() => setActiveTab('report')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'report'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Sparkles size={12} className="text-emerald-600" />
          Field report
        </button>

        {/* Tab 3: Prescription Maps */}
        <button
          type="button"
          onClick={() => setActiveTab('prescription')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap ${
            activeTab === 'prescription'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Prescription maps
        </button>

        {/* Tab 4: Data +23 */}
        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'data'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span>Data</span>
          <span className="px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800 text-[10px] font-extrabold">
            +23
          </span>
        </button>

        {/* Tab 5: Yield Analysis */}
        <button
          type="button"
          onClick={() => setActiveTab('yield')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap ${
            activeTab === 'yield'
              ? 'bg-white text-gray-900 shadow-xs'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Yield Analysis
        </button>
      </div>

      {/* Right: Quick Action Buttons (OneSoil Yield Style) */}
      <div className="flex items-center gap-1.5 flex-shrink-0 relative">
        {/* Prescription map action */}
        <button
          onClick={() => setActiveTab('prescription')}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition hidden xl:flex items-center gap-1.5"
          title="Create variable-rate prescription"
        >
          <FileSpreadsheet size={14} className="text-emerald-600" />
          <span>Prescription map</span>
        </button>

        {/* Soil sampling map action */}
        <button
          onClick={() => notify('Soil Sampling Map Planner: 1.0 ha sample grid points generated.')}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition hidden xl:flex items-center gap-1.5"
          title="Agrochemical soil sampling points"
        >
          <FlaskConical size={14} className="text-amber-600" />
          <span>Soil sampling map</span>
        </button>

        {/* Upload data action */}
        <button
          onClick={() => notify('Ingest data: Select Harvester Yield Shapefile, ISO-XML, or GeoTIFF.')}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition hidden md:flex items-center gap-1.5"
          title="Upload harvester, drone, or tractor logs"
        >
          <UploadCloud size={14} className="text-blue-600" />
          <span>Upload data</span>
        </button>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition disabled:opacity-50"
          title="Refresh satellite analysis"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin text-emerald-600' : ''} />
        </button>

        {/* 3-dot overflow menu */}
        <div className="relative">
          <button
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
            title="More actions"
          >
            <MoreVertical size={16} />
          </button>

          {moreMenuOpen && (
            <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 text-xs text-gray-800 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onExport();
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
              >
                <Download size={14} className="text-gray-500" />
                <span>Export Field Report PDF</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setActiveTab('prescription');
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
              >
                <FileSpreadsheet size={14} className="text-gray-500" />
                <span>Generate Prescription</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setActiveTab('data');
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
              >
                <Database size={14} className="text-gray-500" />
                <span>Browse All 12 Layers</span>
              </button>
            </div>
          )}
        </div>

        {/* Close Button (X) */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition ml-1"
          title="Close window"
        >
          <X size={18} />
        </button>
      </div>
    </header>
  );
};
