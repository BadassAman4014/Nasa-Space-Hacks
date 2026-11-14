import React, { useEffect } from 'react';
import { SidebarBrand } from './SidebarBrand';
import { SidebarNavigation, type PageKey } from './SidebarNavigation';
import { SidebarBottomSection } from './SidebarBottomSection';
import './floating-sidebar.css';

export interface FloatingSidebarProps {
  page: PageKey;
  navigate: (page: PageKey) => void;
  mobileOpen: boolean;
  onClose: () => void;
  notify?: (message: string) => void;
}

export const FloatingSidebar: React.FC<FloatingSidebarProps> = ({
  page,
  navigate,
  mobileOpen,
  onClose,
  notify,
}) => {
  // Close on Escape key on mobile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onClose]);

  const handleSettings = () => {
    if (notify) {
      notify('Settings & preferences are managed in Farmer Profile');
    }
  };

  const handleHelp = () => {
    if (notify) {
      notify('FieldShift AI Help Center is active');
    }
  };

  const handleProfile = () => {
    navigate('farmer-profile');
  };

  return (
    <>
      {/* Mobile Backdrop overlay */}
      {mobileOpen && (
        <div
          className="floating-sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Grid column spacer that reserves the sidebar column in .app-shell */}
      <div className="floating-sidebar-slot" aria-hidden="true">
        {/* Floating Sidebar Container */}
        <aside
          className={`floating-sidebar-container ${mobileOpen ? 'mobile-open' : ''}`}
          aria-label="Sidebar navigation"
        >
          {/* Brand / Logo */}
          <SidebarBrand
            onClose={onClose}
            onBrandClick={() => navigate('dashboard')}
          />

          {/* Main Navigation */}
          <SidebarNavigation page={page} navigate={navigate} />

          {/* Bottom Section (Settings, Help & Support, User Profile) */}
          <SidebarBottomSection
            onSettingsClick={handleSettings}
            onHelpClick={handleHelp}
            onProfileClick={handleProfile}
          />
        </aside>
      </div>
    </>
  );
};

export default FloatingSidebar;
