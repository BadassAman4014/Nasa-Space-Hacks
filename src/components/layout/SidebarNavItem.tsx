import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface SidebarNavItemProps {
  id: string;
  label: string;
  icon: LucideIcon;
  isActive?: boolean;
  badge?: string;
  onClick: () => void;
  ariaLabel?: string;
}

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  id,
  label,
  icon: Icon,
  isActive = false,
  badge,
  onClick,
  ariaLabel,
}) => {
  return (
    <button
      type="button"
      className={`floating-nav-item ${isActive ? 'active' : ''} ${badge ? 'has-badge' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel || label}
      aria-current={isActive ? 'page' : undefined}
      data-nav-id={id}
    >
      <div className="nav-item-icon-tile">
        <Icon size={18} strokeWidth={isActive ? 2.2 : 1.75} />
      </div>
      <span className="nav-item-label">{label}</span>
      {badge && <span className="nav-item-badge">{badge}</span>}
      <div className="floating-tooltip" role="tooltip">{label}</div>
    </button>
  );
};
