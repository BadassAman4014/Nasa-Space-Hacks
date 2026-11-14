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
import { useI18n } from '../../i18n';

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
  const { t, formatHectares } = useI18n();

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
              <strong>{t('aiAssistant.welcomeGreeting')}</strong> {t('aiAssistant.welcomeQuestion')}
            </p>
            <p className="ai-greeting-sub">
              {t('aiAssistant.welcomeSub')}
            </p>
          </div>
        </div>

        {step === 'select-field' && (
          <div className="field-cards-grid">
            {isLoadingFields ? (
              <div className="fields-loading-state">
                <div className="loading-spinner" />
                <span>{t('aiAssistant.loadingFields')}</span>
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
                          <span className="field-card-area">{formatHectares(field.area_ha)}</span>
                        )}
                      </div>
                      <p className="field-card-farm">
                        {field.farm_name}
                        {field.crop_name ? ` • ${field.crop_name}` : ''}
                      </p>
                      <div className="field-card-footer">
                        {isSpecial ? (
                          <span className="field-card-badge">{t('aiAssistant.systemInquiry')}</span>
                        ) : (
                          <span className="field-card-badge status-verified">
                            <ShieldCheck size={12} className="inline mr-1 text-muted-sage" />
                            {t('aiAssistant.verifiedBadge')}
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
            <span className="chip-label">{t('aiAssistant.selectedLabel')}</span>
            <span className="chip-value">
              {selectedField.name} {selectedField.area_ha > 0 ? `(${formatHectares(selectedField.area_ha)})` : ''}
            </span>
            <button
              type="button"
              className="chip-change-btn"
              onClick={onReset}
              title="Change field selection"
            >
              {t('aiAssistant.changeFieldBtn')}
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
                {t('aiAssistant.whatToExplore', { name: selectedField.name })}
              </p>
              <p className="ai-greeting-sub">
                {t('aiAssistant.selectDomainSub')}
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
                <h4 className="category-title">{t('aiAssistant.catCropTitle')}</h4>
                <p className="category-description">
                  {t('aiAssistant.catCropDesc')}
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
                <h4 className="category-title">{t('aiAssistant.catFieldTitle')}</h4>
                <p className="category-description">
                  {t('aiAssistant.catFieldDesc')}
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
                <h4 className="category-title">{t('aiAssistant.catSoilTitle')}</h4>
                <p className="category-description">
                  {t('aiAssistant.catSoilDesc')}
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
                <h4 className="category-title">{t('aiAssistant.catFertilizerTitle')}</h4>
                <p className="category-description">
                  {t('aiAssistant.catFertilizerDesc')}
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
