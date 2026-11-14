import React from 'react';
import {
  BarChart3,
  Map,
  Sparkles,
  Bot,
  CloudSun,
  Globe2,
  Users,
  Sprout,
  SlidersHorizontal,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';

export type PageKey =
  | 'dashboard'
  | 'fields'
  | 'analytics'
  | 'ai-assistant'
  | 'weather'
  | 'environment'
  | 'farmer-profile'
  | 'rotation-studio'
  | 'scenario-simulator'
  | 'reports';

export interface NavItemConfig {
  id: PageKey;
  label: string;
  group: 1 | 2 | 3;
  icon: LucideIcon;
  badge?: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  // Group 1 — Field Management & AI
  { id: 'dashboard',          label: 'Dashboard',        group: 1, icon: BarChart3 },
  { id: 'fields',             label: 'Field Explorer',   group: 1, icon: Map },
  { id: 'analytics',          label: 'Field Analytics',  group: 1, icon: Sparkles },
  { id: 'ai-assistant',       label: 'AI Assistant',     group: 1, icon: Bot, badge: 'AI' },
  { id: 'weather',            label: 'Weather',          group: 1, icon: CloudSun },
  { id: 'environment',        label: 'Environmental',    group: 1, icon: Globe2 },

  // Group 2 — Farm Operations
  { id: 'farmer-profile',     label: 'Farmer Profile',   group: 2, icon: Users },
  { id: 'rotation-studio',    label: 'Rotation Studio',  group: 2, icon: Sprout, badge: 'NEW' },
  { id: 'scenario-simulator', label: 'Scenarios',        group: 2, icon: SlidersHorizontal },

  // Group 3 — Reporting
  { id: 'reports',            label: 'Reports',          group: 3, icon: FileText },
];

interface SidebarNavigationProps {
  page: PageKey;
  navigate: (page: PageKey) => void;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ page, navigate }) => {
  return (
    <nav className="floating-sidebar-nav" aria-label="Main application navigation">
      {NAV_ITEMS.map((item, index) => {
        const isNewGroup = index > 0 && NAV_ITEMS[index - 1].group !== item.group;
        return (
          <React.Fragment key={item.id}>
            {isNewGroup && <div className="floating-divider" role="separator" />}
            <SidebarNavItem
              id={item.id}
              label={item.label}
              icon={item.icon}
              isActive={page === item.id}
              badge={item.badge}
              onClick={() => navigate(item.id)}
            />
          </React.Fragment>
        );
      })}
    </nav>
  );
};
