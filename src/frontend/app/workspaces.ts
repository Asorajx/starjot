import type { IconName } from '../components/Icon';


/* =========================
   Workspaces
   ========================= */

export type WorkspaceId = 'notes' | 'workboard' | 'settings';

export type Workspace = {
  id: WorkspaceId;
  label: string;
  icon: IconName;
};

/* The areas of the app, in navigation order: the spaces (Notespace and Workboard), then */
/* Settings. The code keeps its earlier name, workspace, for what the app now calls a space. */
export const WORKSPACES: Workspace[] = [
  { id: 'notes', label: 'Notespace', icon: 'book-open' },
  { id: 'workboard', label: 'Workboard', icon: 'layout-dashboard' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

export function workspaceLabel(id: WorkspaceId) {
  return WORKSPACES.find(workspace => workspace.id === id)?.label ?? id;
}
