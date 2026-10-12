import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyTheme } from './app/preferences';
import { removeUnusedImages } from './notespace/imageStore';
import { imageIdsIn } from './notespace/editor/images/images';
import { getNotes, isStorageAvailable } from './notespace/store';

/* Styles load in their original cascade order to preserve the design. */
import './app/styles.css';
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
import './notespace/editor/images/images.css';
import './notespace/editor/tables/tables.css';
import './notespace/editor/drawing/drawing.css';
import './notespace/export/export.css';
import './notespace/print.css';
import './workboard/workboard.css';
import './settings/settings.css';
import './app/responsive.css';
import './workboard/timeline.css';
import './app/dark-theme.css';
import './app/dark-overrides.css';

/* Apply the saved light or dark theme before the first render, so the page never flashes. */
applyTheme();

/* New lines typed in a note become paragraphs, so each line maps cleanly to one block. */
document.execCommand('defaultParagraphSeparator', false, 'p');

/* Images no note uses any more (deleted from notes, or in deleted notes) are removed from the */
/* image store when the app opens. Never when the saved notes could not be read: every image */
/* would look unused. */
if (isStorageAvailable()) removeUnusedImages(new Set(getNotes().flatMap(note => imageIdsIn(note.content))));

const container = document.getElementById('app');
if (container) createRoot(container).render(<App />);
