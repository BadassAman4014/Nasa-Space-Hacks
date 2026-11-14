import React, { useEffect, useState } from 'react';
import { SidebarBrand } from './SidebarBrand';
import { SidebarNavigation, type PageKey } from './SidebarNavigation';
import { SidebarBottomSection } from './SidebarBottomSection';
import { SettingsModal } from '../common/SettingsModal';
import { useI18n } from '../../i18n';
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
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    setSettingsOpen(true);
  };

  const handleHelp = () => {
    if (notify) {
      notify(t('nav.helpCenter') + ': FieldShift AI Support is active');
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        notify={notify}
      />
    </>
  );
};

export default FloatingSidebar;
