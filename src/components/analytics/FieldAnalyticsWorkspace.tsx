import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import {
  fieldAnalyticsApi,
  FieldStatusSummary,
  NDVITimeSeriesResponse,
  PrecipitationTimeSeriesResponse,
  GDDTimeSeriesResponse,
  FullFieldReportResponse,
} from '../../services/fieldAnalyticsApi';
import { FieldHeader, WorkspaceTab } from './FieldHeader';
import { StatusTab } from './StatusTab';
import { DataCatalogTab } from './DataCatalogTab';
import { type SavedField } from '../../services/boundariesApi';
import { FieldMapTab } from './health/FieldMapTab';
import { FieldHealthTab } from './health/FieldHealthTab';
import { CropNitrogenDrawer } from './health/CropNitrogenDrawer';
import { WaterTab } from './WaterTab';

interface FieldAnalyticsWorkspaceProps {
  fieldId: string;
  onClose: () => void;
  notify: (msg: string) => void;
  fields: SavedField[];
  locationLabel?: string;
  onSelectField?: (id: string) => void;
  onNavigate?: (page: string) => void;
}

export interface ProgressiveBatchProgress {
  loaded: number;
  total: number;
  isStreaming: boolean;
}

export const FieldAnalyticsWorkspace: React.FC<FieldAnalyticsWorkspaceProps> = ({
  fieldId,
  onClose,
  notify,
  fields,
  locationLabel,
  onSelectField,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const queryTab = new URLSearchParams(window.location.search).get('tab');
    const requested = queryTab === 'risk' ? 'map' : sessionStorage.getItem('farmily_analytics_tab') || queryTab;
    sessionStorage.removeItem('farmily_analytics_tab');
    return requested === 'health' || requested === 'water' || requested === 'status' || requested === 'data' ? requested : 'map';
  });
  const initialMapLayer = window.location.pathname.replace(/\/$/, '') === '/risk' || new URLSearchParams(window.location.search).get('tab') === 'risk' ? 'risk' : 'water';
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<FieldStatusSummary | null>(null);
  const [ndviData, setNdviData] = useState<NDVITimeSeriesResponse | null>(null);
  const [precipData, setPrecipData] = useState<PrecipitationTimeSeriesResponse | null>(null);
  const [gddData, setGddData] = useState<GDDTimeSeriesResponse | null>(null);
  const [fullReport, setFullReport] = useState<FullFieldReportResponse | null>(null);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [inputRevision, setInputRevision] = useState(0);

  const [selectedBaseTemp, setSelectedBaseTemp] = useState<number>(4.4);
  const [batchProgress, setBatchProgress] = useState<ProgressiveBatchProgress>({
    loaded: 0,
    total: 0,
    isStreaming: false,
  });

  const loadAllData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        // 1. Fetch Status essentials immediately (Summary, newest NDVI batch 1, Weather, GDD)
        const [sumRes, ndviBatch1, precipRes, gddRes] = await Promise.all([
          fieldAnalyticsApi.getSummary(fieldId),
          fieldAnalyticsApi.getNDVITimeSeries(fieldId, isRefresh, 20, 0, 'desc'),
          fieldAnalyticsApi.getPrecipitation(fieldId),
          fieldAnalyticsApi.getGDD(fieldId, selectedBaseTemp),
        ]);

        setSummary(sumRes);
        setNdviData(ndviBatch1);
        setPrecipData(precipRes);
        setGddData(gddRes);

        const totalCount = ndviBatch1.total_count ?? ndviBatch1.observations.length;
        const initialCount = ndviBatch1.observations.length;
        const hasMore = (ndviBatch1.has_more ?? false) && initialCount < totalCount;

        setBatchProgress({
          loaded: initialCount,
          total: totalCount,
          isStreaming: hasMore,
        });

        // Unblock main UI immediately so the user can interact with the latest satellite scene and status cards!
        setLoading(false);
        setRefreshing(false);

        // 2. Load comprehensive report in background for Report, Prescription & Yield tabs
        fieldAnalyticsApi.getFullReport(fieldId, isRefresh)
          .then((repRes) => setFullReport(repRes))
          .catch((err) => console.warn('Background full report fetch:', err));

        if (isRefresh) {
          notify('Satellite analytics and reports refreshed successfully.');
        }

        // Stream remaining historical batches in the background (newest to oldest)
        if (hasMore) {
          let currentOffset = initialCount;
          const BATCH_SIZE = 20;

          while (currentOffset < totalCount) {
            try {
              const nextBatch = await fieldAnalyticsApi.getNDVITimeSeries(
                fieldId,
                false,
                BATCH_SIZE,
                currentOffset,
                'desc'
              );

              if (!nextBatch.observations || nextBatch.observations.length === 0) {
                break;
              }

              setNdviData((prev) => {
                if (!prev) return nextBatch;
                const seen = new Set(prev.observations.map((o) => o.id));
                const merged = [...prev.observations];
                for (const o of nextBatch.observations) {
                  if (!seen.has(o.id)) {
                    seen.add(o.id);
                    merged.push(o);
                  }
                }
                return {
                  ...prev,
                  observations: merged,
                  total_count: nextBatch.total_count ?? totalCount,
                  has_more: nextBatch.has_more,
                };
              });

              currentOffset += nextBatch.observations.length;
              const isStillStreaming = (nextBatch.has_more ?? false) && currentOffset < totalCount;

              setBatchProgress({
                loaded: currentOffset,
                total: nextBatch.total_count || totalCount,
                isStreaming: isStillStreaming,
              });

              // Give UI a brief 120ms pause for smooth progressive curve expansion
              await new Promise((r) => setTimeout(r, 120));

              if (!nextBatch.has_more) break;
            } catch (streamErr) {
              console.warn('Progressive batch fetch interrupted:', streamErr);
              break;
            }
          }

          setBatchProgress((prev) => ({ ...prev, isStreaming: false }));
        }
      } catch (err: any) {
        console.error('Error loading field analytics:', err);
        setError(err.message || 'Failed to load field analytics data.');
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fieldId, selectedBaseTemp]
  );

  useEffect(() => {
    void loadAllData(false);
  }, [fieldId, loadAllData]);

  const handleUpdatePlantingDate = async (date: string) => {
    try {
      await fieldAnalyticsApi.updatePlantingDate(fieldId, { planting_date: date });
      notify(`Planting date updated to ${date}`);
      loadAllData(false);
    } catch (err: any) {
      notify(`Failed to update planting date: ${err.message}`);
    }
  };

  const handleBaseTempChange = async (temp: number) => {
    setSelectedBaseTemp(temp);
    try {
      const newGdd = await fieldAnalyticsApi.getGDD(fieldId, temp);
      setGddData(newGdd);
      notify(`Recalculated GDD with base temperature ${temp}°C`);
    } catch (err: any) {
      console.error('Failed to recalculate GDD:', err);
    }
  };

  if (loading) {
    return (
      <div className="h-full w-full bg-[#f8fafc] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center animate-spin">
          <RefreshCw size={24} />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-gray-900">Loading Field Analytics</h3>
          <p className="text-xs text-gray-500">
            Querying Sentinel-2 surface reflectance, NASA POWER climate history & SoilGrids data...
          </p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="h-full w-full bg-[#f8fafc] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
          <AlertCircle size={24} />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-base font-bold text-gray-900">Unable to Load Field Analytics</h3>
          <p className="text-xs text-gray-500 max-w-md">{error}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => loadAllData(false)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold"
          >
            Retry
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
          >
            Back to Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#f1f4f2] flex flex-col overflow-y-auto print:bg-white print:overflow-visible">
      {/* Header */}
      <FieldHeader
        summary={summary}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onClose={onClose}
        fields={fields}
        locationLabel={locationLabel}
        onSelectField={onSelectField}
        onOpenWeather={() => onNavigate?.('weather')}
      />

      {/* Main Tab Content */}
      <main className="flex-1 px-6 md:px-8 pb-10 pt-2">
        {activeTab === 'map' && (
          <FieldMapTab
            key={`${fieldId}-${inputRevision}`}
            fieldId={fieldId}
            onSelectField={onSelectField}
            onOpenHealth={() => setActiveTab('health')}
            onOpenWater={() => setActiveTab('water')}
            onOpenInputs={() => setInputsOpen(true)}
            initialLayer={initialMapLayer}
          />
        )}

        {activeTab === 'health' && <FieldHealthTab fieldId={fieldId} notify={notify} />}

        {activeTab === 'water' && <WaterTab fieldId={fieldId} fieldName={summary.name} notify={notify} />}

        {activeTab === 'status' && (
          <StatusTab
            summary={summary}
            ndviData={ndviData}
            precipData={precipData}
            gddData={gddData}
            onUpdatePlantingDate={handleUpdatePlantingDate}
            onBaseTempChange={handleBaseTempChange}
            selectedBaseTemp={selectedBaseTemp}
            batchProgress={batchProgress}
          />
        )}

        {activeTab === 'data' && (
          <DataCatalogTab
            summary={summary}
            fullReport={fullReport}
            ndviData={ndviData}
            locationLabel={locationLabel}
            notify={notify}
            onOpenInputs={() => setInputsOpen(true)}
          />
        )}

      </main>

      <CropNitrogenDrawer
        fieldId={fieldId}
        open={inputsOpen}
        onClose={() => setInputsOpen(false)}
        onSaved={() => setInputRevision((revision) => revision + 1)}
        notify={notify}
      />
    </div>
  );
};
