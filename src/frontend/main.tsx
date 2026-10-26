import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyTheme } from './app/preferences';
import { startFluidHover } from './app/fluidHover';
import { startWarmTooltips } from './app/warmTooltips';
import { startFittingTooltips } from './app/fitTooltips';
import { startKeyboardMark } from './app/keyboardMark';
import { startMenuKeys } from './app/menuKeys';
import { removeUnusedImages } from './notespace/imageStore';
import { imageIdsIn } from './notespace/editor/images/images';
import { getNotes, getTrash, notesReadCleanly } from './notespace/store';
import { damagedOnLoad } from '../backend/storage/damagedCopies';
import { getBoard } from './boardspace/board';
import { showToast } from './lib/toasts';

/* Styles load in their original cascade order to preserve the design. */
import './app/styles.css';
import './app/accents.css';
import './app/fluidHover.css';
import './notespace/home.css';
import './home/starjotHome.css';
import './search/search.css';
import './notespace/editor/editor.css';
import './notespace/editor/text/text.css';
import './notespace/editor/code/code.css';
import './notespace/editor/links/links.css';
import './notespace/editor/format/format.css';
import './notespace/editor/find/find.css';
import './components/emoji-picker.css';
import './components/dropdown.css';
import './components/dateTimePicker.css';
import './notespace/editor/images/images.css';
import './notespace/editor/tables/tables.css';
import './notespace/editor/drawing/drawing.css';
import './notespace/canvas/canvas.css';
import './notespace/export/export.css';
import './notespace/print.css';
import './boardspace/boardspace.css';
import './settings/settings.css';
import './app/responsive.css';
import './app/density.css';
import './boardspace/timeline.css';
import './app/dark-palette.css';
import './app/dark-theme.css';
import './app/dark-overrides.css';

/* Apply the saved light or dark theme before the first render, so the page never flashes. */
applyTheme();

/* Hover highlights in the sidebar, Settings and menus glide from item to item. */
startFluidHover();
startWarmTooltips();
startFittingTooltips();
startKeyboardMark();
startMenuKeys();

/* New lines typed in a note become paragraphs, so each line maps cleanly to one block. */
document.execCommand('defaultParagraphSeparator', false, 'p');

/* Images no note uses any more (deleted from notes, or in notes deleted for good) are removed */
/* from the image store when the app opens; notes in Trash keep theirs. Never when the saved */
/* notes could not be read: every image would look unused. */
if (notesReadCleanly()) {
  const kept = [...getNotes(), ...getTrash().flatMap(entry => entry.notes)];
  removeUnusedImages(new Set(kept.flatMap(note => imageIdsIn(note.content))));
}

/* Saved data that could not be read was kept aside (or left untouched) while loading; say so */
/* once. Loading the board here makes sure its saved project has been checked too. */
getBoard();
const damaged = damagedOnLoad();
if (damaged.length) {
  const names = damaged.map(item => item.label.toLowerCase()).join(' and ');
  const unsaved = damaged.filter(item => !item.kept);
  showToast({
    kind: 'error',
    stay: true,
    title: `Some saved ${names} could not be read`,
    description: unsaved.length
      ? `Starjot will not save over them, so changes to ${unsaved.map(item => item.label.toLowerCase()).join(' and ')} are not kept for now. Free up space, then reload.`
      : 'A copy was kept, so nothing was lost. You can download it from Settings → Storage.'
  });
}

const container = document.getElementById('app');
if (container) createRoot(container).render(<App />);
