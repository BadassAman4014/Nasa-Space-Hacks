import { BarChart3, CircleHelp, CloudSun, FileText, Globe2, Leaf, Map, Settings, SlidersHorizontal, Sparkles, Sprout, Users, X } from 'lucide-react';

type PageKey = 'dashboard' | 'fields' | 'analytics' | 'weather' | 'environment' | 'farmer-profile' | 'rotation-studio' | 'scenario-simulator' | 'reports';

const items: { id: PageKey; label: string; group: number; icon: typeof Map }[] = [
  { id: 'dashboard',         label: 'Dashboard',       group: 1, icon: BarChart3 },
  { id: 'fields',            label: 'Field Explorer',  group: 1, icon: Map },
  { id: 'analytics',         label: 'Field Analytics', group: 1, icon: Sparkles },
  { id: 'weather',           label: 'Weather',         group: 1, icon: CloudSun },
  { id: 'environment',       label: 'Environmental',   group: 1, icon: Globe2 },
  { id: 'farmer-profile',    label: 'Farmer Profile',  group: 2, icon: Users },
  { id: 'rotation-studio',   label: 'Rotation Studio', group: 2, icon: Sprout },
  { id: 'scenario-simulator',label: 'Scenarios',       group: 2, icon: SlidersHorizontal },
  { id: 'reports',           label: 'Reports',         group: 3, icon: FileText },
];

export function SidebarV2({
  page,
  navigate,
  mobileOpen,
  onClose,
}: {
  page: PageKey;
  navigate: (page: PageKey) => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <aside className={`sidebar sidebar-v2 ${mobileOpen ? 'open' : ''}`}>
      {/* Brand */}
      <div className="rail-brand">
        <Leaf size={18} color="#1fa35b" />
        <span className="rail-brand-label">
          FieldShift<em>AI</em>
        </span>
        <button className="mobile-close" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      {/* Nav links */}
      <nav className="rail-nav">
        {items.map((item, i) => (
          <div key={item.id}>
            {i > 0 && items[i - 1].group !== item.group && <i className="rail-divider" />}
            <button
              className={`rail-item ${page === item.id ? 'active' : ''} ${item.id === 'rotation-studio' ? 'new' : ''}`}
              aria-label={item.label}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} strokeWidth={1.75} />
              <span>{item.label}</span>
            </button>
          </div>
        ))}
      </nav>

      {/* Bottom utility links + user */}
      <div className="rail-bottom">
        <button className="rail-item" aria-label="Settings">
          <Settings size={18} />
          <span>Settings</span>
        </button>
        <button className="rail-item" aria-label="Help">
          <CircleHelp size={18} />
          <span>Help &amp; Support</span>
        </button>
        <div className="rail-avatar">
          <div className="rail-avatar-circle">JS</div>
          <span>Jonas Schmidt</span>
        </div>
      </div>
    </aside>
  );
}
