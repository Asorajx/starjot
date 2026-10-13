import type { IconName } from '../components/Icon';


/* =========================
   Screens
   ========================= */

/* Which space the app is showing. Settings opens as a panel over it, so it is not a screen. */
export type ScreenId = 'notes' | 'boardspace';

export type Screen = {
  id: ScreenId;
  label: string;
  icon: IconName;
};

/* In navigation order. */
export const SCREENS: Screen[] = [
  { id: 'notes', label: 'Notespace', icon: 'book-open' },
  { id: 'boardspace', label: 'Boardspace', icon: 'layout-dashboard' }
];

export function screenLabel(id: ScreenId) {
  return SCREENS.find(screen => screen.id === id)?.label ?? id;
}
