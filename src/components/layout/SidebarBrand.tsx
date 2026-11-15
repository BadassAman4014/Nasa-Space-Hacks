import React from 'react';
import { Leaf, X } from 'lucide-react';
import { useI18n } from '../../i18n';

interface SidebarBrandProps {
  onClose?: () => void;
  onBrandClick?: () => void;
}

export const SidebarBrand: React.FC<SidebarBrandProps> = ({ onClose, onBrandClick }) => {
  const { language, setLanguage } = useI18n();
  return (
    <div
      className="floating-sidebar-brand"
      onClick={onBrandClick}
      role="button"
      tabIndex={0}
      title="Farmily"
    >
      <div className="brand-icon-tile">
        <Leaf size={18} strokeWidth={2.2} />
      </div>
      <div className="brand-text-wrap">
        <span className="brand-name">Farmily</span>
      </div>
      <div className="brand-language-toggle" role="group" aria-label="Language selector" onClick={(event) => event.stopPropagation()}>
        <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
        <span aria-hidden="true">|</span>
        <button type="button" aria-pressed={language === 'de'} onClick={() => setLanguage('de')}>DE</button>
      </div>
      {onClose && (
        <button
          type="button"
          className="floating-mobile-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
};
