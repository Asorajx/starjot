import { useEffect, useRef, useState, type ReactNode } from 'react';
import { updatePreferences, usePreferences } from '../../app/preferences';
import { Dropdown } from '../../components/Dropdown';
import { childrenOf } from '../store';
import { exportHtml, exportPdf, type ExportLayout } from './exportHtml';
import { exportMarkdown } from './exportMarkdown';
import { exportedNotes } from './exportNotes';
import { DETAIL_PARTS, EXPORT_FORMATS, PAGE_FORMATS, SCALE_MAX, SCALE_MIN, type ExportSettings } from './exportSettings';
import { exportText } from './exportText';
import { Switch } from '../../components/Switch';
import { useEscape } from '../../lib/useDismiss';
import { useFocusTrap } from '../../lib/useFocusTrap';

type ExportDialogProps = {
  noteId: string;

  /* How the note is laid out on screen, so loose drawings land on the same words. */
  measure: () => ExportLayout;
  onClose: () => void;
};


/* =========================
   Export Window Rows
   ========================= */

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="export-row">
      <span className="export-label">{label}</span>
      <span className="export-value">{children}</span>
    </div>
  );
}

type ChoiceProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
};

/* A dropdown on the right of a row, showing its choice as plain text until pointed at. */
export function Choice<T extends string>({ label, value, options, disabled = false, onChange }: ChoiceProps<T>) {
  return <Dropdown label={label} className="export-select" alignEnd value={value} options={options} disabled={disabled} onChange={onChange} />;
}


/* The scale as typed. Anything can be typed (even an empty box while typing a new number); */
/* it is checked and kept between 50 and 200 when the box is left or Enter is pressed. */
function ScaleField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [typed, setTyped] = useState(String(value));
  useEffect(() => setTyped(String(value)), [value]);

  function commit() {
    const number = Math.round(Number(typed));
    const next = Number.isFinite(number) && typed.trim() ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, number)) : value;
    setTyped(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <input
      className="export-number"
      type="text"
      inputMode="numeric"
      aria-label="Scale percent"
      value={typed}
      onChange={event => setTyped(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit();
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onChange(Math.min(SCALE_MAX, Math.max(SCALE_MIN, value + (event.key === 'ArrowUp' ? 10 : -10))));
        }
      }}
    />
  );
}


/* =========================
   Export Window
   ========================= */

/* The Export window, opened from Note settings: the format and what goes into the file. The */
/* choices are remembered for the next export. PDF opens the browser's print window, where the */
/* note can be saved as a PDF; the other formats download a file. */
export function ExportDialog({ noteId, measure, onClose }: ExportDialogProps) {
  const { exportSettings: settings } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const exportRef = useRef<HTMLButtonElement>(null);
  const hasSubpages = childrenOf(noteId).length > 0;

  /* The All tabs choice only shows for notes (or their sub-notes) with a tab block. */
  const hasTabs = exportedNotes(noteId, true).some(note => note.content.includes('tab-block'));
  const pdf = settings.format === 'pdf';
  const text = settings.format === 'text';

  const change = (changes: Partial<ExportSettings>) => updatePreferences({ exportSettings: { ...settings, ...changes } });

  /* The Export button is focused once, when the window opens (not after every change, which would */
  /* pull the focus out of the scale box while typing). Escape closes the window. */
  useEffect(() => exportRef.current?.focus(), []);
  useEscape(true, onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, null);

  async function run() {
    const chosen: ExportSettings = { ...settings, content: text ? 'text' : settings.content, subpages: settings.subpages && hasSubpages };
    const notes = exportedNotes(noteId, chosen.subpages);
    if (!notes.length) return;
    setBusy(true);
    setFailed(false);
    try {
      if (chosen.format === 'pdf') await exportPdf(notes, chosen, measure());
      else if (chosen.format === 'html') await exportHtml(notes, chosen, measure());
      else if (chosen.format === 'markdown') await exportMarkdown(notes, chosen);
      else exportText(notes, chosen);
      onClose();
    } catch (error) {
      console.warn('Notespace: the export failed.', error);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="dialog export-dialog" role="dialog" aria-modal="true" aria-label="Export">
        <Row label="Export format">
          <Choice label="Export format" value={settings.format} options={EXPORT_FORMATS} onChange={format => change({ format })} />
        </Row>
        <Row label="Note content">
          <Choice
            label="Note content"
            value={text ? 'text' : settings.content}
            disabled={text}
            options={[{ value: 'everything', label: 'Everything' }, { value: 'text', label: 'Text only (no images or drawings)' }]}
            onChange={content => change({ content })}
          />
        </Row>
        <Row label="Include details">
          <Switch label="Include details" on={settings.details} onChange={details => change({ details })} />
        </Row>
        {settings.details && (
          <div className="export-parts" role="group" aria-label="Details to include">
            {DETAIL_PARTS.map(part => (
              <label key={part.key} className="export-check">
                <input
                  type="checkbox"
                  checked={settings.detailParts[part.key]}
                  onChange={event => change({ detailParts: { ...settings.detailParts, [part.key]: event.target.checked } })}
                />
                {part.label}
              </label>
            ))}
          </div>
        )}
        {pdf && (
          <>
            <Row label="Page format">
              <Choice label="Page format" value={settings.pageFormat} options={PAGE_FORMATS} onChange={pageFormat => change({ pageFormat })} />
            </Row>
            <Row label="Scale percent">
              <ScaleField value={settings.scale} onChange={scale => change({ scale })} />
            </Row>
          </>
        )}
        {(pdf || settings.format === 'html') && hasTabs && (
          <Row label="All tabs">
            <span data-tooltip="Every tab of each tab block, under its name. When off, only the tab shown is included." data-tooltip-align="end" data-tooltip-wrap="">
              <Switch label="All tabs" on={settings.allTabs} onChange={allTabs => change({ allTabs })} />
            </span>
          </Row>
        )}
        <Row label="Include sub-notes">
          <span data-tooltip={hasSubpages ? undefined : 'This note has no sub-notes'} data-tooltip-align="end">
            <Switch label="Include sub-notes" on={settings.subpages && hasSubpages} disabled={!hasSubpages} onChange={subpages => change({ subpages })} />
          </span>
        </Row>

        {failed && <p className="export-error">The export did not work. Please try again.</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button ref={exportRef} type="button" className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Exporting…' : 'Export'}</button>
        </div>
      </div>
    </div>
  );
}
