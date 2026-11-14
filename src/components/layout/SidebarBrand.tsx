import React from 'react';
import { Leaf, X } from 'lucide-react';

interface SidebarBrandProps {
  onClose?: () => void;
  onBrandClick?: () => void;
}

export const SidebarBrand: React.FC<SidebarBrandProps> = ({ onClose, onBrandClick }) => {
  return (
    <div
      className="floating-sidebar-brand"
      onClick={onBrandClick}
      role="button"
      tabIndex={0}
      title="FieldShift AI"
    >
      <div className="brand-icon-tile">
        <Leaf size={18} strokeWidth={2.2} />
      </div>
      <div className="brand-text-wrap">
        <span className="brand-name">
          FieldShift<em className="brand-accent">AI</em>
        </span>
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
