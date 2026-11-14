import React from 'react';
import { MoreHorizontal } from 'lucide-react';

interface SidebarUserProfileProps {
  name?: string;
  role?: string;
  initials?: string;
  onClick?: () => void;
}

export const SidebarUserProfile: React.FC<SidebarUserProfileProps> = ({
  name = 'Jonas Schmidt',
  role = 'Farm manager',
  initials = 'JS',
  onClick,
}) => {
  return (
    <div
      className="floating-user-profile"
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={`${name} · ${role}`}
    >
      <div className="profile-avatar-circle">
        <span>{initials}</span>
      </div>
      <div className="profile-info-wrap">
        <strong className="profile-name">{name}</strong>
        <small className="profile-role">{role}</small>
      </div>
      <MoreHorizontal size={16} className="profile-more-icon" />
      <div className="floating-tooltip" role="tooltip">{name}</div>
    </div>
  );
};
