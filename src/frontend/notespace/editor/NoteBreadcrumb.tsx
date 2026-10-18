import { ancestorsOf, categoryName, noteTitle } from '../store';
import type { OpenById } from '../../lib/clicks';
import { Breadcrumb, type Crumb } from '../../components/Breadcrumb';
import type { Note } from '../../../shared/types/note';

type NoteBreadcrumbProps = {
  note: Note;
  onOpenHome: (inNewTab: boolean) => void;
  onOpenNote: OpenById;
  onOpenCategory: OpenById;
};


/* =========================
   Note Breadcrumb
   ========================= */

/* Notespace / category / parent notes / this note. A note without a category goes straight from */
/* Notespace to its top note. */
export function NoteBreadcrumb({ note, onOpenHome, onOpenNote, onOpenCategory }: NoteBreadcrumbProps) {
  const category = categoryName(note.category);
  const items: Crumb[] = [
    { key: 'home', label: 'Notespace', open: onOpenHome },
    ...(category ? [{ key: 'category', label: category, open: (inNewTab: boolean) => onOpenCategory(note.category, inNewTab) }] : []),
    ...ancestorsOf(note.id).map(page => ({
      key: page.id,
      label: `${page.icon ? `${page.icon} ` : ''}${noteTitle(page)}`,
      open: (inNewTab: boolean) => onOpenNote(page.id, inNewTab)
    })),
    { key: note.id, label: `${note.icon ? `${note.icon} ` : ''}${noteTitle(note)}` }
  ];
  return <Breadcrumb items={items} label="Note breadcrumb" />;
}
