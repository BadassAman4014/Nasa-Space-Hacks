import { FloatingSidebar, type FloatingSidebarProps } from '../layout/FloatingSidebar';
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

export function SidebarV2(props: FloatingSidebarProps) {
  return <FloatingSidebar {...props} />;
}

export { FloatingSidebar };
export default FloatingSidebar;
