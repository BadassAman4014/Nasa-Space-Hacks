import React from 'react';
import { Settings, CircleHelp } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarUserProfile } from './SidebarUserProfile';

interface SidebarBottomSectionProps {
  onSettingsClick?: () => void;
  onHelpClick?: () => void;
  onProfileClick?: () => void;
}

export const SidebarBottomSection: React.FC<SidebarBottomSectionProps> = ({
  onSettingsClick,
  onHelpClick,
  onProfileClick,
}) => {
  return (
    <div className="floating-sidebar-bottom">
      <div className="bottom-nav-items">
        <SidebarNavItem
          id="settings"
          label="Settings"
          icon={Settings}
          onClick={onSettingsClick || (() => {})}
        />
        <SidebarNavItem
          id="help"
          label="Help & Support"
          icon={CircleHelp}
          onClick={onHelpClick || (() => {})}
        />
      </div>

      <div className="floating-divider" role="separator" />

      <SidebarUserProfile onClick={onProfileClick} />
    </div>
  );
};
