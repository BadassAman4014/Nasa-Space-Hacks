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
import { useI18n } from '../../i18n';

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
  labelKey: string;
  defaultLabel: string;
  group: 1 | 2 | 3;
  icon: LucideIcon;
  badge?: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  // Group 1 — Field Management & AI
  { id: 'dashboard',          labelKey: 'nav.dashboard',        defaultLabel: 'Dashboard',        group: 1, icon: BarChart3 },
  { id: 'fields',             labelKey: 'nav.fields',           defaultLabel: 'Field Explorer',   group: 1, icon: Map },
  { id: 'analytics',          labelKey: 'nav.analytics',        defaultLabel: 'Field Analytics',  group: 1, icon: Sparkles },
  { id: 'ai-assistant',       labelKey: 'nav.aiAssistant',      defaultLabel: 'AI Assistant',     group: 1, icon: Bot, badge: 'AI' },
  { id: 'weather',            labelKey: 'nav.weather',          defaultLabel: 'Weather',          group: 1, icon: CloudSun },
  { id: 'environment',        labelKey: 'nav.environment',      defaultLabel: 'Environmental',    group: 1, icon: Globe2 },

  // Group 2 — Farm Operations
  { id: 'farmer-profile',     labelKey: 'nav.farmerProfile',     defaultLabel: 'Farmer Profile',   group: 2, icon: Users },
  { id: 'rotation-studio',    labelKey: 'nav.rotationStudio',    defaultLabel: 'Rotation Studio',  group: 2, icon: Sprout, badge: 'NEW' },
  { id: 'scenario-simulator', labelKey: 'nav.scenarioSimulator', defaultLabel: 'Scenarios',        group: 2, icon: SlidersHorizontal },

  // Group 3 — Reporting
  { id: 'reports',            labelKey: 'nav.reports',          defaultLabel: 'Reports',          group: 3, icon: FileText },
];

interface SidebarNavigationProps {
  page: PageKey;
  navigate: (page: PageKey) => void;
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({ page, navigate }) => {
  const { t } = useI18n();

  return (
    <nav className="floating-sidebar-nav" aria-label="Main application navigation">
      {NAV_ITEMS.map((item, index) => {
        const isNewGroup = index > 0 && NAV_ITEMS[index - 1].group !== item.group;
        const translatedLabel = t(item.labelKey) || item.defaultLabel;
        const translatedBadge =
          item.badge === 'NEW'
            ? t('nav.newBadge')
            : item.badge === 'AI'
            ? t('nav.aiBadge')
            : item.badge;

        return (
          <React.Fragment key={item.id}>
            {isNewGroup && <div className="floating-divider" role="separator" />}
            <SidebarNavItem
              id={item.id}
              label={translatedLabel}
              icon={item.icon}
              isActive={page === item.id}
              badge={translatedBadge}
              onClick={() => navigate(item.id)}
            />
          </React.Fragment>
        );
      })}
    </nav>
  );
};
