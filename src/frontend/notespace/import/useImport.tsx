import { useRef, useState, type DragEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { getNote } from '../store';
import { IMPORT_ACCEPT, importFiles, type ImportResult } from './importNotes';


/* =========================
   Importing on a Screen
   ========================= */

/* Importing files from the Import button or by dropping them on the screen. One imported note */
/* opens straight away; after several (or a file that could not be read) a short report says */
/* what happened. */
export function useImport(onOpen: (id: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [report, setReport] = useState<ImportResult | null>(null);

  async function run(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    const result = await importFiles(files);
    setBusy(false);
    if (result.created.length === 1 && !result.failed.length) onOpen(result.created[0]);
    else setReport(result);
  }

  /* Only a drag that carries files shows the drop highlight (not dragged text or links). */
  const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');
  const dropProps = {
    onDragOver: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
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
          title={created.length ? `Imported ${created.length} ${created.length === 1 ? 'note' : 'notes'}` : 'Nothing was imported'}
          confirmLabel={created.length ? 'Open the first' : 'OK'}
          notice
          onConfirm={() => {
            setReport(null);
            if (created.length) onOpen(created[0]);
          }}
          onCancel={() => setReport(null)}
        >
          {created.length > 0 && <p>{created.map(id => getNote(id)?.title || 'Untitled note').join(', ')}</p>}
          {report.failed.map(failure => <p key={failure.name}><strong>{failure.name}:</strong> {failure.reason}</p>)}
        </ConfirmDialog>
      )}
    </>
  );

  return { choose: () => inputRef.current?.click(), busy, dropProps, elements };
}
