import { FloatingSidebar, type FloatingSidebarProps } from '../layout/FloatingSidebar';
export type PageKey =
  | 'dashboard'
  | 'fields'
  | 'analytics'
  | 'ai-assistant'
  | 'weather'
  | 'rotation-studio';

export function SidebarV2(props: FloatingSidebarProps) {
  return <FloatingSidebar {...props} />;
}

export { FloatingSidebar };
export default FloatingSidebar;
