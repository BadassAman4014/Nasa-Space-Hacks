import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  CheckCircle2,
  Sparkles,
  MapPin,
  UploadCloud,
  ChevronRight,
  Info,
  Search,
  ExternalLink,
  RefreshCw,
  Globe,
  Satellite,
  Activity,
  CloudRain,
  Mountain,
  DollarSign,
  Trees,
  X,
  Code,
  ChevronDown
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { FieldStatusSummary, FullFieldReportResponse, NDVITimeSeriesResponse } from '../../services/fieldAnalyticsApi';
import {
  nasaChallengeApi,
  ChallengeDatasetInfo,
  DatasetQueryResponse,
  FieldMultiQueryResponse,
} from '../../services/nasaChallengeApi';

interface DataCatalogTabProps {
  summary: FieldStatusSummary;
  fullReport: FullFieldReportResponse | null;
  ndviData?: NDVITimeSeriesResponse | null;
  locationLabel?: string;
  notify: (msg: string) => void;
  onOpenInputs: () => void;
}

interface OperationalLayer {
  id: string;
  name: string;
  category: 'satellite' | 'soil' | 'topography';
  resolution: string;
  source: string;
  lastUpdated: string;
  status: 'active' | 'synced' | 'ready';
  description: string;
  recordsCount: number;
  format: string;
}

export const DataCatalogTab: React.FC<DataCatalogTabProps> = ({
  summary,
  fullReport,
  ndviData,
  locationLabel,
  notify,
  onOpenInputs,
}) => {
  const { t } = useI18n();
  // Navigation between Operational Layers and NASA Challenge Hub
  const [activeCatalogView, setActiveCatalogView] = useState<'challenge_hub' | 'operational'>('challenge_hub');

  // Operational Layers State
  const [operationalCategory, setOperationalCategory] = useState<string>('all');
  const [selectedOpLayerId, setSelectedOpLayerId] = useState<string>('ndvi');

  // NASA Challenge Hub State
  const [challengeDatasets, setChallengeDatasets] = useState<ChallengeDatasetInfo[]>([]);
  const [selectedChallengeCategory, setSelectedChallengeCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Live Query State
  const [queryingDatasetId, setQueryingDatasetId] = useState<string | null>(null);
  const [activeQueryResult, setActiveQueryResult] = useState<DatasetQueryResponse | null>(null);
  const [inspectingDataset, setInspectingDataset] = useState<ChallengeDatasetInfo | null>(null);
  const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);

  // Multi-Sensor Probe State
  const [probingAll, setProbingAll] = useState<boolean>(false);
  const [multiProbeResult, setMultiProbeResult] = useState<FieldMultiQueryResponse | null>(null);

  // Load NASA Challenge Catalog on mount
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        setLoadingCatalog(true);
        setCatalogError(null);
        const data = await nasaChallengeApi.getCatalog();
        if (isMounted) {
          setChallengeDatasets(data);
        }
      } catch (err) {
        console.error('Failed to load NASA Challenge Catalog:', err);
        if (isMounted) setCatalogError(err instanceof Error ? err.message : 'Catalogue unavailable');
      } finally {
        if (isMounted) {
          setLoadingCatalog(false);
        }
      }
    }
    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // Include an operational layer only when its backing response contains data.
  const obsCount = ndviData?.observations?.length || 0;
  const latestS2Date = ndviData?.latest_date || ndviData?.observations?.[0]?.acquisition_date;
  const soilProfile = fullReport?.soil_profile;
  const soilPropsCount = soilProfile?.measurements?.length || 0;
  const reportGeneratedAt = fullReport?.generated_at
    ? new Date(fullReport.generated_at).toLocaleString()
    : undefined;

  const operationalLayers: OperationalLayer[] = useMemo(() => {
    const layers: OperationalLayer[] = [];
    if (obsCount > 0 && latestS2Date) {
      layers.push({
        id: 'ndvi',
        name: 'Sentinel-2 NDVI Time Series',
        category: 'satellite',
        resolution: '10 m field grid',
        source: 'Copernicus Sentinel-2 L2A B04/B08 via Element84 Earth Search',
        lastUpdated: latestS2Date,
        status: 'active',
        description: `NDVI derived from ${obsCount} stored, quality-filtered Sentinel-2 observations for ${summary.name}.`,
        recordsCount: obsCount,
        format: 'JSON / PNG preview',
      });
    }
    if (soilPropsCount > 0) {
      layers.push({
        id: 'soilgrids',
        name: 'SoilGrids Field Profile',
        category: 'soil',
        resolution: soilProfile?.spatial_resolution || '250 m',
        source: `${soilProfile?.source || 'ISRIC SoilGrids'} ${soilProfile?.dataset_version || ''}`.trim(),
        lastUpdated: soilProfile?.extraction_date || soilProfile?.updated_at || soilProfile?.created_at || 'Timestamp unavailable',
        status: 'synced',
        description: `Soil properties extracted for ${locationLabel || summary.name}; values are SoilGrids model predictions, not field samples.`,
        recordsCount: soilPropsCount,
        format: 'JSON',
      });
    }
    if (fullReport?.soil_brightness?.is_available && fullReport.soil_brightness.mean_brightness != null) {
      layers.push({
        id: 'brightness',
        name: 'Soil Brightness & Bare Soil Reflectance',
        category: 'soil',
        resolution: '10 m field grid',
        source: fullReport.soil_brightness.sensor || 'Source unavailable',
        lastUpdated: fullReport.soil_brightness.observation_date || 'Timestamp unavailable',
        status: 'synced',
        description: `Derived bare-soil brightness index: ${fullReport.soil_brightness.mean_brightness.toFixed(3)}.`,
        recordsCount: 1,
        format: 'JSON / PNG preview',
      });
    }
    if (fullReport?.elevation?.data_source && fullReport.elevation.mean_elevation_m != null) {
      layers.push({
        id: 'dem',
        name: 'Copernicus DEM Terrain Metrics',
        category: 'topography',
        resolution: '30 m source, sampled on field grid',
        source: fullReport.elevation.data_source,
        lastUpdated: reportGeneratedAt || 'Analysis timestamp unavailable',
        status: 'synced',
        description: `Mean elevation ${fullReport.elevation.mean_elevation_m.toFixed(1)} m ASL; relief ${fullReport.elevation.elevation_range_m.toFixed(1)} m; mean slope ${fullReport.elevation.mean_slope_deg.toFixed(2)}°.` ,
        recordsCount: 1,
        format: 'JSON / PNG preview',
      });
    }
    return layers;
  }, [summary, fullReport, obsCount, latestS2Date, soilProfile, soilPropsCount, reportGeneratedAt, locationLabel]);
  // Filtered operational layers
  const filteredOpLayers =
    operationalCategory === 'all'
      ? operationalLayers
      : operationalLayers.filter((l) => l.category === operationalCategory);

  const selectedOpLayer =
    operationalLayers.find((l) => l.id === selectedOpLayerId) || operationalLayers[0];

  // Filtered NASA Challenge datasets
  const filteredChallengeDatasets = useMemo(() => {
    return challengeDatasets.filter((d) => {
      const matchCat =
        selectedChallengeCategory === 'all' || d.category === selectedChallengeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.agency.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.agricultural_application.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [challengeDatasets, selectedChallengeCategory, searchQuery]);

  // Execute live query for a single dataset
  const handleQuerySingleDataset = async (dataset: ChallengeDatasetInfo) => {
    try {
      const targetId = summary.field_id;
      setQueryingDatasetId(dataset.id);
      setInspectingDataset(dataset);
      setIsQueryModalOpen(true);
      notify(`Querying ${dataset.name} for ${summary.name}...`);

      const res = await nasaChallengeApi.queryFieldDataset(targetId, dataset.id);
      setActiveQueryResult(res);
      const statusLabel = res.status.replace(/_/g, ' ');
      notify(`${dataset.name}: ${statusLabel}.`);
    } catch (err: unknown) {
      console.error('Query error:', err);
      const message = err instanceof Error ? err.message : 'No source response was available.';
      notify(`Query failed: ${message}`);
    } finally {
      setQueryingDatasetId(null);
    }
  };

  // Execute multi-sensor probe
  const handleProbeAllSensors = async () => {
    try {
      const targetId = summary.field_id;
      setProbingAll(true);
      notify(`Executing multi-sensor NASA Earth Observation scan for ${summary.name}...`);
      const res = await nasaChallengeApi.probeAllForField(targetId);
      setMultiProbeResult(res);
      notify(`Core-source probe complete: ${Object.keys(res.results).length} source responses.`);
    } catch (err: unknown) {
      console.error('Probe all error:', err);
      const message = err instanceof Error ? err.message : 'No source response was available.';
      notify(`Core-source probe failed: ${message}`);
    } finally {
      setProbingAll(false);
    }
  };

  const getAgencyColor = (agency: string) => {
    if (agency.includes('NASA')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (agency.includes('USDA')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (agency.includes('USGS')) return 'bg-teal-50 text-teal-800 border-teal-200';
    if (agency.includes('ESA') || agency.includes('Copernicus')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (agency.includes('ECMWF')) return 'bg-cyan-50 text-cyan-800 border-cyan-200';
    if (agency.includes('FAO')) return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-purple-50 text-purple-700 border-purple-200';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'soil':
        return <Layers size={14} className="text-amber-600" />;
      case 'climate':
        return <CloudRain size={14} className="text-blue-500" />;
      case 'satellite':
        return <Satellite size={14} className="text-indigo-600" />;
      case 'topography':
        return <Mountain size={14} className="text-purple-600" />;
      case 'ecology':
        return <Trees size={14} className="text-emerald-600" />;
      case 'water':
        return <Activity size={14} className="text-teal-600" />;
      case 'economics':
        return <DollarSign size={14} className="text-green-700" />;
      default:
        return <Globe size={14} className="text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider border border-blue-200 flex items-center gap-1.5">
              <Globe size={13} /> NASA Challenge Data Hub
            </span>
            <span className="text-xs font-extrabold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
              {loadingCatalog ? 'Loading catalogue' : `${challengeDatasets.length} Catalogue Entries`}
            </span>
            <span className="text-xs text-gray-500">
              · {summary.name} ({summary.area_ha.toFixed(2)} ha)
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Earth Observation & Agricultural Data Hub
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-3xl leading-relaxed">
            Official source catalogue with field queries where a live connector exists. Responses distinguish
            extracted values, catalogue metadata, out-of-coverage sources, and unavailable integrations.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
          <button
            type="button"
            onClick={handleProbeAllSensors}
            disabled={probingAll}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow transition disabled:opacity-50"
          >
            {probingAll ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
            <span>{probingAll ? 'Querying Core Sources...' : 'Query Core Sources for Field'}</span>
          </button>

          <button
            type="button"
            onClick={() => notify(`Upload data dialog opened for ${summary.name}: Select Shapefile, ISO-XML, or GeoTIFF`)}
            className="px-3.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center gap-1.5 transition"
          >
            <UploadCloud size={15} />
            <span>Upload Data</span>
          </button>
        </div>
      </div>

      {/* Main Switcher: NASA Challenge Hub vs Local Operational Layers */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveCatalogView('challenge_hub')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
              activeCatalogView === 'challenge_hub'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Satellite size={14} />
            <span>NASA Challenge Catalogue ({challengeDatasets.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCatalogView('operational')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 ${
              activeCatalogView === 'operational'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Layers size={14} />
            <span>Field Operational Layers ({operationalLayers.length})</span>
          </button>
        </div>


      </div>

      {/* Multi-Probe Snapshot Banner (if executed) */}
      {multiProbeResult && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 rounded-2xl p-5 border border-blue-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-600 text-white rounded-lg">
                <CheckCircle2 size={16} />
              </span>
              <h3 className="text-sm font-bold text-gray-900">
                Multi-Sensor Cross-Disciplinary Scan Results ({Object.keys(multiProbeResult.results).length} Datasets)
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-gray-500">
              Queried at {new Date(multiProbeResult.queried_at).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(multiProbeResult.results).map(([dId, r]) => (
              <div
                key={dId}
                onClick={() => {
                  setActiveQueryResult(r);
                  setInspectingDataset(challengeDatasets.find((d) => d.id === dId) || null);
                  setIsQueryModalOpen(true);
                }}
                className="p-3 bg-white/90 rounded-xl border border-gray-200 hover:border-blue-400 cursor-pointer transition shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-gray-900 truncate">{r.name}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getAgencyColor(r.agency)}`}>
                    {r.agency.split(' ')[0]}
                  </span>
                </div>
                <p className="text-[11px] text-gray-600 line-clamp-2 mt-1">{r.summary}</p>
                <div className="flex items-center justify-between text-[10px] text-blue-600 font-bold mt-2 pt-1 border-t border-gray-100">
                  <span>View Full Telemetry</span>
                  <ChevronRight size={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped source catalogue */}
      {activeCatalogView === 'challenge_hub' && (
        <div className="space-y-4">
          <div className="relative w-full">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" placeholder={t('fieldAnalytics.data.search')} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15" />
          </div>
          {loadingCatalog && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[0,1,2,3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-white" />)}</div>}
          {catalogError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{catalogError}</div>}
          {!loadingCatalog && [
            { id: 'weather', label: t('fieldAnalytics.data.weather'), categories: ['climate', 'water'] },
            { id: 'soil', label: t('fieldAnalytics.data.soil'), categories: ['soil'] },
            { id: 'satellite', label: t('fieldAnalytics.data.satellite'), categories: ['satellite', 'ecology', 'topography'] },
            { id: 'inputs', label: t('fieldAnalytics.data.inputs'), categories: ['economics'] },
          ].map((group) => {
            const datasets = filteredChallengeDatasets.filter((dataset) => group.categories.includes(dataset.category));
            const showInputs = group.id === 'inputs';
            if (!datasets.length && !showInputs) return null;
            return (
              <details key={group.id} open className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4"><span className="text-base font-extrabold text-slate-950">{group.label} <span className="ml-1 text-sm font-semibold text-slate-500">({datasets.length + (showInputs ? 1 : 0)})</span></span><ChevronDown size={18} className="text-slate-500 transition group-open:rotate-180" /></summary>
                <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-6 md:grid-cols-2 xl:grid-cols-3">
                  {showInputs && <button type="button" onClick={onOpenInputs} className="flex min-h-40 flex-col items-start justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left transition hover:border-emerald-500"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700"><DollarSign size={19} /></span><span><strong className="block text-sm text-slate-950">{t('fieldAnalytics.data.cropInputs')}</strong><span className="mt-1 block text-xs text-slate-600">{t('fieldAnalytics.inputs.subtitle')}</span></span></button>}
                  {datasets.map((dataset) => {
                    const querying = queryingDatasetId === dataset.id;
                    return <article key={dataset.id} className="flex min-h-40 flex-col rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-xs font-bold text-slate-600">{getCategoryIcon(dataset.category)}{dataset.agency}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{dataset.spatial_resolution}</span></div><h3 className="mt-3 text-sm font-extrabold text-slate-950">{dataset.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{dataset.agricultural_application}</p><div className="mt-auto flex gap-2 pt-4"><button onClick={() => handleQuerySingleDataset(dataset)} disabled={querying || !dataset.is_live_queryable} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">{querying ? 'Loading…' : dataset.is_live_queryable ? 'Open for field' : 'Unavailable'}</button><a href={dataset.official_url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-200 p-2 text-slate-600" aria-label="Official documentation"><ExternalLink size={15} /></a></div></article>;
                  })}
                </div>
              </details>
            );
          })}
          {!loadingCatalog && !catalogError && filteredChallengeDatasets.length === 0 && !searchQuery.trim() && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{t('fieldAnalytics.data.noResults')}</div>}
          {!loadingCatalog && searchQuery.trim() && filteredChallengeDatasets.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{t('fieldAnalytics.data.noResults')}</div>}
        </div>
      )}

      {/* VIEW 2: Local Operational Layers */}
      {activeCatalogView === 'operational' && (
        <div className="space-y-6">
          {/* Operational Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setOperationalCategory('all')}
              className={`px-3.5 py-1.5 font-bold rounded-xl transition ${
                operationalCategory === 'all'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Layers ({operationalLayers.length})
            </button>
            <button
              type="button"
              onClick={() => setOperationalCategory('satellite')}
              className={`px-3.5 py-1.5 font-bold rounded-xl transition ${
                operationalCategory === 'satellite'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Satellite & Indices ({operationalLayers.filter((layer) => layer.category === 'satellite').length})
            </button>
            <button
              type="button"
              onClick={() => setOperationalCategory('soil')}
              className={`px-3.5 py-1.5 font-bold rounded-xl transition ${
                operationalCategory === 'soil'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Soil ({operationalLayers.filter((layer) => layer.category === 'soil').length})
            </button>
            <button
              type="button"
              onClick={() => setOperationalCategory('topography')}
              className={`px-3.5 py-1.5 font-bold rounded-xl transition ${
                operationalCategory === 'topography'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Topography & DEM ({operationalLayers.filter((layer) => layer.category === 'topography').length})
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Layer Cards */}
            <div className="lg:col-span-2 space-y-3">
              {filteredOpLayers.length === 0 && (
                <div className="p-5 rounded-2xl border border-gray-200 bg-white text-sm text-gray-500">
                  No verified operational layers are available in this category.
                </div>
              )}
              {filteredOpLayers.map((layer) => {
                const isSelected = layer.id === selectedOpLayerId;
                return (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedOpLayerId(layer.id)}
                    className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/30 ring-2 ring-emerald-500/20'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`p-2.5 rounded-xl flex-shrink-0 ${
                          layer.category === 'satellite'
                            ? 'bg-blue-50 text-blue-600'
                            : layer.category === 'soil'
                            ? 'bg-amber-50 text-amber-700'
                            : layer.category === 'topography'
                            ? 'bg-purple-50 text-purple-600'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        <Layers size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900">{layer.name}</h4>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">
                            {layer.format}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{layer.description}</p>
                        <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-2">
                          <span>Res: {layer.resolution}</span>
                          <span>•</span>
                          <span>Source: {layer.source}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <ChevronRight
                        size={18}
                        className={isSelected ? 'text-emerald-600' : 'text-gray-300'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Layer Inspector & Metadata */}
            {selectedOpLayer && (
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs space-y-6 h-fit sticky top-20">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Layer Inspection
                  </span>
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                    <CheckCircle2 size={13} /> Backed by available data
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mt-2">{selectedOpLayer.name}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  {selectedOpLayer.description}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-gray-100 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-400">Resolution</span>
                  <span className="font-semibold text-gray-800">{selectedOpLayer.resolution}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-400">Primary Source</span>
                  <span className="font-semibold text-gray-800">{selectedOpLayer.source}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-400">Records / Results</span>
                  <span className="font-semibold text-gray-800">
                    {selectedOpLayer.recordsCount.toLocaleString()} records
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-400">Data Format</span>
                  <span className="font-semibold text-gray-800">{selectedOpLayer.format}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-400">Last Observation</span>
                  <span className="font-semibold text-gray-800">{selectedOpLayer.lastUpdated}</span>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* LIVE QUERY RESULT MODAL */}
      {isQueryModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${inspectingDataset ? getAgencyColor(inspectingDataset.agency) : 'bg-gray-100 text-gray-700'}`}>
                      {inspectingDataset?.agency}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                      activeQueryResult?.status === 'success'
                        ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                        : 'text-amber-700 bg-amber-50 border-amber-200'
                    }`}>
                      <Info size={12} /> {activeQueryResult?.status.replace(/_/g, ' ') || 'Awaiting source response'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mt-1">
                    {inspectingDataset?.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQueryModalOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                {/* Field Coordinate Context */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={14} className="text-blue-600" />
                    <span>Target Field: <strong>{summary.name}</strong></span>
                  </div>
                  <div className="font-mono text-[11px] text-gray-500">
                    {activeQueryResult ? `${activeQueryResult.location.lat}° N, ${activeQueryResult.location.lon}° E` : 'Centroid extraction'}
                  </div>
                </div>

                {/* Scientific Agronomic Summary */}
                {activeQueryResult && (
                  <div className="p-3.5 bg-blue-50/80 rounded-xl border border-blue-200 text-blue-950 space-y-1">
                    <span className="font-bold text-[11px] text-blue-900 uppercase tracking-wider block">
                      Agronomic & Observation Summary
                    </span>
                    <p className="leading-relaxed">{activeQueryResult.summary}</p>
                  </div>
                )}

                {/* Parsed Metric Cards */}
                {activeQueryResult && activeQueryResult.data && (
                  <div>
                    <h4 className="font-bold text-gray-900 mb-2">Extracted Parameters & Indicators:</h4>
                    <div className="grid grid-cols-2 gap-2.5">
                      {Object.entries(activeQueryResult.data)
                        .filter(([k]) => k !== 'daily_timeseries' && k !== 'time_series' && k !== 'cmr_granules')
                        .map(([key, value]) => (
                          <div key={key} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                            <span className="text-[10px] text-gray-400 uppercase font-semibold block truncate">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <span className="font-bold text-gray-800 text-xs mt-0.5 block truncate">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Raw JSON Data Preview */}
                {activeQueryResult && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-gray-700 flex items-center gap-1.5">
                        <Code size={13} /> Raw API Payload
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(activeQueryResult.data, null, 2));
                          notify('Copied raw API JSON to clipboard!');
                        }}
                        className="text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="p-3 bg-gray-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-48 border border-gray-800">
                      {JSON.stringify(activeQueryResult.data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Source & Documentation Link */}
                {inspectingDataset && (
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <span>Provider: {inspectingDataset.agency}</span>
                    <a
                      href={inspectingDataset.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <span>View Official Specs</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQueryModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs transition"
                >
                  Close
                </button>
                {inspectingDataset && (
                  <button
                    type="button"
                    onClick={() => handleQuerySingleDataset(inspectingDataset)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow transition"
                  >
                    <RefreshCw size={13} />
                    <span>Re-Query Live</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
