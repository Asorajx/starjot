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

/* The three independent areas of the application, in navigation order. */
export const WORKSPACES: Workspace[] = [
  { id: 'notes', label: 'Notespace', icon: 'book-open' },
  { id: 'workboard', label: 'Workboard', icon: 'layout-dashboard' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

export function workspaceLabel(id: WorkspaceId) {
  return WORKSPACES.find(workspace => workspace.id === id)?.label ?? id;
}
