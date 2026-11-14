import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useI18n } from '../../i18n';

interface SidebarUserProfileProps {
  name?: string;
  role?: string;
  initials?: string;
  onClick?: () => void;
}

export const SidebarUserProfile: React.FC<SidebarUserProfileProps> = ({
  name,
  role,
  initials = 'JS',
  onClick,
}) => {
  const { t } = useI18n();
  const displayName = name || t('nav.userName') || 'Jonas Schmidt';
  const displayRole = role || t('nav.userRole') || 'Farm manager';

  return (
    <div
      className="floating-user-profile"
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={`${displayName} · ${displayRole}`}
    >
      <div className="profile-avatar-circle">
        <span>{initials}</span>
      </div>
      <div className="profile-info-wrap">
        <strong className="profile-name">{displayName}</strong>
        <small className="profile-role">{displayRole}</small>
      </div>
      <MoreHorizontal size={16} className="profile-more-icon" />
      <div className="floating-tooltip" role="tooltip">{displayName}</div>
    </div>
  );
};
