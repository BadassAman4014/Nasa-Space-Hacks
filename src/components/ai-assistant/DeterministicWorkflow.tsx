import React from 'react';
import {
  MapPin,
  Layers,
  HelpCircle,
  Sprout,
  Map as MapIcon,
  FlaskConical,
  Wheat,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import type { FieldOption, FieldCategory } from './types';

interface DeterministicWorkflowProps {
  step: 'select-field' | 'select-category';
  fields: FieldOption[];
  selectedField: FieldOption | null;
  selectedCategory: FieldCategory | null;
  isLoadingFields: boolean;
  onSelectField: (field: FieldOption) => void;
  onSelectCategory: (category: FieldCategory) => void;
  onReset: () => void;
}

export const DeterministicWorkflow: React.FC<DeterministicWorkflowProps> = ({
  step,
  fields,
  selectedField,
  selectedCategory,
  isLoadingFields,
  onSelectField,
  onSelectCategory,
  onReset,
}) => {
  return (
    <div className="deterministic-workflow-container">
      {/* STEP 1: Select Field */}
      <div className="workflow-step-card">
        <div className="ai-message-bubble greeting-bubble">
          <div className="ai-avatar-badge">
            <Sparkles size={15} />
          </div>
          <div className="ai-bubble-content">
            <p className="ai-greeting-text">
              <strong>Hello. Welcome to your AI Farming Assistant.</strong> Which field would you like to explore today?
            </p>
            <p className="ai-greeting-sub">
              Select one of your registered fields or choose a comparative inquiry:
            </p>
          </div>
        </div>

        {step === 'select-field' && (
          <div className="field-cards-grid">
            {isLoadingFields ? (
              <div className="fields-loading-state">
                <div className="loading-spinner" />
                <span>Loading registered fields...</span>
              </div>
            ) : (
              fields.map((field) => {
                const isSelected = selectedField?.id === field.id;
                const isSpecial = field.is_special;

                return (
                  <button
                    key={field.id}
                    type="button"
                    className={`field-select-card ${isSelected ? 'selected' : ''} ${
                      isSpecial ? 'special-card' : ''
                    }`}
                    onClick={() => onSelectField(field)}
                  >
                    <div className="field-card-icon">
                      {isSpecial && field.id === 'all' ? (
                        <Layers size={18} />
                      ) : isSpecial ? (
                        <HelpCircle size={18} />
                      ) : (
                        <MapPin size={18} />
                      )}
                    </div>
                    <div className="field-card-body">
                      <div className="field-card-header">
                        <span className="field-card-title">{field.name}</span>
                        {!isSpecial && field.area_ha > 0 && (
                          <span className="field-card-area">{field.area_ha} ha</span>
                        )}
                      </div>
                      <p className="field-card-farm">
                        {field.farm_name}
                        {field.crop_name ? ` • ${field.crop_name}` : ''}
                      </p>
                      <div className="field-card-footer">
                        {isSpecial ? (
                          <span className="field-card-badge">System inquiry</span>
                        ) : (
                          <span className="field-card-badge status-verified">
                            <ShieldCheck size={12} className="inline mr-1 text-muted-sage" />
                            ISRIC & DFBK Verified
                          </span>
                        )}
                        <ArrowRight size={13} className="card-arrow" />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Selected Field Chip in review state */}
        {selectedField && step !== 'select-field' && (
          <div className="selected-entity-chip">
            <span className="chip-label">Selected:</span>
            <span className="chip-value">
              {selectedField.name} {selectedField.area_ha > 0 ? `(${selectedField.area_ha} ha)` : ''}
            </span>
            <button
              type="button"
              className="chip-change-btn"
              onClick={onReset}
              title="Change field selection"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* STEP 2: Select Topic / Category */}
      {selectedField && step === 'select-category' && (
        <div className="workflow-step-card animate-fade-in-up">
          <div className="ai-message-bubble">
            <div className="ai-avatar-badge">
              <Sparkles size={15} />
            </div>
            <div className="ai-bubble-content">
              <p className="ai-greeting-text">
                What would you like to explore regarding <strong>{selectedField.name}</strong>?
              </p>
              <p className="ai-greeting-sub">
                Select an agronomic domain to calibrate ground-truth intelligence:
              </p>
            </div>
          </div>

          <div className="category-cards-grid">
            {/* Category 1: Crop */}
            <button
              type="button"
              className={`category-card ${selectedCategory === 'crop' ? 'selected' : ''}`}
              onClick={() => onSelectCategory('crop')}
            >
              <div className="category-card-icon">
                <Sprout size={18} />
              </div>
              <div className="category-card-content">
                <h4 className="category-title">Crop</h4>
                <p className="category-description">
                  Growth stages, planting calendar & disease diagnostics
                </p>
              </div>
            </button>

            {/* Category 2: Field */}
            <button
              type="button"
              className={`category-card ${selectedCategory === 'field' ? 'selected' : ''}`}
              onClick={() => onSelectCategory('field')}
            >
              <div className="category-card-icon">
                <MapIcon size={18} />
              </div>
              <div className="category-card-content">
                <h4 className="category-title">Field</h4>
                <p className="category-description">
                  Boundary coordinates, Sentinel-2 NDVI & elevation
                </p>
              </div>
            </button>

            {/* Category 3: Soil */}
            <button
              type="button"
              className={`category-card ${selectedCategory === 'soil' ? 'selected' : ''}`}
              onClick={() => onSelectCategory('soil')}
            >
              <div className="category-card-icon">
                <FlaskConical size={18} />
              </div>
              <div className="category-card-content">
                <h4 className="category-title">Soil</h4>
                <p className="category-description">
                  ISRIC SoilGrids parameters: pH, SOC, texture & CEC
                </p>
              </div>
            </button>

            {/* Category 4: Fertilizers */}
            <button
              type="button"
              className={`category-card ${selectedCategory === 'fertilizer' ? 'selected' : ''}`}
              onClick={() => onSelectCategory('fertilizer')}
            >
              <div className="category-card-icon">
                <Wheat size={18} />
              </div>
              <div className="category-card-content">
                <h4 className="category-title">Fertilizers</h4>
                <p className="category-description">
                  DüV nutrient balances, split nitrogen & organic limits
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
