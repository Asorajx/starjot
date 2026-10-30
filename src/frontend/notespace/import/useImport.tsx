import { useRef, useState, type DragEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { getNote, noteTitle } from '../store';
import { IMPORT_ACCEPT, importFiles, type ImportResult } from './importNotes';
import { onlyImageFiles } from '../editor/images/images';


/* =========================
   Importing on a Screen
   ========================= */

/* Importing files from the Import button or by dropping them on the screen. One imported note */
/* opens straight away; after several (or a file that could not be read) a short report says */
/* what happened. The viewport supplies onImported to open every successful file immediately. */
export function useImport(onOpen: (id: string) => void, onImported?: (ids: string[]) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [report, setReport] = useState<ImportResult | null>(null);
  const pending = useRef(Promise.resolve());
  const waiting = useRef(0);

  async function run(files: File[]) {
    if (!files.length) return;
    waiting.current += 1;
    setBusy(true);

    /* Queue another drop while a file is being read, so no files are silently ignored. */
    const job = pending.current.then(() => importFiles(files));
    pending.current = job.then(() => {}, () => {});
    try {
      const result = await job;
      if (onImported) {
        if (result.created.length) onImported(result.created);
        if (result.failed.length) setReport({ created: [], failed: result.failed });
      } else if (result.created.length === 1 && !result.failed.length) onOpen(result.created[0]);
      else setReport(result);
    } finally {
      waiting.current -= 1;
      setBusy(waiting.current > 0);
    }
  }

  /* Only a drag that carries files shows the drop highlight (not dragged text or links). */
  const carriesFiles = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return false;

    /* Keep the existing image insertion inside unlocked editors, without an import overlay. */
    const target = event.target instanceof Element ? event.target : null;
    const inEditor = target?.closest('.note-body') && target.closest('[contenteditable="true"]');
    return !(inEditor && onlyImageFiles(event.dataTransfer));
  };
  const dropProps = {
    onDragOver: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      run(Array.from(event.dataTransfer.files));
    }
  };

  const created = report?.created ?? [];
  const elements = (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        hidden
        onChange={event => {
          run(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      {dragging && <div className="import-drop" aria-hidden="true"><span>Drop files to import them as new notes</span></div>}
      {report && (
        <ConfirmDialog
          title={created.length ? `Imported ${created.length} ${created.length === 1 ? 'note' : 'notes'}` : onImported ? 'Some files could not be imported' : 'Nothing was imported'}
          confirmLabel={created.length ? 'Open the first' : 'OK'}
          notice
          onConfirm={() => {
            setReport(null);
            if (created.length) onOpen(created[0]);
          }}
          onCancel={() => setReport(null)}
        >
          {created.length > 0 && <p>{created.map(id => noteTitle(getNote(id))).join(', ')}</p>}
          {report.failed.map(failure => <p key={failure.name}><strong>{failure.name}:</strong> {failure.reason}</p>)}
        </ConfirmDialog>
      )}
    </>
  );

  return { choose: () => inputRef.current?.click(), busy, dropProps, elements };
}
