import type { IconName } from '../components/Icon';


/* =========================
   Screens
   ========================= */

/* What the app is showing: one of the spaces (Notespace or Boardspace), or Settings. */
export type ScreenId = 'notes' | 'boardspace' | 'settings';

export type Screen = {
  id: ScreenId;
  label: string;
  icon: IconName;
};

/* In navigation order: the spaces, then Settings. */
export const SCREENS: Screen[] = [
  { id: 'notes', label: 'Notespace', icon: 'book-open' },
  { id: 'boardspace', label: 'Boardspace', icon: 'layout-dashboard' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
];

export function screenLabel(id: ScreenId) {
  return SCREENS.find(screen => screen.id === id)?.label ?? id;
}
