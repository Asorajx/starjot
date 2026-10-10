import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyTheme } from './app/preferences';

/* Styles load in their original cascade order to preserve the design. */
import './app/styles.css';
import './notespace/notespace.css';
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

const container = document.getElementById('app');
if (container) createRoot(container).render(<App />);
