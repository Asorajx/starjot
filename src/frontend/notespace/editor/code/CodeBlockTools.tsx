import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Dropdown } from '../../../components/Dropdown';
import { Icon } from '../../../components/Icon';
import { LANGUAGES, type LanguageId } from './grammars';
import { highlight, languageOf } from './code';
import { useSessionValue, type EditorSession } from '../session';
import { zoomed } from '../../../lib/geometry';
import { showToast } from '../../../lib/toasts';

type ToolsPosition = {
  top: number;
  right: number;
  language: LanguageId;

  /* Long lines wrap (the default); off, they stay on one line and the block scrolls sideways. */
  wrapped: boolean;
};

type CodeBlockToolsProps = {
  session: EditorSession;
  containerRef: RefObject<HTMLDivElement | null>;
  locked: boolean;
};

/* How long Copy shows a tick after copying. */
const COPIED_MS = 1500;


/* =========================
   Code Block Tools
   ========================= */

/* A code block's tools, in its top-right corner while the pointer is over it or the caret is in */
/* it: the language menu, Copy (all of the block's code) and Wrap (long lines wrap, or scroll). */
/* The tools live outside the editable text, so they are never saved as part of the note. */
export function CodeBlockTools({ session, containerRef, locked }: CodeBlockToolsProps) {
  const layout = useSessionValue(session, snapshot => snapshot.layout);
  const [positions, setPositions] = useState<ToolsPosition[]>([]);

  /* The block under the pointer and the one holding the caret (by their order in the note). */
  const [hovered, setHovered] = useState<number | null>(null);
  const [caretIn, setCaretIn] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  const blocks = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>('.note-body pre') ?? []);

  /* Measure every code block after each change, since typing can move them. */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* The note may be zoomed, so screen distances are divided by the zoom scale. */
    const { rect: base, scale } = zoomed(container);
    const next = blocks().map(pre => {
      const bounds = pre.getBoundingClientRect();
      return {
        top: (bounds.top - base.top) / scale + 6,
        right: (base.right - bounds.right) / scale + 6,
        language: languageOf(pre),
        wrapped: pre.dataset.wrap !== 'off'
      };
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
      window.clearTimeout(copiedTimer.current);
    };
  }, [session, containerRef]);

  /* Follow the pointer (over a block or its tools) and the caret. Listened for on the page, since */
  /* the note's content is drawn after this mounts. */
  useEffect(() => {
    const indexOf = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : (target as Node | null)?.parentElement ?? null;
      if (!element || !containerRef.current?.contains(element)) return null;
      const tools = element.closest<HTMLElement>('.code-tools');
      if (tools) return Number(tools.dataset.index);
      const pre = element.closest('.note-body pre');
      return pre ? blocks().indexOf(pre as HTMLElement) : null;
    };
    const handleOver = (event: MouseEvent) => setHovered(indexOf(event.target));
    const handleSelection = () => setCaretIn(indexOf(window.getSelection()?.focusNode ?? null));
    document.addEventListener('mouseover', handleOver);
    document.addEventListener('selectionchange', handleSelection);
    return () => {
      document.removeEventListener('mouseover', handleOver);
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, [containerRef]);

  function changeLanguage(index: number, language: LanguageId) {
    const pre = blocks()[index];
    if (!pre) return;
    session.checkpoint();
    highlight(pre, language);
    session.commit();
  }

  /* Wrapping is kept with the block (data-wrap="off" when off), as one undo step. */
  function toggleWrap(index: number) {
    const pre = blocks()[index];
    if (!pre) return;
    session.checkpoint();
    if (pre.dataset.wrap === 'off') pre.removeAttribute('data-wrap');
    else pre.dataset.wrap = 'off';
    session.commit();
    session.relayout();
  }

  async function copy(index: number) {
    const code = blocks()[index]?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code.replace(/\n$/, ''));
      setCopied(index);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
    } catch {
      showToast({ kind: 'error', title: 'Could not copy the code' });
    }
  }

  return (
    <div className="code-lang-layer">
      {positions.map((position, index) => (
        <div
          key={index}
          className={`code-tools ${index === hovered || index === caretIn ? 'is-shown' : ''}`}
          data-index={index}
          style={{ top: position.top, right: position.right }}
          role="toolbar"
          aria-label="Code block"
        >
          <Dropdown<LanguageId>
            label="Code block language"
            className="code-lang-select"
            wrapperClassName="code-lang-picker"
            alignEnd
            value={position.language}
            disabled={locked}
            options={LANGUAGES.map(language => ({ value: language.id as LanguageId, label: language.label }))}
            onChange={language => changeLanguage(index, language)}
          />
          <span className="code-tools-rule" aria-hidden="true" />
          <button
            type="button"
            className="code-tool"
            aria-label={copied === index ? 'Copied' : 'Copy code'}
            data-tooltip={copied === index ? 'Copied' : 'Copy code'}
            onMouseDown={event => event.preventDefault()}
            onClick={() => copy(index)}
          >
            <Icon name={copied === index ? 'check' : 'copy'} size={14} />
          </button>
          <button
            type="button"
            className={`code-tool ${position.wrapped ? 'is-on' : ''}`}
            aria-label="Wrap code"
            aria-pressed={position.wrapped}
            data-tooltip="Wrap code"
            data-tooltip-align="end"
            disabled={locked}
            onMouseDown={event => event.preventDefault()}
            onClick={() => toggleWrap(index)}
          >
            <Icon name="wrap-text" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
