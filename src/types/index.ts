export interface Farm { id: string; name: string; location: string; areaHa: number; fieldCount: number; }
export interface FieldGeometry { type: 'Polygon'; coordinates: number[][][]; }
export interface Field { id: string; farmId: string; name: string; areaHa: number; currentCrop: string; geometry: FieldGeometry; }
export interface Crop { id: string; name: string; family: string; waterDemand: 'low' | 'medium' | 'high'; nitrogenFixing: boolean; }
export interface CropHistory { year: number; cropId: string; }
export interface SoilProfile { organicCarbonPct: number; pH: number; sandPct: number; clayPct: number; siltPct: number; texture: string; }
export interface EnvironmentalObservation { source: string; observedAt: string; value: number; unit: string; classification: 'measured' | 'satellite-derived' | 'modelled' | 'estimated'; }
export interface ClimateProfile { rainfallMm: number; temperatureC: number; rainfallAnomalyPct: number; heatExposureDays: number; observations: EnvironmentalObservation[]; }
export interface VegetationProfile { ndvi: number; stressLevel: 'low' | 'moderate' | 'high'; observations: EnvironmentalObservation[]; }
export interface FarmerPreferences { waterConservation: number; soilHealth: number; droughtResilience: number; nitrogenContribution: number; erosionReduction: number; profitability: number; cropDiversity: number; }
export interface RotationYear { year: number; crop: string; rationale: string; }
export interface RotationStrategy { id: string; name: string; description: string; score: number; years: RotationYear[]; benefits: string[]; risks: string[]; }
export interface Recommendation { id: string; fieldId: string; strategies: RotationStrategy[]; confidence: 'low' | 'moderate' | 'high'; }
export interface RecommendationEvidence { source: string; title: string; explanation: string; observedAt: string; }
export interface ClimateScenario { rainfallChangePct: number; temperatureChangeC: number; heatExposureDays: number; }
export interface ModelMetadata { name: string; version: string; type: string; uncertainty: string; limitations: string[]; }
