import { Icon, type IconName } from '../components/Icon';
import { updatedLabel, useNotes } from './store';
import type { Note } from '../../shared/types/note';

type NotesHomeProps = {
  onOpen: (id: string) => void;
  onCreate: () => void;
};


/* =========================
   Note List Items
   ========================= */

type NoteItemProps = {
  note: Note;
  onOpen: (id: string) => void;
};

function PinnedCard({ note, onOpen }: NoteItemProps) {
  return (
    <button className="note-card" type="button" onClick={() => onOpen(note.id)}>
      <span className="note-card-top">
        <span className={`doc-icon doc-icon--${note.accent}`}><Icon name={note.icon as IconName} size={21} /></span>
        <span className="note-card-arrow"><Icon name="arrow-right" size={17} /></span>
      </span>
      <strong>{note.title}</strong>
      <span className="note-card-description">{note.preview}</span>
      <span className="note-card-bottom">
        <span className="category-chip">{note.category}</span>
        <span>{updatedLabel(note)}</span>
      </span>
    </button>
  );
}

function RecentRow({ note, onOpen }: NoteItemProps) {
  return (
    <button className="recent-row" type="button" onClick={() => onOpen(note.id)}>
      <span className="recent-name">
        <span className={`doc-icon doc-icon--small doc-icon--${note.accent}`}><Icon name={note.icon as IconName} size={17} /></span>
        <span className="recent-text"><strong>{note.title}</strong><small>{note.preview}</small></span>
      </span>
      <span className="recent-category">{note.category}</span>
      <span className="recent-time">{updatedLabel(note)} <Icon name="chevron-right" size={16} /></span>
    </button>
  );
}


/* =========================
   Notespace Home
   ========================= */

export function NotesHome({ onOpen, onCreate }: NotesHomeProps) {
  const notes = useNotes();
  const pinned = notes.filter(note => note.pinned);
  const recent = [...notes].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return (
    <div className="content-pad notes-home">
      <div className="page-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />YOUR KNOWLEDGE SPACE</div>
          <h1>Good morning <span className="wave">✳</span></h1>
          <p>Find your thoughts, pick up where you left off, and make room for the next idea.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={onCreate}><Icon name="plus" size={17} /><span>New note</span></button>
      </div>

      <div className="home-feature">
        <div className="home-feature-left">
          <span className="feature-kicker">MADE FOR YOUR FLOW</span>
          <h2>Start with a document.<br />Structure it when you need to.</h2>
          <p>A continuous writing experience by default, with optional blocks and grouped content on each page.</p>
          {/* The link only shows while the sample note still exists (it can be deleted). */}
          {notes.some(note => note.id === 'atlas') && (
            <button className="feature-link" type="button" onClick={() => onOpen('atlas')}>Explore a sample note <Icon name="arrow-right" size={16} /></button>
          )}
        </div>

        {/* A decorative drawing of a document, hidden from screen readers. */}
        <div className="document-illustration" aria-hidden="true">
          <div className="paper-sheet paper-sheet--back" />
          <div className="paper-sheet">
            <div className="paper-topline"><span /><span /><span /></div>
            <div className="paper-heading" />
            <div className="paper-line long" /><div className="paper-line medium" />
            <div className="paper-line long" /><div className="paper-line short" />
            <div className="paper-tag"><span className="paper-tag-dot" /> Continuous by default</div>
          </div>
          <div className="floating-shape floating-shape--one" />
          <div className="floating-shape floating-shape--two" />
        </div>
      </div>

      <section className="content-section">
        <div className="section-heading">
          <div><h2><Icon name="star" size={18} /> Pinned notes</h2><p>The notes you come back to most.</p></div>
          <span className="subtle-counter">{pinned.length} pinned</span>
        </div>
        <div className="pinned-grid">
          {pinned.length
            ? pinned.map(note => <PinnedCard key={note.id} note={note} onOpen={onOpen} />)
            : <p className="notes-empty">Pin notes here later to keep them close.</p>}
        </div>
      </section>

      <section className="content-section recent-section">
        <div className="section-heading">
          <div><h2><Icon name="clock" size={18} /> Recent notes</h2><p>Your documents, including notes you create and edit.</p></div>
          <button className="btn btn-quiet" type="button" aria-label="List view, display only"><Icon name="list" size={17} /> List view</button>
        </div>
        <div className="recent-table">
          <div className="recent-columns"><span>NAME</span><span>SPACE</span><span>LAST EDITED</span></div>
          {recent.map(note => <RecentRow key={note.id} note={note} onOpen={onOpen} />)}
        </div>
      </section>
      <footer className="mini-footer">Thoughtfully organized. Ready when you are. <span>Starjot · Notespace preview</span></footer>
    </div>
  );
}
