import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  ZoomControl,
  ScaleControl,
  useMap,
  useMapEvents,
  Polygon as LeafletPolygon,
  Circle,
  CircleMarker,
  Popup,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Search,
  Check,
  X,
  Layers,
  Sparkles,
  Download,
  MapPin,
  Pencil,
  Info,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Globe2,
  LocateFixed,
  Crosshair,
  Compass,
  Save,
  Plus,
  Sprout,
  Trash2,
  ArrowRight,
  BrainCircuit,
  Cpu,
  AlertTriangle,
  Eye,
  Sliders,
} from 'lucide-react';
import {
  boundariesApi,
  aiFieldDetectionApi,
  type BoundaryFeature,
  type BoundaryStatusResponse,
  CATEGORY_DESCRIPTIONS,
  type SavedField,
  type UserFarm,
  type PredictionFeature,
  type PredictionCollection,
  type ScanJobStatus,
} from '../../services/boundariesApi';
import { MapSearchBar } from '../common/MapSearchBar';
import { MapLegend } from '../common/MapLegend';
import { isWithinBrandenburg, type SearchResult } from '../../services/geocodingService';

// Initial focus: Potsdam, Brandenburg
const POTSDAM_CENTER: [number, number] = [52.415, 13.045];

// Quick jump locations across Brandenburg
const BRANDENBURG_REGIONS = [
  { name: 'Potsdam', lat: 52.415, lon: 13.045, zoom: 14 },
  { name: 'Havelland', lat: 52.65, lon: 12.6, zoom: 13 },
  { name: 'Oderbruch', lat: 52.7, lon: 14.3, zoom: 13 },
  { name: 'Barnim', lat: 52.8, lon: 13.65, zoom: 13 },
  { name: 'Spreewald', lat: 51.9, lon: 14.05, zoom: 13 },
  { name: 'Cottbus', lat: 51.76, lon: 14.33, zoom: 13 },
];

interface FieldExplorerViewProps {
  onNotify: (msg: string) => void;
  onNavigateDashboard?: () => void;
}

// Controller component to track map movements and fetch viewport boundaries
function ViewportTracker({
  onViewportChange,
}: {
  onViewportChange: (bounds: L.LatLngBounds, zoom: number) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      onViewportChange(map.getBounds(), map.getZoom());
    },
    zoomend: () => {
      onViewportChange(map.getBounds(), map.getZoom());
    },
  });

  useEffect(() => {
    onViewportChange(map.getBounds(), map.getZoom());
  }, [map, onViewportChange]);

  return null;
}

// Map center adjuster
function FlyToLocation({ target }: { target: { lat: number; lon: number; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lon], target.zoom, { duration: 1.2 });
    }
  }, [map, target]);
  return null;
}

// Ensures Leaflet recalculates viewport whenever container dimensions change (e.g. 1920x1080, 1440x900, 1366x768)
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const container = map.getContainer();
    if (!container) return () => clearTimeout(timer);

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

export function FieldExplorerView({ onNotify, onNavigateDashboard }: FieldExplorerViewProps) {
  // Discovery mode: 'discover' (real DFBK fields) or 'draw' (custom farmer geometry)
  const [mode, setMode] = useState<'discover' | 'draw'>('discover');

  // Boundaries loaded in current viewport
  const [boundaries, setBoundaries] = useState<BoundaryFeature[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<BoundaryStatusResponse | null>(null);

  // Selected field blocks for multi-import
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFeature, setActiveFeature] = useState<BoundaryFeature | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [targetFly, setTargetFly] = useState<{ lat: number; lon: number; zoom: number } | null>(null);

  // Geolocation & Near Me state
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = useState<boolean>(false);
  const [nearbyRadius, setNearbyRadius] = useState<number>(3000); // 3 km default

  // Custom drawing state
  const [drawnPoints, setDrawnPoints] = useState<[number, number][]>([]);

  // Persistent user data
  const [userFarms, setUserFarms] = useState<UserFarm[]>([]);
  const [savedFields, setSavedFields] = useState<SavedField[]>([]);

  // Save / Import Modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [modalMode, setModalMode] = useState<'single' | 'multi' | 'custom' | 'ai_single' | 'ai_multi'>('single');
  const [saveFieldName, setSaveFieldName] = useState('');
  const [saveCrop, setSaveCrop] = useState('Winter wheat');
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [isCreatingNewFarm, setIsCreatingNewFarm] = useState(false);
  const [newFarmName, setNewFarmName] = useState('');
  const [newFarmLocation, setNewFarmLocation] = useState('Potsdam, Brandenburg');
  const [saving, setSaving] = useState(false);

  // AI Satellite Field Detection state
  const [currentBounds, setCurrentBounds] = useState<L.LatLngBounds | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(14);
  const [isOutsideCoverage, setIsOutsideCoverage] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanJob, setScanJob] = useState<ScanJobStatus | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<PredictionFeature[]>([]);
  const [predictionsMetadata, setPredictionsMetadata] = useState<PredictionCollection['metadata'] | null>(null);
  const [selectedPredictionIds, setSelectedPredictionIds] = useState<Set<string>>(new Set());
  const [activePrediction, setActivePrediction] = useState<PredictionFeature | null>(null);
  const [confidenceFilter, setConfidenceFilter] = useState<number>(0.35);
  const [showAiReviewPanel, setShowAiReviewPanel] = useState<boolean>(false);
  const [hasScanned, setHasScanned] = useState<boolean>(false);
  const scanJobIntervalRef = useRef<number | null>(null);

  // Debounce timer ref
  const debounceTimer = useRef<number | null>(null);

  // Load farms, saved fields, and provider metadata
  const loadUserData = useCallback(async () => {
    try {
      const [farmsData, fieldsData] = await Promise.all([
        boundariesApi.listFarms(),
        boundariesApi.listFields(),
      ]);
      setUserFarms(farmsData || []);
      setSavedFields(fieldsData || []);
      if (farmsData && farmsData.length > 0 && !selectedFarmId) {
        setSelectedFarmId(farmsData[0].id);
      }
    } catch (err) {
      console.warn('Failed to load user farms/fields:', err);
    }
  }, [selectedFarmId]);

  useEffect(() => {
    boundariesApi
      .getStatus()
      .then((res) => setStatus(res))
      .catch((err) => console.warn('Status fetch error:', err));

    loadUserData();
  }, [loadUserData]);

  // Viewport change handler with 250ms debouncing
  const handleViewportChange = useCallback(
    (bounds: L.LatLngBounds, zoom: number) => {
      setCurrentBounds(bounds);
      setCurrentZoom(zoom);
      const center = bounds.getCenter();
      const inBB = isWithinBrandenburg(center.lat, center.lng);
      setIsOutsideCoverage(!inBB);

      if (mode !== 'discover') return;
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = window.setTimeout(async () => {
        if (!inBB) {
          // Official DFBK is unavailable outside Brandenburg
          setBoundaries([]);
          return;
        }

        setLoading(true);
        try {
          const res = await boundariesApi.getViewportBoundaries({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
            land_use_category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
            limit: 150,
            zoom: zoom,
          });
          setBoundaries(res.features || []);
        } catch (err) {
          console.error('Failed to fetch viewport boundaries:', err);
        } finally {
          setLoading(false);
        }
      }, 250);
    },
    [mode, selectedCategory]
  );

  // Unified search selection handler (prioritizing geographic discovery)
  const handleSearchResult = async (res: SearchResult) => {
    if (res.category === 'field' && res.fieldData) {
      if (res.bounds) {
        const lat = res.lat || (res.bounds[0][0] + res.bounds[1][0]) / 2;
        const lon = res.lon || (res.bounds[0][1] + res.bounds[1][1]) / 2;
        setTargetFly({ lat, lon, zoom: 15.5 });
      }
      if (res.fieldData.source_boundary_id) {
        setSelectedIds(new Set([res.fieldData.source_boundary_id]));
      }
      onNotify(`Selected saved field: ${res.title}`);
    } else if (res.category === 'farm' && res.bounds) {
      const lat = (res.bounds[0][0] + res.bounds[1][0]) / 2;
      const lon = (res.bounds[0][1] + res.bounds[1][1]) / 2;
      setTargetFly({ lat, lon, zoom: 13.5 });
      onNotify(`Navigated to farm: ${res.title}`);
    } else if (res.lat !== undefined && res.lon !== undefined) {
      const lat = res.lat;
      const lon = res.lon;
      const inBB = isWithinBrandenburg(lat, lon);
      setIsOutsideCoverage(!inBB);
      setTargetFly({ lat, lon, zoom: 14 });

      if (inBB) {
        setLoading(true);
        try {
          const boundRes = await boundariesApi.getNearbyBoundaries({
            lat,
            lon,
            radius: 3000,
            limit: 50,
            land_use_category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          });
          if (boundRes.features && boundRes.features.length > 0) {
            setBoundaries(boundRes.features);
            onNotify(`Loaded ${boundRes.features.length} agricultural field blocks near ${res.title}`);
          } else {
            onNotify(`Navigated to ${res.title}. No DFBK blocks in immediate 3 km.`);
          }
        } catch (e) {
          onNotify(`Navigated to ${res.title}`);
        } finally {
          setLoading(false);
        }
      } else {
        setBoundaries([]);
        onNotify(
          `Navigated to ${res.title}. Official DFBK boundaries unavailable outside Brandenburg. Use AI Satellite Scan to detect field boundaries.`
        );
      }
    }
  };

  // Fetch exact GPS location and load fields near the user
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      onNotify('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    onNotify('Requesting your GPS location...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        setUserLocation({ lat, lon, accuracy });
        setTargetFly({ lat, lon, zoom: 14.5 });
        setLocating(false);

        setLoading(true);
        try {
          const res = await boundariesApi.getNearbyBoundaries({
            lat,
            lon,
            radius: nearbyRadius,
            limit: 100,
            land_use_category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
          });

          if (res.features && res.features.length > 0) {
            setBoundaries(res.features);
            onNotify(
              `Located! Found ${res.features.length} field blocks within ${(nearbyRadius / 1000).toFixed(1)} km of your position.`
            );
          } else {
            const inBrandenburg = lat >= 51.3 && lat <= 53.6 && lon >= 11.2 && lon <= 14.8;
            if (!inBrandenburg) {
              onNotify(
                `Position: ${lat.toFixed(4)}, ${lon.toFixed(4)}. Outside Brandenburg (DFBK coverage area). Centered map.`
              );
            } else {
              onNotify(`No agricultural blocks within ${(nearbyRadius / 1000).toFixed(1)} km. Try expanding radius.`);
            }
          }
        } catch (err) {
          onNotify(`Located your GPS position: ${lat.toFixed(4)}, ${lon.toFixed(4)}.`);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          onNotify('Location permission denied. Please allow location access in your browser or search by municipality.');
        } else if (err.code === err.TIMEOUT) {
          onNotify('Location request timed out. Please try again.');
        } else {
          onNotify(`Could not fetch location: ${err.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Re-fetch when nearby radius changes
  const handleRadiusChange = async (newRadius: number) => {
    setNearbyRadius(newRadius);
    if (!userLocation) return;

    setLoading(true);
    try {
      const res = await boundariesApi.getNearbyBoundaries({
        lat: userLocation.lat,
        lon: userLocation.lon,
        radius: newRadius,
        limit: 100,
        land_use_category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
      });
      setBoundaries(res.features || []);
      onNotify(`Updated: ${res.features?.length || 0} fields within ${(newRadius / 1000).toFixed(1)} km.`);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  // Toggle selection of a single field for multi-import
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Total selected hectares calculation
  const totalSelectedHectares = boundaries
    .filter((f) => selectedIds.has(f.id as string))
    .reduce((acc, f) => acc + (f.properties?.official_net_ha || f.properties?.calculated_area_ha || 0), 0);

  // Open Save Modal for a Single Field
  const openSaveSingle = (feature: BoundaryFeature) => {
    setActiveFeature(feature);
    setModalMode('single');
    const cat = feature.properties.land_use_category || 'Field';
    setSaveFieldName(`Field 1`);
    setSaveCrop(cat === 'AL' ? 'Winter wheat' : cat === 'GL' ? 'Grassland pasture' : 'Cover crop');

    if (userFarms.length === 0) {
      setIsCreatingNewFarm(true);
      setNewFarmName('Test Farm');
      setNewFarmLocation('Potsdam, Brandenburg');
    } else {
      setIsCreatingNewFarm(false);
      setSelectedFarmId(userFarms[0].id);
    }

    setShowSaveModal(true);
  };

  // Open Save Modal for Multi-Field Import
  const openSaveMulti = () => {
    if (selectedIds.size === 0) return;
    setModalMode('multi');
    setSaveFieldName('Field');
    setSaveCrop('Winter wheat');

    if (userFarms.length === 0) {
      setIsCreatingNewFarm(true);
      setNewFarmName('Test Farm');
      setNewFarmLocation('Potsdam, Brandenburg');
    } else {
      setIsCreatingNewFarm(false);
      setSelectedFarmId(userFarms[0].id);
    }

    setShowSaveModal(true);
  };

  // Open Save Modal for Custom Drawn Field
  const openSaveCustom = () => {
    if (drawnPoints.length < 3) {
      onNotify('A field polygon requires at least 3 points.');
      return;
    }
    setModalMode('custom');
    setSaveFieldName(`Custom Field ${Date.now().toString().slice(-4)}`);
    setSaveCrop('Cover crop');

    if (userFarms.length === 0) {
      setIsCreatingNewFarm(true);
      setNewFarmName('Test Farm');
      setNewFarmLocation('Potsdam, Brandenburg');
    } else {
      setIsCreatingNewFarm(false);
      setSelectedFarmId(userFarms[0].id);
    }

    setShowSaveModal(true);
  };

  // AI Field Detection Helpers & Handlers
  const filteredPredictions = predictions.filter(
    (p) => p.properties.confidence >= confidenceFilter
  );

  const totalFilteredPredictedArea = filteredPredictions.reduce(
    (sum, p) => sum + (p.properties.area_hectares || 0),
    0
  );

  const selectedPredictionsArea = filteredPredictions
    .filter((p) => selectedPredictionIds.has(p.properties.id))
    .reduce((sum, p) => sum + (p.properties.area_hectares || 0), 0);

  const toggleSelectPrediction = (id: string) => {
    setSelectedPredictionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPredictions = () => {
    setSelectedPredictionIds(new Set(filteredPredictions.map((p) => p.properties.id)));
  };

  const deselectAllPredictions = () => {
    setSelectedPredictionIds(new Set());
  };

  const handleStartAiScan = async () => {
    if (!currentBounds) return;
    setIsScanning(true);
    setScanError(null);

    const bbox: [number, number, number, number] = [
      currentBounds.getWest(),
      currentBounds.getSouth(),
      currentBounds.getEast(),
      currentBounds.getNorth(),
    ];

    try {
      const job = await aiFieldDetectionApi.startScan({
        bbox,
        zoom: currentZoom || 14,
        min_confidence: confidenceFilter,
        min_field_area_ha: 0.2,
      });
      setScanJob(job);
      onNotify(`Satellite Field Scan initiated: ${job.stage}`);

      if (scanJobIntervalRef.current) clearInterval(scanJobIntervalRef.current);
      scanJobIntervalRef.current = window.setInterval(async () => {
        try {
          const current = await aiFieldDetectionApi.getJobStatus(job.job_id);
          setScanJob(current);

          if (current.status === 'completed') {
            if (scanJobIntervalRef.current) clearInterval(scanJobIntervalRef.current);
            setIsScanning(false);
            setHasScanned(true);
            const preds = await aiFieldDetectionApi.getPredictions(job.job_id);
            const feats = preds.features || [];
            setPredictions(feats);
            setPredictionsMetadata(preds.metadata || null);
            setSelectedPredictionIds(new Set(feats.map((f) => f.properties.id)));
            setShowAiReviewPanel(true);
            onNotify(`AI Field Detection complete: found ${feats.length} potential agricultural fields!`);
          } else if (current.status === 'failed' || current.status === 'cancelled') {
            if (scanJobIntervalRef.current) clearInterval(scanJobIntervalRef.current);
            setIsScanning(false);
            setScanError(current.error_details || 'Scan operation failed');
            onNotify(`AI Scan error: ${current.error_details || 'Failed'}`);
          }
        } catch (pollErr: any) {
          console.error('Status poll error:', pollErr);
        }
      }, 1000);
    } catch (err: any) {
      setIsScanning(false);
      setScanError(err.message || 'Failed to start AI field scan');
      onNotify(`Failed to initiate scan: ${err.message}`);
    }
  };

  const handleCancelAiScan = async () => {
    if (scanJob) {
      try {
        await aiFieldDetectionApi.cancelScan(scanJob.job_id);
      } catch (err) {
        // ignore
      }
    }
    if (scanJobIntervalRef.current) clearInterval(scanJobIntervalRef.current);
    setIsScanning(false);
    onNotify('AI Field Scan cancelled.');
  };

  const openSaveSinglePrediction = (pred: PredictionFeature) => {
    setActivePrediction(pred);
    setSaveFieldName(pred.properties.name || `Field ${savedFields.length + 1}`);
    setSaveCrop('Winter wheat');
    setModalMode('ai_single');

    if (userFarms.length === 0) {
      setIsCreatingNewFarm(true);
      setNewFarmName('Test Farm');
      setNewFarmLocation('Umred, Maharashtra');
    } else {
      setIsCreatingNewFarm(false);
      setSelectedFarmId(userFarms[0].id);
    }

    setShowSaveModal(true);
  };

  const openSaveMultiPredictions = () => {
    setSaveFieldName(`AI Batch Field`);
    setSaveCrop('Winter wheat');
    setModalMode('ai_multi');

    if (userFarms.length === 0) {
      setIsCreatingNewFarm(true);
      setNewFarmName('Test Farm');
      setNewFarmLocation('Umred, Maharashtra');
    } else {
      setIsCreatingNewFarm(false);
      setSelectedFarmId(userFarms[0].id);
    }

    setShowSaveModal(true);
  };

  useEffect(() => {
    return () => {
      if (scanJobIntervalRef.current) clearInterval(scanJobIntervalRef.current);
    };
  }, []);

  // Execute Save/Import
  const handleConfirmSave = async () => {
    if (saving) return; // Prevent duplicate clicks
    if (!saveFieldName.trim()) {
      onNotify('Field name is required.');
      return;
    }

    setSaving(true);
    try {
      let targetFarmId = selectedFarmId;

      // Create new farm first if requested or no farms exist
      if (isCreatingNewFarm || !targetFarmId) {
        if (!newFarmName.trim()) {
          onNotify('Farm name is required.');
          setSaving(false);
          return;
        }
        const createdFarm = await boundariesApi.createFarm({
          name: newFarmName.trim(),
          location: newFarmLocation.trim() || 'Brandenburg, Germany',
        });
        targetFarmId = createdFarm.id;
        setSelectedFarmId(createdFarm.id);
      }

      if (modalMode === 'single' && activeFeature) {
        // Save single boundary to farm
        const res = await boundariesApi.createField({
          farm_id: targetFarmId,
          name: saveFieldName.trim(),
          geometry: activeFeature.geometry,
          current_crop: saveCrop.trim(),
          source_boundary_id: activeFeature.id as string,
          boundary_source: 'DFBK',
          land_use_category: activeFeature.properties.land_use_category,
          area_hectares: activeFeature.properties.official_net_ha || activeFeature.properties.calculated_area_ha,
        });

        onNotify(`Field "${res.field.name}" saved to your farm records!`);
      } else if (modalMode === 'multi') {
        // Multi-boundary import
        const boundaryIds = Array.from(selectedIds);
        const customNames: Record<string, string> = {};
        boundaryIds.forEach((id, idx) => {
          customNames[id] = `${saveFieldName.trim()} ${idx + 1}`;
        });

        const res = await boundariesApi.importBoundaries({
          farm_id: targetFarmId,
          boundary_ids: boundaryIds,
          custom_names: customNames,
          current_crop: saveCrop.trim(),
        });

        onNotify(`Successfully imported ${res.imported_count} fields into your farm!`);
        setSelectedIds(new Set());
      } else if (modalMode === 'custom') {
        // Custom drawn polygon save
        const closed = [...drawnPoints, drawnPoints[0]];
        const polygonGeoJson: any = {
          type: 'Polygon',
          coordinates: [closed.map(([lat, lng]) => [lng, lat])],
        };

        const res = await boundariesApi.createField({
          farm_id: targetFarmId,
          name: saveFieldName.trim(),
          geometry: polygonGeoJson,
          current_crop: saveCrop.trim(),
          boundary_source: 'User-drawn',
          land_use_category: 'AL',
        });

        onNotify(`Saved custom field "${res.field.name}" (${res.field.area_hectares.toFixed(2)} ha)!`);
        setDrawnPoints([]);
        setMode('discover');
      } else if (modalMode === 'ai_single' && activePrediction) {
        // AI-predicted single field save
        const res = await boundariesApi.createField({
          farm_id: targetFarmId,
          name: saveFieldName.trim(),
          geometry: activePrediction.geometry,
          current_crop: saveCrop.trim(),
          source_boundary_id: activePrediction.properties.id,
          boundary_source: 'ai_prediction',
          land_use_category: 'AL',
          area_hectares: activePrediction.properties.area_hectares,
        });

        onNotify(`Saved AI-detected field "${res.field.name}" (${res.field.area_hectares.toFixed(2)} ha) to My Farm!`);
        setActivePrediction(null);
      } else if (modalMode === 'ai_multi') {
        // AI-predicted batch field save
        const chosen = filteredPredictions.filter((p) => selectedPredictionIds.has(p.properties.id));
        let count = 0;
        for (let i = 0; i < chosen.length; i++) {
          const p = chosen[i];
          await boundariesApi.createField({
            farm_id: targetFarmId,
            name: `${saveFieldName.trim()} ${i + 1}`,
            geometry: p.geometry,
            current_crop: saveCrop.trim(),
            source_boundary_id: p.properties.id,
            boundary_source: 'ai_prediction',
            land_use_category: 'AL',
            area_hectares: p.properties.area_hectares,
          });
          count++;
        }

        onNotify(`Successfully saved ${count} AI-detected fields into your farm!`);
        setSelectedPredictionIds(new Set());
      }

      setShowSaveModal(false);
      await loadUserData();
    } catch (err) {
      onNotify(`Save failed: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  // Styling helper for Leaflet GeoJSON
  const getFeatureStyle = (feature?: any) => {
    const id = feature?.id || feature?.properties?.id;
    const isSelected = selectedIds.has(id);
    const isSaved = savedFields.some((f) => f.source_boundary_id === id);
    const cat = feature?.properties?.land_use_category;
    const baseColor = CATEGORY_DESCRIPTIONS[cat]?.color || '#FF8A1F';

    if (isSelected) {
      return {
        color: '#ff7a1a',
        weight: 3.5,
        fillColor: '#ff7a1a',
        fillOpacity: 0.55,
      };
    }

    if (isSaved) {
      return {
        color: '#1fa35b',
        weight: 3,
        fillColor: '#1fa35b',
        fillOpacity: 0.45,
      };
    }

    return {
      color: baseColor,
      weight: 2,
      fillColor: baseColor,
      fillOpacity: 0.22,
    };
  };

  return (
    <div className="relative w-full h-full flex-1 min-h-0 flex flex-col overflow-hidden bg-[#1a1a1a] text-white">
      {/* Top Controls Toolbar */}
      <div className="flex-none bg-[#242424] border-b border-[#333] px-4 py-3 flex flex-wrap items-center justify-between gap-3 z-10">
        {/* Left: Mode Toggle & Search & Near Me */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg bg-[#1a1a1a] p-1 border border-[#3a3a3a]">
            <button
              onClick={() => setMode('discover')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${mode === 'discover' ? 'bg-[#1fa35b] text-white shadow-sm' : 'text-[#888] hover:text-white'
                }`}
            >
              <Globe2 size={14} /> Official DFBK Discovery
            </button>
            <button
              onClick={() => {
                setMode('draw');
                setDrawnPoints([]);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${mode === 'draw' ? 'bg-[#ff7a1a] text-white shadow-sm' : 'text-[#888] hover:text-white'
                }`}
            >
              <Pencil size={14} /> Draw Custom Field
            </button>
          </div>

          {mode === 'discover' && (
            <MapSearchBar
              mode="explorer"
              savedFields={savedFields}
              savedFarms={userFarms}
              onSelectResult={handleSearchResult}
              darkSurface={true}
              placeholder="Search Brandenburg municipalities, regions, or coordinates..."
              className="w-72"
            />
          )}

          {/* Near Me / GPS Location Button */}
          {mode === 'discover' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleLocateMe}
                disabled={locating}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${userLocation
                  ? 'bg-[#1fa35b]/20 border-[#1fa35b] text-[#1fa35b] hover:bg-[#1fa35b]/30'
                  : 'bg-[#1a1a1a] hover:bg-[#2a2a2a] border-[#3a3a3a] text-white hover:border-[#4a4a4a]'
                  }`}
                title="Fetch your exact location to find agricultural fields near you"
              >
                <LocateFixed
                  size={14}
                  className={locating ? 'animate-spin text-[#1fa35b]' : userLocation ? 'text-[#1fa35b]' : 'text-[#3b82f6]'}
                />
                <span>{locating ? 'Locating...' : userLocation ? 'Near Me (Active)' : 'Near Me'}</span>
              </button>

              {userLocation && (
                <div className="flex items-center gap-1">
                  <select
                    value={nearbyRadius}
                    onChange={(e) => handleRadiusChange(Number(e.target.value))}
                    className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                    title="Search radius around your exact location"
                  >
                    <option value={1000}>1 km radius</option>
                    <option value={2000}>2 km radius</option>
                    <option value={3000}>3 km radius</option>
                    <option value={5000}>5 km radius</option>
                    <option value={10000}>10 km radius</option>
                    <option value={20000}>20 km radius</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setUserLocation(null);
                      onNotify('Cleared location filter.');
                    }}
                    className="p-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-[#888] hover:text-white transition"
                    title="Clear location filter"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick jump pills */}
          {mode === 'discover' && (
            <div className="hidden xl:flex items-center gap-1.5 text-xs text-[#888]">
              <span>Jump:</span>
              {BRANDENBURG_REGIONS.map((r) => (
                <button
                  key={r.name}
                  onClick={() => setTargetFly({ lat: r.lat, lon: r.lon, zoom: r.zoom })}
                  className="px-2 py-1 rounded bg-[#1f1f1f] hover:bg-[#2f2f2f] hover:text-white text-[11px] border border-[#333] transition"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Category filter & Dashboard link */}
        <div className="flex items-center gap-3">
          {mode === 'discover' && (
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-[#888]" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
              >
                <option value="ALL">All Categories</option>
                <option value="AL">Arable Land (AL)</option>
                <option value="GL">Grassland (GL)</option>
                <option value="DK">Permanent Crops (DK)</option>
                <option value="AL-AF">Agroforestry (AL-AF)</option>
                <option value="AL-APV">Agri-PV (AL-APV)</option>
              </select>
            </div>
          )}

          {/* Always Available Confidence Threshold Selector for AI Field Detection */}
          {(isOutsideCoverage || hasScanned || predictions.length > 0) && (
            <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#a855f7]/40 rounded-lg px-2.5 py-1 text-xs">
              <Sliders size={12} className="text-[#c084fc]" />
              <span className="text-[11px] text-[#aaa]">AI Threshold:</span>
              <input
                type="range"
                min="0.10"
                max="0.85"
                step="0.05"
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(parseFloat(e.target.value))}
                className="w-20 accent-[#a855f7] cursor-pointer"
                title={`Confidence threshold: ${(confidenceFilter * 100).toFixed(0)}%`}
              />
              <strong className="text-[#c084fc] font-mono text-[11px]">
                {(confidenceFilter * 100).toFixed(0)}%
              </strong>
            </div>
          )}

          {onNavigateDashboard && (
            <button
              onClick={onNavigateDashboard}
              className="px-3 py-1.5 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-white flex items-center gap-1.5 transition"
            >
              <span>Dashboard ({savedFields.length})</span> <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Main Map Stage */}
      <div className="flex-1 relative w-full h-full min-h-0 overflow-hidden">
        <MapContainer
          center={POTSDAM_CENTER}
          zoom={14}
          scrollWheelZoom
          zoomControl={false}
          attributionControl={false}
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution="&copy; Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />

          <ZoomControl position="bottomright" />
          <ScaleControl position="bottomleft" imperial={false} />

          <ViewportTracker onViewportChange={handleViewportChange} />
          <FlyToLocation target={targetFly} />
          <MapResizer />

          {/* Render official DFBK boundaries in discover mode */}
          {mode === 'discover' &&
            boundaries.map((feat) => {
              const id = feat.id as string;
              return (
                <GeoJSON
                  key={`${id}-${selectedIds.has(id)}`}
                  data={feat}
                  style={getFeatureStyle(feat)}
                  eventHandlers={{
                    click: () => {
                      setActiveFeature(feat);
                    },
                    mouseover: (e) => {
                      const l = e.target;
                      if (!selectedIds.has(id)) {
                        l.setStyle({ weight: 3.5, color: '#fff' });
                      }
                    },
                    mouseout: (e) => {
                      const l = e.target;
                      if (!selectedIds.has(id)) {
                        l.setStyle(getFeatureStyle(feat));
                      }
                    },
                  }}
                />
              );
            })}

          {/* Render drawn points/polygon in custom draw mode */}
          {mode === 'draw' && drawnPoints.length > 0 && (
            <LeafletPolygon
              positions={drawnPoints}
              pathOptions={{ color: '#ff7a1a', weight: 3, fillColor: '#ff7a1a', fillOpacity: 0.35 }}
            />
          )}

          {/* Render AI-predicted field boundaries with purple dashed outline */}
          {filteredPredictions.map((pred) => {
            const id = pred.properties.id;
            const isSelected = selectedPredictionIds.has(id);
            const isActive = activePrediction?.properties.id === id;

            let rings: [number, number][][] = [];
            if (pred.geometry.type === 'Polygon') {
              rings = [
                (pred.geometry.coordinates as number[][][])[0].map(
                  ([lon, lat]) => [lat, lon] as [number, number]
                ),
              ];
            } else if (pred.geometry.type === 'MultiPolygon') {
              rings = (pred.geometry.coordinates as number[][][][]).map((poly) =>
                poly[0].map(([lon, lat]) => [lat, lon] as [number, number])
              );
            }

            return rings.map((coords, rIdx) => (
              <LeafletPolygon
                key={`pred-${id}-${rIdx}-${isSelected}-${isActive}`}
                positions={coords}
                pathOptions={{
                  color: isActive ? '#f472b6' : '#a855f7',
                  dashArray: '5 5',
                  weight: isActive ? 3.5 : isSelected ? 2.5 : 2,
                  fillColor: isActive ? '#d946ef' : '#a855f7',
                  fillOpacity: isActive ? 0.48 : isSelected ? 0.32 : 0.18,
                }}
                eventHandlers={{
                  click: () => {
                    setActivePrediction(pred);
                    setActiveFeature(null);
                  },
                }}
              >
                <Popup>
                  <div className="text-xs p-1 text-gray-800 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[#9333ea]">
                      <Sparkles size={13} />
                      <span>{pred.properties.name}</span>
                    </div>
                    <div className="text-[11px] text-gray-600 space-y-0.5">
                      <div>Area: <strong>{pred.properties.area_hectares.toFixed(2)} ha</strong></div>
                      <div>Confidence: <strong>{(pred.properties.confidence * 100).toFixed(0)}%</strong></div>
                      <div>Date: {pred.properties.imagery_date}</div>
                      <div>Model: {pred.properties.model_version}</div>
                    </div>
                    <div className="pt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleSelectPrediction(id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                          isSelected ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {isSelected ? 'Deselect' : 'Select'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSaveSinglePrediction(pred)}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#1fa35b] text-white hover:bg-[#188a4c] transition"
                      >
                        Save Field
                      </button>
                    </div>
                  </div>
                </Popup>
              </LeafletPolygon>
            ));
          })}

          {/* User Exact Location GPS Marker & Radius Circle */}
          {userLocation && (
            <>
              <Circle
                center={[userLocation.lat, userLocation.lon]}
                radius={nearbyRadius}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.08,
                  weight: 1.5,
                  dashArray: '6 6',
                }}
              />
              <CircleMarker
                center={[userLocation.lat, userLocation.lon]}
                radius={16}
                pathOptions={{
                  color: '#60a5fa',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.25,
                  weight: 1.5,
                }}
              />
              <CircleMarker
                center={[userLocation.lat, userLocation.lon]}
                radius={7}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: '#2563eb',
                  fillOpacity: 1,
                  weight: 2.5,
                }}
              >
                <Popup>
                  <div className="text-xs p-1 text-gray-800">
                    <strong className="text-blue-600 block mb-0.5">Your Location</strong>
                    <span className="block text-[11px] text-gray-600">
                      {userLocation.lat.toFixed(5)}° N, {userLocation.lon.toFixed(5)}° E
                    </span>
                    <span className="block text-[10px] text-gray-500 mt-1">
                      Search radius: {(nearbyRadius / 1000).toFixed(1)} km
                    </span>
                  </div>
                </Popup>
              </CircleMarker>
            </>
          )}
        </MapContainer>

        {/* Loading Indicator */}
        {loading && (
          <div className="absolute top-4 left-4 z-[500] bg-[#222]/90 backdrop-blur px-3 py-1.5 rounded-lg border border-[#444] text-xs flex items-center gap-2 shadow-lg">
            <RefreshCw size={13} className="animate-spin text-[#1fa35b]" />
            <span>Querying Brandenburg DFBK spatial index...</span>
          </div>
        )}

        {/* Draw Mode Tool floating header */}
        {mode === 'draw' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-[#222]/95 backdrop-blur-md px-4 py-2.5 rounded-xl border border-[#ff7a1a]/40 shadow-xl flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <Pencil size={15} className="text-[#ff7a1a]" />
              <span>Click on the map to add vertices ({drawnPoints.length} points)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawnPoints([])}
                className="px-2.5 py-1 rounded bg-[#333] hover:bg-[#444] text-[#ccc]"
              >
                Clear
              </button>
              <button
                onClick={openSaveCustom}
                disabled={drawnPoints.length < 3}
                className="px-3 py-1 rounded bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-white disabled:opacity-40"
              >
                Save to My Farm
              </button>
            </div>
          </div>
        )}

        {/* Bottom Multi-selection & Import Bar */}
        {mode === 'discover' && selectedIds.size > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] bg-[#1a1a1a]/95 backdrop-blur-md px-5 py-3 rounded-2xl border border-[#1fa35b]/50 shadow-2xl flex items-center gap-6">
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-[#1fa35b]" />
                <span>{selectedIds.size} agricultural blocks selected</span>
              </div>
              <div className="text-[11px] text-[#aaa]">
                Total usable area: <strong>{totalSelectedHectares.toFixed(2)} ha</strong>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-xs text-[#aaa] hover:text-white transition"
              >
                Clear
              </button>
              <button
                onClick={openSaveMulti}
                className="px-4 py-1.5 rounded-lg bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white flex items-center gap-1.5 shadow-md transition"
              >
                <Download size={14} /> Import into Farm
              </button>
            </div>
          </div>
        )}

        {/* Detail Inspection Card (when a feature is clicked) */}
        {activeFeature && (
          <div className="absolute top-4 right-4 z-[500] w-84 bg-[#1f1f1f]/95 backdrop-blur-md rounded-2xl p-4 border border-[#333] shadow-2xl text-xs">
            <div className="flex items-start justify-between border-b border-[#333] pb-3 mb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#1fa35b] tracking-wider">
                  Official Agricultural Field Block
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  {activeFeature.properties.external_id}
                </h3>
              </div>
              <button
                onClick={() => setActiveFeature(null)}
                className="p-1 rounded-md hover:bg-[#333] text-[#888] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between items-center bg-[#282828] p-2 rounded-lg">
                <span className="text-[#aaa]">Land Use Category:</span>
                {(() => {
                  const catColor = CATEGORY_DESCRIPTIONS[activeFeature.properties.land_use_category]?.color || '#eab308';
                  return (
                    <span
                      className="font-semibold px-2 py-0.5 rounded border text-xs"
                      style={{
                        backgroundColor: `${catColor}20`,
                        borderColor: `${catColor}60`,
                        color: catColor,
                      }}
                    >
                      {activeFeature.properties.land_use_category} ·{' '}
                      {CATEGORY_DESCRIPTIONS[activeFeature.properties.land_use_category]?.label || 'Agricultural'}
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-[#282828] p-2 rounded-lg">
                  <div className="text-[10px] text-[#888]">Official Net Area</div>
                  <div className="text-sm font-bold text-white">
                    {activeFeature.properties.official_net_ha.toFixed(2)} ha
                  </div>
                </div>
                <div className="bg-[#282828] p-2 rounded-lg">
                  <div className="text-[10px] text-[#888]">Calculated Area</div>
                  <div className="text-sm font-bold text-white">
                    {activeFeature.properties.calculated_area_ha.toFixed(2)} ha
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#888] space-y-1">
                <div className="flex justify-between">
                  <span>Provider Source:</span>
                  <span className="text-[#ccc]">{activeFeature.properties.source} (Brandenburg)</span>
                </div>
                <div className="flex justify-between">
                  <span>Validity:</span>
                  <span className="text-[#ccc]">
                    {activeFeature.properties.validity_start || '2026-01-01'} to{' '}
                    {activeFeature.properties.validity_end || '2026-12-31'}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Actions: Save to My Farm & Select for Multi-Import */}
            <div className="space-y-2">
              <button
                onClick={() => openSaveSingle(activeFeature)}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#1fa35b] text-white hover:bg-[#188a4c] flex items-center justify-center gap-1.5 shadow-md transition"
              >
                <Save size={14} /> Save to My Farm
              </button>

              <button
                onClick={() => toggleSelect(activeFeature.id as string)}
                className={`w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition ${selectedIds.has(activeFeature.id as string)
                  ? 'bg-[#333] text-[#ff7a1a] border border-[#ff7a1a]/40'
                  : 'bg-[#2a2a2a] text-[#aaa] hover:text-white hover:bg-[#333]'
                  }`}
              >
                {selectedIds.has(activeFeature.id as string) ? (
                  <>
                    <X size={13} /> Remove from Multi-Select
                  </>
                ) : (
                  <>
                    <Check size={13} /> Select for Multi-Import
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Map Selection Legend (bottom-left) */}
        <MapLegend
          mode="explorer"
          hasSavedFields={savedFields.length > 0}
          hasSelectedField={selectedIds.size > 0 || selectedPredictionIds.size > 0 || !!activeFeature || !!activePrediction}
          hasUserLocation={!!userLocation}
          hasDfbkBoundaries={boundaries.length > 0}
          hasPredictions={filteredPredictions.length > 0}
        />

        {/* Official Field Boundaries Unavailable Notice & AI Scan for Fields CTA */}
        {isOutsideCoverage && mode === 'discover' && !hasScanned && predictions.length === 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] max-w-lg w-[92%] sm:w-auto animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="bg-[#141816]/95 backdrop-blur-md border border-[#2a3a30] shadow-2xl rounded-2xl p-4 text-white">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#a855f7]/20 border border-[#a855f7]/40 flex items-center justify-center shrink-0 text-[#c084fc]">
                  <Sparkles size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white tracking-tight">
                      Official Field Boundaries Unavailable
                    </h4>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#f59e0b]/20 text-[#fbbf24] border border-[#f59e0b]/30">
                      Non-DFBK
                    </span>
                  </div>
                  <p className="text-xs text-[#9cb3a8] mt-1 leading-relaxed">
                    Official DFBK agricultural boundaries are currently available only in Brandenburg, Germany. You can use AI-powered satellite image analysis to detect potential agricultural field boundaries in this location.
                  </p>

                  <div className="mt-3.5 flex items-center gap-3">
                    {!isScanning ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleStartAiScan}
                          className="px-4 py-2 rounded-xl bg-[#a855f7] hover:bg-[#9333ea] text-white text-xs font-semibold flex items-center gap-2 shadow-[0_2px_12px_rgba(168,85,247,0.35)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Sparkles size={14} />
                          <span>Scan for Fields</span>
                        </button>

                        <div className="flex items-center gap-2 bg-[#222] px-3 py-1.5 rounded-xl border border-[#333] text-xs">
                          <Sliders size={12} className="text-[#c084fc]" />
                          <span className="text-[#aaa] text-[11px]">Threshold:</span>
                          <input
                            type="range"
                            min="0.10"
                            max="0.85"
                            step="0.05"
                            value={confidenceFilter}
                            onChange={(e) => setConfidenceFilter(parseFloat(e.target.value))}
                            className="w-20 accent-[#a855f7] cursor-pointer"
                          />
                          <strong className="text-white font-mono text-[11px]">
                            {(confidenceFilter * 100).toFixed(0)}%
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-1">
                          <div className="flex justify-between text-[11px] mb-1 font-medium text-[#c084fc]">
                            <span className="flex items-center gap-1.5">
                              <RefreshCw size={12} className="animate-spin text-[#c084fc]" />
                              {scanJob?.stage || 'Preparing satellite imagery'}
                            </span>
                            <span>{scanJob?.progress || 0}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[#222] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#a855f7] to-[#ec4899] transition-all duration-300 ease-out"
                              style={{ width: `${Math.max(scanJob?.progress || 0, 8)}%` }}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCancelAiScan}
                          className="px-2.5 py-1 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-[#aaa] hover:text-white text-xs transition"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  {scanError && (
                    <div className="mt-2 text-[11px] text-red-400 bg-red-950/40 border border-red-800/40 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      <span>{scanError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Field Prediction Review Panel — Always available once scanned or predictions exist */}
        {(hasScanned || predictions.length > 0) && showAiReviewPanel && (
          <div className="absolute bottom-6 right-6 z-[500] w-96 max-w-[calc(100%-48px)] bg-[#141615]/95 backdrop-blur-md rounded-2xl p-4 border border-[#a855f7]/40 shadow-2xl text-xs text-white">
            <div className="flex items-start justify-between border-b border-[#2a2a2a] pb-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-[#c084fc] tracking-wider flex items-center gap-1">
                    <Sparkles size={11} /> AI Satellite Predictions
                  </span>
                  <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-[#a855f7]/20 text-[#c084fc] border border-[#a855f7]/30">
                    Sentinel-2 CNN
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  {filteredPredictions.length > 0
                    ? `${filteredPredictions.length} Potential Fields Detected`
                    : 'No Fields at Current Threshold'}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowAiReviewPanel(false)}
                  className="p-1 rounded-md hover:bg-[#222] text-[#888] hover:text-white"
                  title="Minimize Review Panel"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Quick Stats Grid or Empty State Alert */}
            {filteredPredictions.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-[#1c1e1d] p-2 rounded-xl border border-[#262626]">
                  <div className="text-[10px] text-[#888]">Total Area</div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    {totalFilteredPredictedArea.toFixed(1)} ha
                  </div>
                </div>
                <div className="bg-[#1c1e1d] p-2 rounded-xl border border-[#262626]">
                  <div className="text-[10px] text-[#888]">Selected</div>
                  <div className="text-xs font-bold text-[#c084fc] mt-0.5">
                    {selectedPredictionIds.size} / {filteredPredictions.length}
                  </div>
                </div>
                <div className="bg-[#1c1e1d] p-2 rounded-xl border border-[#262626]">
                  <div className="text-[10px] text-[#888]">Avg Conf</div>
                  <div className="text-xs font-bold text-[#10b981] mt-0.5">
                    {(
                      (filteredPredictions.reduce((s, p) => s + p.properties.confidence, 0) /
                        (filteredPredictions.length || 1)) *
                      100
                    ).toFixed(0)}%
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/40 text-amber-300 text-xs mb-3 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <div className="font-semibold text-white">
                    0 fields meet {(confidenceFilter * 100).toFixed(0)}% threshold
                  </div>
                  <div className="text-[11px] text-[#aaa] mt-0.5 leading-relaxed">
                    {predictions.length > 0
                      ? `${predictions.length} candidate fields were detected below this threshold. Drag the slider below to lower the confidence threshold.`
                      : 'No fields detected in this satellite window. Adjust the threshold slider below or re-scan.'}
                  </div>
                </div>
              </div>
            )}

            {/* Confidence Threshold Slider — ALWAYS PRESENT AND INTERACTIVE */}
            <div className="bg-[#1c1e1d] p-2.5 rounded-xl border border-[#262626] mb-3 space-y-1.5">
              <div className="flex justify-between text-[11px] text-[#aaa]">
                <span className="flex items-center gap-1">
                  <Sliders size={12} className="text-[#a855f7]" /> Confidence Threshold:
                </span>
                <strong className="text-white font-mono">{(confidenceFilter * 100).toFixed(0)}%</strong>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.85"
                step="0.05"
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(parseFloat(e.target.value))}
                className="w-full accent-[#a855f7] cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-[#666] px-0.5">
                <span>10% (More fields)</span>
                <span>45% (Balanced)</span>
                <span>85% (Strict)</span>
              </div>
            </div>

            {/* Selection Controls & Actions */}
            {filteredPredictions.length > 0 ? (
              <>
                <div className="flex items-center justify-between text-[11px] mb-3 text-[#aaa]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllPredictions}
                      className="hover:text-white underline text-[11px]"
                    >
                      Select all
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={deselectAllPredictions}
                      className="hover:text-white underline text-[11px]"
                    >
                      Deselect all
                    </button>
                  </div>
                  <span className="text-[#888]">
                    {selectedPredictionsArea.toFixed(1)} ha chosen
                  </span>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={openSaveMultiPredictions}
                    disabled={selectedPredictionIds.size === 0}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#a855f7] hover:bg-[#9333ea] text-white flex items-center justify-center gap-2 shadow-[0_2px_12px_rgba(168,85,247,0.35)] transition disabled:opacity-40"
                  >
                    <Save size={14} />
                    <span>Save Confirmed Fields ({selectedPredictionIds.size})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStartAiScan}
                    disabled={isScanning}
                    className="w-full py-2 rounded-xl text-xs font-medium bg-[#222] hover:bg-[#2c2c2c] text-[#ccc] hover:text-white flex items-center justify-center gap-1.5 transition"
                  >
                    <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
                    <span>Re-scan Area</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setConfidenceFilter(0.20)}
                  className="w-full py-2 rounded-xl text-xs font-semibold bg-[#a855f7]/20 hover:bg-[#a855f7]/30 text-[#c084fc] border border-[#a855f7]/40 flex items-center justify-center gap-1.5 transition"
                >
                  <Sliders size={13} />
                  <span>Lower Threshold to 20%</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartAiScan}
                  disabled={isScanning}
                  className="w-full py-2 rounded-xl text-xs font-medium bg-[#222] hover:bg-[#2c2c2c] text-[#ccc] hover:text-white flex items-center justify-center gap-1.5 transition"
                >
                  <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
                  <span>Re-scan Area</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Floating Toggle Pill if Review Panel was minimized */}
        {(hasScanned || predictions.length > 0) && !showAiReviewPanel && (
          <button
            type="button"
            onClick={() => setShowAiReviewPanel(true)}
            className="absolute bottom-6 right-6 z-[500] px-3.5 py-2 rounded-xl bg-[#a855f7] hover:bg-[#9333ea] text-white text-xs font-semibold flex items-center gap-2 shadow-xl transition-all"
          >
            <Sparkles size={14} />
            <span>
              {filteredPredictions.length > 0
                ? `Show AI Detections (${filteredPredictions.length})`
                : `AI Threshold (${(confidenceFilter * 100).toFixed(0)}%)`}
            </span>
          </button>
        )}

        {/* Active AI Prediction Inspection Card */}
        {activePrediction && (
          <div className="absolute top-4 right-4 z-[500] w-84 bg-[#1a171e]/95 backdrop-blur-md rounded-2xl p-4 border border-[#a855f7]/50 shadow-2xl text-xs text-white">
            <div className="flex items-start justify-between border-b border-[#2e2638] pb-3 mb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#c084fc] tracking-wider flex items-center gap-1">
                  <Sparkles size={12} /> AI Detected Boundary
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  {activePrediction.properties.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePrediction(null)}
                className="p-1 rounded-md hover:bg-[#2c2436] text-[#888] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 mb-4">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-[#241e2c] p-2 rounded-lg border border-[#3b2e47]">
                  <div className="text-[10px] text-[#aaa]">Predicted Area</div>
                  <div className="text-sm font-bold text-white">
                    {activePrediction.properties.area_hectares.toFixed(2)} ha
                  </div>
                </div>
                <div className="bg-[#241e2c] p-2 rounded-lg border border-[#3b2e47]">
                  <div className="text-[10px] text-[#aaa]">Confidence</div>
                  <div className="text-sm font-bold text-[#10b981]">
                    {(activePrediction.properties.confidence * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#aaa] space-y-1 bg-[#241e2c] p-2.5 rounded-lg border border-[#3b2e47]">
                <div className="flex justify-between">
                  <span>Sensor:</span>
                  <span className="text-white">{activePrediction.properties.sensor}</span>
                </div>
                <div className="flex justify-between">
                  <span>Imagery Date:</span>
                  <span className="text-white">{activePrediction.properties.imagery_date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span className="text-white">{activePrediction.properties.model_version}</span>
                </div>
                <div className="flex justify-between">
                  <span>Region:</span>
                  <span className="text-[#c084fc] font-semibold">{activePrediction.properties.geographic_region}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => openSaveSinglePrediction(activePrediction)}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#1fa35b] text-white hover:bg-[#188a4c] flex items-center justify-center gap-1.5 shadow-md transition"
              >
                <Save size={14} /> Save to My Farm
              </button>

              <button
                type="button"
                onClick={() => toggleSelectPrediction(activePrediction.properties.id)}
                className={`w-full py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  selectedPredictionIds.has(activePrediction.properties.id)
                    ? 'bg-[#332440] text-[#c084fc] border border-[#a855f7]/50'
                    : 'bg-[#221a28] text-[#aaa] hover:text-white hover:bg-[#2d2236]'
                }`}
              >
                {selectedPredictionIds.has(activePrediction.properties.id) ? (
                  <>
                    <X size={13} /> Remove from Multi-Select
                  </>
                ) : (
                  <>
                    <Check size={13} /> Select for Batch Save
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Data Source & Legal Attribution pill */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[400] text-[10px] text-[#888] bg-black/60 px-3 py-1 rounded-full pointer-events-none">
          Data: © MLEUV, dl-de/by-2-0 · Digitales Feldblockkataster Brandenburg · EPSG:25833
        </div>
      </div>

      {/* Unified Save to My Farm Dialog Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#242424] border border-[#3a3a3a] rounded-2xl w-full max-w-md p-6 shadow-2xl text-white">
            <div className="flex items-start justify-between border-b border-[#333] pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  {modalMode === 'single'
                    ? 'Save Field to My Farm'
                    : modalMode === 'multi'
                      ? `Import ${selectedIds.size} Fields to Farm`
                      : modalMode === 'ai_single'
                        ? 'Save AI-Detected Field'
                        : modalMode === 'ai_multi'
                          ? `Save ${selectedPredictionIds.size} AI-Detected Fields`
                          : 'Save Custom Field'}
                </h3>
                <p className="text-xs text-[#aaa] mt-0.5">
                  Records this boundary in your persistent farm database.
                </p>
              </div>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-1 rounded-md hover:bg-[#333] text-[#888] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* Field Name (required) */}
              <div>
                <label className="block text-xs font-semibold text-[#ddd] mb-1.5">
                  Field Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={saveFieldName}
                  onChange={(e) => setSaveFieldName(e.target.value)}
                  placeholder="e.g. Field 1, North Pasture"
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#1fa35b]"
                  autoFocus
                />
              </div>

              {/* Farm Selection Dropdown / Create New Farm */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#ddd]">
                    Farm Assignment <span className="text-red-400">*</span>
                  </label>
                  {userFarms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewFarm(!isCreatingNewFarm)}
                      className="text-[11px] text-[#1fa35b] font-medium hover:underline"
                    >
                      {isCreatingNewFarm ? 'Use Existing Farm' : '+ Create New Farm'}
                    </button>
                  )}
                </div>

                {!isCreatingNewFarm && userFarms.length > 0 ? (
                  <select
                    value={selectedFarmId}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCreatingNewFarm(true);
                        setNewFarmName('Test Farm');
                      } else {
                        setSelectedFarmId(e.target.value);
                      }
                    }}
                    className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                  >
                    {userFarms.map((farm) => (
                      <option key={farm.id} value={farm.id}>
                        {farm.name} ({farm.location})
                      </option>
                    ))}
                    <option value="__NEW__">+ Create New Farm...</option>
                  </select>
                ) : (
                  <div className="space-y-2 p-3 bg-[#1c1c1c] rounded-xl border border-[#333]">
                    <div>
                      <span className="text-[11px] font-medium text-[#bbb] block mb-1">
                        New Farm Name <span className="text-red-400">*</span>
                      </span>
                      <input
                        type="text"
                        value={newFarmName}
                        onChange={(e) => setNewFarmName(e.target.value)}
                        placeholder="e.g. Test Farm"
                        className="w-full bg-[#121212] border border-[#3a3a3a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-[#bbb] block mb-1">
                        Location
                      </span>
                      <input
                        type="text"
                        value={newFarmLocation}
                        onChange={(e) => setNewFarmLocation(e.target.value)}
                        placeholder="e.g. Potsdam, Brandenburg"
                        className="w-full bg-[#121212] border border-[#3a3a3a] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#1fa35b]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Current Crop */}
              <div>
                <label className="block text-xs font-semibold text-[#ddd] mb-1.5">
                  Current Crop <span className="text-[#888] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={saveCrop}
                  onChange={(e) => setSaveCrop(e.target.value)}
                  placeholder="e.g. Winter wheat, Field peas, Cover crop"
                  className="w-full bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-xs text-white placeholder-[#666] focus:outline-none focus:border-[#1fa35b]"
                />
              </div>

              {/* Summary of Geometry */}
              <div className="bg-[#1c1c1c] p-3 rounded-xl border border-[#333] text-xs space-y-1 text-[#aaa]">
                <div className="flex justify-between">
                  <span>Boundary Type:</span>
                  <span className="text-white">
                    {modalMode === 'single'
                      ? 'Official DFBK Polygon'
                      : modalMode === 'multi'
                        ? `${selectedIds.size} Official DFBK Polygons`
                        : modalMode === 'ai_single'
                          ? 'AI Satellite Prediction (Sentinel-2 CNN)'
                          : modalMode === 'ai_multi'
                            ? `${selectedPredictionIds.size} AI Satellite Predictions`
                            : 'Farmer-Drawn Polygon'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Usable Area:</span>
                  <span className="text-white font-medium">
                    {modalMode === 'single' && activeFeature
                      ? `${(activeFeature.properties.official_net_ha || activeFeature.properties.calculated_area_ha).toFixed(2)} ha`
                      : modalMode === 'multi'
                        ? `${totalSelectedHectares.toFixed(2)} ha`
                        : modalMode === 'ai_single' && activePrediction
                          ? `${activePrediction.properties.area_hectares.toFixed(2)} ha (${(activePrediction.properties.confidence * 100).toFixed(0)}% conf)`
                          : modalMode === 'ai_multi'
                            ? `${selectedPredictionsArea.toFixed(2)} ha`
                            : 'Calculated in EPSG:25833'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Persistence:</span>
                  <span className="text-[#1fa35b] font-medium">Durable SQLite Database</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-lg bg-[#333] hover:bg-[#444] text-xs font-medium text-[#ccc]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving || !saveFieldName.trim()}
                className="px-5 py-2 rounded-lg bg-[#1fa35b] hover:bg-[#188a4c] font-semibold text-xs text-white flex items-center gap-1.5 disabled:opacity-50 shadow-md"
              >
                {saving && <RefreshCw size={13} className="animate-spin" />}
                {saving ? 'Saving...' : 'Confirm & Save to Farm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
