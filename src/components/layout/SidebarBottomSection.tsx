import React from 'react';
import { Settings, CircleHelp } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarUserProfile } from './SidebarUserProfile';
import { useI18n } from '../../i18n';

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
  const { t } = useI18n();

  return (
    <div className="floating-sidebar-bottom">
      <div className="bottom-nav-items">
        <SidebarNavItem
          id="settings"
          label={t('nav.settings')}
          icon={Settings}
          onClick={onSettingsClick || (() => { })}
        />
        <SidebarNavItem
          id="help"
          label={t('nav.helpCenter')}
          icon={CircleHelp}
          onClick={onHelpClick || (() => { })}
        />
      </div>

      <div className="floating-divider" role="separator" />

      <SidebarUserProfile onClick={onProfileClick} />
    </div>
  );
};
