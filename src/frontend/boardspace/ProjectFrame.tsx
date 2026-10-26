import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { showToast } from '../lib/toasts';
import type { BoardProject, WorkType } from '../../shared/types/board';
import { replaceBoard, setBoardTitle, TITLE_LENGTH, useBoard } from './board';
import { exportBackup, exportCsv, exportPng, exportSvg, readProjectFile } from './files';
import { MembersDialog } from './MembersDialog';
import { onWorkRequest, takeWorkRequest } from './openWork';
import { WorkEditor, type EditorTarget } from './WorkEditor';
import { MenuButton, TYPE_ICONS, type MenuItem } from './workParts';
import { sprintForNewWork, WORK_TYPES } from './workItems';

type ProjectFrameProps = {
  /* The view inside the frame (the list or the timeline), given a way to open the editor. */
  children: (edit: (target: EditorTarget) => void) => ReactNode;

  /* Opens a note in a new tab, for the editor's linked notes. */
  onOpenNote?: (noteId: string) => void;
};

type Imported = { project: BoardProject; message: string; warning: boolean };


/* =========================
   Project Frame
   ========================= */

/* What every Boardspace view of the project shares: the project's name (edited in place), */
/* Create and More (Members, Import, Export) above the view, and the editor panel, the members window */
/* and the import question it opens. The view opens the editor through the function it is given. */
export function ProjectFrame({ children, onOpenNote }: ProjectFrameProps) {
  const board = useBoard();
  const [title, setTitle] = useState(board.title);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [importing, setImporting] = useState<Imported | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setTitle(board.title), [board.title]);

  /* A work item chosen in Search or on Home, or a new task from Home, opens in the editor (see */
  /* openWork.ts). */
  useEffect(() => {
    const open = () => {
      const target = takeWorkRequest();
      if (target) setEditing(target);
    };
    open();
    return onWorkRequest(open);
  }, []);

  /* A file replaces the project; when the project holds anything, that is asked first. */
  async function chooseFile(file: File | undefined) {
    if (!file) return;
    try {
      const result = await readProjectFile(file);
      if (board.items.length || board.sprints.length) setImporting(result);
      else finishImport(result);
    } catch (error) {
      showToast({ kind: 'error', title: 'Import failed', description: `${(error as Error).message} Your project was not changed.` });
    }
  }

  function finishImport(result: Imported) {
    replaceBoard(result.project);
    setImporting(null);
    showToast({ kind: result.warning ? 'error' : 'success', title: 'Project imported', description: result.message, stay: result.warning });
  }

  async function exportAs(run: () => void | Promise<void>, done: string) {
    try {
      await run();
      showToast({ kind: 'success', title: done });
    } catch {
      showToast({ kind: 'error', title: 'The export did not work', description: 'Try the SVG picture instead.' });
    }
  }

  /* New work goes into the sprint under way (the one the Board opens on), or the next one. */
  const newWorkSprint = sprintForNewWork(board);
  const createItems: MenuItem[] = [
    ...(['epic', 'feature', 'task'] as WorkType[]).map(type => ({ key: type, label: WORK_TYPES[type].label, hint: WORK_TYPES[type].hint, icon: TYPE_ICONS[type], run: () => setEditing({ kind: 'item', type, sprintId: newWorkSprint }) })),
    { key: 'sprint', label: 'Sprint', hint: 'A planning period', icon: 'calendar-days', divider: true, run: () => setEditing({ kind: 'sprint' }) }
  ];
  /* Members, Import and Export share one menu, so the bar holds just the name and two buttons. */
  const moreItems: MenuItem[] = [
    { key: 'members', label: 'Members', hint: 'The names work can be assigned to', icon: 'users', run: () => setMembersOpen(true) },
    { key: 'import', label: 'Import', hint: 'A project backup or a CSV (from Excel or Jira)', icon: 'upload', run: () => fileRef.current?.click() },
    { key: 'png', label: 'PNG picture', hint: 'The timeline', icon: 'image', heading: 'Export', run: () => exportAs(() => exportPng(board), 'PNG picture saved') },
    { key: 'svg', label: 'SVG picture', hint: 'Sharp at any size', icon: 'image', run: () => exportAs(() => exportSvg(board), 'SVG picture saved') },
    { key: 'csv', label: 'CSV spreadsheet', hint: 'Edit in Excel, then import', icon: 'table', run: () => exportAs(() => exportCsv(board), 'CSV spreadsheet saved') },
    { key: 'json', label: 'Project backup', hint: 'Everything, to import later', icon: 'download', run: () => exportAs(() => exportBackup(board), 'Project backup saved') }
  ];

  return (
    <section className="board-project" aria-label={board.title}>
      <div className="project-top">
        <input
          className="project-title"
          aria-label="Project name"
          maxLength={TITLE_LENGTH}
          value={title}
          onChange={event => setTitle(event.target.value)}
          onBlur={() => setBoardTitle(title)}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        <span className="board-fill" />
        <input ref={fileRef} type="file" hidden accept=".json,.csv,.txt,application/json,text/csv,text/plain" onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
        <MenuButton label="Create" icon="plus" primary compactOnPhone items={createItems} />
        <MenuButton label="More" icon="more-horizontal" iconOnly items={moreItems} />
      </div>

      {children(setEditing)}

      {editing && <WorkEditor key={JSON.stringify(editing)} target={editing} onClose={() => setEditing(null)} onManageMembers={() => setMembersOpen(true)} onOpenNote={onOpenNote} />}
      {membersOpen && <MembersDialog onClose={() => setMembersOpen(false)} />}
      {importing && (
        <ConfirmDialog title="Replace this project?" confirmLabel="Import" onConfirm={() => finishImport(importing)} onCancel={() => setImporting(null)}>
          The file holds {importing.message.charAt(0).toLowerCase()}{importing.message.slice(1)} It replaces everything in the current project, so export a project backup first if you may want it back.
        </ConfirmDialog>
      )}
    </section>
  );
}
