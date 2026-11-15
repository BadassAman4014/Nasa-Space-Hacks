import React from 'react';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

export const SidebarBottomSection: React.FC = () => {
  return (
    <div className="floating-sidebar-bottom">
      <div className="sidebar-language-selector sidebar-language-selector--full">
        <LanguageSwitcher variant="pill" />
      </div>
      <div className="sidebar-language-selector sidebar-language-selector--compact">
        <LanguageSwitcher variant="icon-only" />
      </div>
    </div>
  );
};
