import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { newestFirst, NoteTable } from './NoteList';
import { categoryName, useCategories, useNotes } from './store';

type CategoryPageProps = {
  categoryId: string;
  onBack: () => void;
  onOpen: (id: string) => void;
  onCreate: (categoryId: string) => void;
};


/* =========================
   Category Page
   ========================= */

/* Every note in one category. New notes made here start in the same category. */
export function CategoryPage({ categoryId, onBack, onOpen, onCreate }: CategoryPageProps) {
  const notes = useNotes();
  const categories = useCategories();
  const exists = categories.some(category => category.id === categoryId);
  const name = categoryName(categoryId);
  const shown = newestFirst(notes.filter(note => note.category === categoryId));

  /* Escape goes back, like it does from a note. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onBack();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  /* The category may have been removed (for example in another tab of the app). */
  useEffect(() => {
    if (!exists) onBack();
  }, [exists, onBack]);

  return (
    <div className="content-pad notes-home category-page">
      <div className="page-intro">
        <div>
          <h1><Icon name="folder" size={22} /> {name}</h1>
          <p>{shown.length} {shown.length === 1 ? 'note' : 'notes'}</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => onCreate(categoryId)}>
          <Icon name="plus" size={16} /><span>New note</span>
        </button>
      </div>

      <NoteTable notes={shown} onOpen={onOpen} />
    </div>
  );
}
