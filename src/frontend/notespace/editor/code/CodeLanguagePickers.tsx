import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { Dropdown } from '../../../components/Dropdown';
import { LANGUAGES, type LanguageId } from './grammars';
import { highlight, languageOf } from './code';
import { useSessionValue, type EditorSession } from '../session';
import { zoomed } from '../../../lib/geometry';

type PickerPosition = {
  top: number;
  right: number;
  language: LanguageId;
};

type CodeLanguagePickersProps = {
  session: EditorSession;
  containerRef: RefObject<HTMLDivElement | null>;
  locked: boolean;
};


/* =========================
   Code Language Pickers
   ========================= */

/* One language menu sits in the top-right corner of every code block. */
/* The menus live outside the editable text, so they are never saved as part of the note. */
export function CodeLanguagePickers({ session, containerRef, locked }: CodeLanguagePickersProps) {
  const layout = useSessionValue(session, snapshot => snapshot.layout);
  const [positions, setPositions] = useState<PickerPosition[]>([]);

  /* Measure every code block after each change, since typing can move them. */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* The note may be zoomed, so screen distances are divided by the zoom scale. */
    const { rect: base, scale } = zoomed(container);
    const next = Array.from(container.querySelectorAll('.note-body pre')).map(pre => {
      const bounds = pre.getBoundingClientRect();
      return { top: (bounds.top - base.top) / scale + 5, right: (base.right - bounds.right) / scale + 8, language: languageOf(pre) };
    });

    /* Only update when something moved, so this does not cause extra renders while typing. */
    setPositions(current => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [layout, containerRef]);

  /* Re-measure when the window or the note changes size. */
  useEffect(() => {
    const container = containerRef.current;
    const observer = new ResizeObserver(() => session.relayout());
    if (container) observer.observe(container);
    const onResize = () => session.relayout();
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [session, containerRef]);

  function changeLanguage(index: number, language: LanguageId) {
    const pre = containerRef.current?.querySelectorAll('.note-body pre')[index];
    if (!pre) return;
    session.checkpoint();
    highlight(pre, language);
    session.commit();
  }

  return (
    <div className="code-lang-layer">
      {positions.map((position, index) => (
        <Dropdown<LanguageId>
          key={index}
          label="Code block language"
          className="code-lang-select"
          wrapperClassName="code-lang-picker"
          style={{ top: position.top, right: position.right }}
          alignEnd
          value={position.language}
          disabled={locked}
          options={LANGUAGES.map(language => ({ value: language.id as LanguageId, label: language.label }))}
          onChange={language => changeLanguage(index, language)}
        />
      ))}
    </div>
  );
}
