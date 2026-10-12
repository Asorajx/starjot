import type { IconName } from '../../../components/Icon';
import { closestAtCaret } from './dom';


/* =========================
   Slash Commands
   ========================= */

export type CommandId =
  | 'text' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'bullet' | 'numbered' | 'quote' | 'code' | 'divider' | 'table' | 'page' | 'link'
  | 'toggle' | 'toggle-h1' | 'toggle-h2' | 'toggle-h3' | 'toggle-h4' | 'toggle-h5';

export type SlashCommand = {
  id: CommandId;
  label: string;

  /* The Markdown shortcut that does the same thing, shown on the right of the menu. */
  hint: string;
  icon: IconName;

  /* Extra words the menu also matches, so "/ul" finds the bulleted list. */
  keywords: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'text', label: 'Text', hint: '', icon: 'type', keywords: 'paragraph plain' },
  { id: 'h1', label: 'Heading 1', hint: '#', icon: 'type', keywords: 'title h1 big' },
  { id: 'h2', label: 'Heading 2', hint: '##', icon: 'type', keywords: 'subtitle h2' },
  { id: 'h3', label: 'Heading 3', hint: '###', icon: 'type', keywords: 'h3' },
  { id: 'h4', label: 'Heading 4', hint: '####', icon: 'type', keywords: 'h4 small' },
  { id: 'h5', label: 'Heading 5', hint: '#####', icon: 'type', keywords: 'h5 smallest' },
  { id: 'bullet', label: 'Bulleted list', hint: '-', icon: 'list', keywords: 'ul unordered dots' },
  { id: 'numbered', label: 'Numbered list', hint: '1.', icon: 'list', keywords: 'ol ordered numbers' },
  { id: 'toggle', label: 'Toggle list', hint: '', icon: 'chevron-right', keywords: 'collapse expand details fold' },
  { id: 'toggle-h1', label: 'Toggle heading 1', hint: '', icon: 'chevron-right', keywords: 'collapse fold h1 title' },
  { id: 'toggle-h2', label: 'Toggle heading 2', hint: '', icon: 'chevron-right', keywords: 'collapse fold h2' },
  { id: 'toggle-h3', label: 'Toggle heading 3', hint: '', icon: 'chevron-right', keywords: 'collapse fold h3' },
  { id: 'toggle-h4', label: 'Toggle heading 4', hint: '', icon: 'chevron-right', keywords: 'collapse fold h4' },
  { id: 'toggle-h5', label: 'Toggle heading 5', hint: '', icon: 'chevron-right', keywords: 'collapse fold h5' },
  { id: 'quote', label: 'Quote', hint: '>', icon: 'quote', keywords: 'blockquote citation' },
  { id: 'code', label: 'Code block', hint: '```', icon: 'file-code', keywords: 'pre snippet programming' },
  { id: 'table', label: 'Table', hint: '', icon: 'table', keywords: 'grid rows columns spreadsheet' },
  { id: 'divider', label: 'Divider', hint: '---', icon: 'minus', keywords: 'hr line rule separator' },
  { id: 'page', label: 'Add sub-note', hint: '', icon: 'file-text', keywords: 'new note page sub-note sub-page subpage child' },
  { id: 'link', label: 'Link to note', hint: '', icon: 'link', keywords: 'mention reference note page' }
];

type CommandContext = {
  /* Table cells and toggle titles cannot hold new lines, so only the link and sub-page (which sit in text) fit there. */
  inlineOnly: boolean;
  canAddPage: boolean;
};

/* How well one typed word matches a command: the start of a word in its name counts most (the */
/* first word most of all), then the start of a keyword, then (for three letters or more) any */
/* part of its name or keywords. 0 means no match. */
function wordScore(word: string, command: SlashCommand) {
  const names = command.label.toLowerCase().split(/\s+/);
  if (names[0].startsWith(word)) return 4;
  if (names.some(name => name.startsWith(word))) return 3;
  if (`${command.keywords} ${command.hint}`.toLowerCase().split(/\s+/).some(keyword => keyword && keyword.startsWith(word))) return 2;
  return word.length >= 3 && `${command.label} ${command.keywords}`.toLowerCase().includes(word) ? 1 : 0;
}

/* Commands that match every typed word, best first, so short forms work: "tog 4" finds Toggle */
/* heading 4, "h2" finds Heading 2, and "num" finds Numbered list. Equal matches keep the menu's order. */
export function matchCommands(query: string, context: CommandContext) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return SLASH_COMMANDS
    .filter(command => (command.id !== 'page' || context.canAddPage) && (!context.inlineOnly || command.id === 'link' || command.id === 'page'))
    .map(command => {
      const scores = words.map(word => wordScore(word, command));
      return { command, score: scores.includes(0) ? 0 : scores.reduce<number>((sum, score) => sum + score, 0) };
    })
    .filter(item => !words.length || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.command);
}

/* True when the caret is somewhere a new line cannot be added. */
export function caretIsInlineOnly() {
  return Boolean(closestAtCaret('td, th, .toggle-summary'));
}
