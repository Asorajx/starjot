import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateField } from '../components/DateField';
import { Dropdown } from '../components/Dropdown';
import { Icon } from '../components/Icon';
import { useEscape } from '../lib/useDismiss';
import { usePreferences } from '../app/preferences';
import type { WorkStatus, WorkType } from '../../shared/types/board';
import { addDays, isoDay, parseDay, weekStart } from './dates';
import { deleteItem, deleteSprint, NAME_LENGTH, saveItem, saveSprint, useBoard } from './board';
import { BAR_COLORS, canHoldWork, datesInSprint, epicCompletion, familyOf, shownSprintOf, WORK_STATUSES, WORK_TYPES } from './workItems';
import { WorkNotes } from './WorkNotes';


/* =========================
   Work Item Editor
   ========================= */

/* What the editor is open for: an existing sprint or item (by id), or a new one, with where a */
/* new item starts (its kind, the item it goes inside, its sprint). */
export type EditorTarget =
  | { kind: 'sprint'; id?: string }
  | { kind: 'item'; id?: string; type?: WorkType; parentId?: string; sprintId?: string };

type WorkEditorProps = {
  target: EditorTarget;
  onClose: () => void;
  onManageMembers: () => void;

  /* Opens a note in a new tab (linked notes); left out, the editor has no Notes section. */
  onOpenNote?: (noteId: string) => void;
};

/* A new item or sprint starts on this week's Monday and lasts a week. */
function thisWeek() {
  const start = weekStart(new Date());
  return { start: isoDay(start), end: isoDay(addDays(start, 6)) };
}

/* A panel at the right of the window for adding or changing a sprint or a work item: its name, */
/* kind, status, where it sits, who it is for, its colour, progress and dates. An epic's */
/* progress comes from its tasks, so it shows that instead of a status. Delete asks first. */
export function WorkEditor({ target, onClose, onManageMembers, onOpenNote }: WorkEditorProps) {
  const board = useBoard();
  const { spaces } = usePreferences();
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const sprint = target.kind === 'sprint' ? board.sprints.find(item => item.id === target.id) : undefined;
  const item = target.kind === 'item' ? board.items.find(entry => entry.id === target.id) : undefined;
  const parent = target.kind === 'item' ? board.items.find(entry => entry.id === target.parentId) : undefined;
  const isNew = !sprint && !item;

  /* The form starts from the item (or sprint), or for a new one from what it goes inside. */
  const [fields, setFields] = useState(() => {
    const from = target.kind === 'item' ? board.sprints.find(entry => entry.id === (target.sprintId ?? parent?.sprintId)) : undefined;
    const week = thisWeek();
    return {
      name: item?.name ?? sprint?.name ?? (target.kind === 'sprint' ? `Sprint ${board.sprints.length + 1}` : ''),
      type: item?.type ?? (target.kind === 'item' ? target.type : undefined) ?? 'task',
      status: item?.status ?? 'todo' as WorkStatus,
      parentId: item?.parentId ?? (target.kind === 'item' ? target.parentId : '') ?? '',
      sprintId: item ? shownSprintOf(board, item) : (target.kind === 'item' ? target.sprintId ?? (parent ? shownSprintOf(board, parent) : '') : ''),
      assignee: item?.assignee ?? '',
      color: item?.color ?? parent?.color ?? BAR_COLORS[0],
      progress: item?.progress ?? 0,
      start: item?.start ?? sprint?.start ?? parent?.start ?? from?.start ?? week.start,
      end: item?.end ?? sprint?.end ?? parent?.end ?? from?.end ?? week.end
    };
  });
  const set = (changes: Partial<typeof fields>) => setFields(current => ({ ...current, ...changes }));

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);
  useEscape(!confirming, onClose);

  /* The items this one can sit inside: of a kind that holds it, and not inside it. */
  const inside = item ? familyOf(board.items, item.id) : new Set<string>();
  const parents = board.items.filter(entry => canHoldWork(entry.type, fields.type) && !inside.has(entry.id));
  const completion = item ? epicCompletion(board.items, item.id) : { done: 0, total: 0, percent: 0 };
  const isEpic = fields.type === 'epic';
  const kindName = target.kind === 'sprint' ? 'sprint' : 'work item';

  /* Saves the fields; false (with the reason shown) when they cannot be saved yet. */
  function commit() {
    if (!fields.name.trim()) {
      setError('Enter a name.');
      return false;
    }
    if (!parseDay(fields.start) || !parseDay(fields.end) || fields.end < fields.start) {
      setError('Choose an end date on or after the start date.');
      return false;
    }
    if (target.kind === 'sprint') {
      saveSprint({ name: fields.name, start: fields.start, end: fields.end }, sprint?.id);
    } else {
      const parentOk = !fields.parentId || parents.some(entry => entry.id === fields.parentId);
      saveItem({
        name: fields.name,
        type: fields.type,
        parentId: parentOk ? fields.parentId : '',
        sprintId: fields.sprintId,
        status: fields.status,
        assignee: fields.assignee,
        start: fields.start,
        end: fields.end,
        color: fields.color,
        progress: fields.progress
      }, item?.id);
    }
    return true;
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (commit()) onClose();
  }

  /* Before a linked note opens (in Notespace), the editor saves and closes, so nothing is lost. */
  function leave() {
    if (!commit()) return false;
    onClose();
    return true;
  }

  function remove() {
    if (sprint) deleteSprint(sprint.id);
    if (item) deleteItem(item.id);
    onClose();
  }

  const nested = item ? familyOf(board.items, item.id).size - 1 : 0;
  const members = [...board.members];
  if (fields.assignee && !members.includes(fields.assignee)) members.push(fields.assignee);

  return (
    <div className="board-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="board-drawer" role="dialog" aria-modal="true" aria-labelledby="board-drawer-title">
        <header className="board-drawer-head">
          <div>
            <span className="board-drawer-overline">{target.kind === 'sprint' ? 'SPRINT' : 'WORK ITEM'}</span>
            <h2 id="board-drawer-title">{isNew ? `New ${kindName}` : `Edit ${kindName}`}</h2>
          </div>
          <button type="button" className="window-control" aria-label="Close" data-tooltip="Close" data-shortcut="Esc" data-tooltip-align="end" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </header>

        <form className="board-drawer-form" onSubmit={save} noValidate>
          <label className="board-field">
            <span>Name</span>
            <input ref={nameRef} className="board-input" maxLength={NAME_LENGTH} value={fields.name} placeholder="Enter a name" onChange={event => set({ name: event.target.value })} />
          </label>

          {target.kind === 'item' && (
            <>
              <div className="board-field-pair">
                <div className="board-field">
                  <span>Type</span>
                  <Dropdown
                    label="Type"
                    value={fields.type}
                    options={(Object.keys(WORK_TYPES) as WorkType[]).map(type => ({ value: type, label: WORK_TYPES[type].label }))}
                    onChange={type => set({ type, parentId: board.items.some(entry => entry.id === fields.parentId && canHoldWork(entry.type, type)) ? fields.parentId : '' })}
                  />
                </div>
                {!isEpic && (
                  <div className="board-field">
                    <span>Status</span>
                    <Dropdown
                      label="Status"
                      value={fields.status}
                      options={(Object.keys(WORK_STATUSES) as WorkStatus[]).map(status => ({ value: status, label: WORK_STATUSES[status] }))}
                      onChange={status => set({ status })}
                    />
                  </div>
                )}
              </div>

              {isEpic && (
                <div className="board-field">
                  <span>Task completion <strong>{completion.percent}%</strong></span>
                  <span className="board-progress" role="progressbar" aria-label="Task completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion.percent}>
                    <b style={{ width: `${completion.percent}%` }} />
                  </span>
                  <small className="board-field-hint">{completion.total ? `${completion.done} of ${completion.total} tasks done, worked out from the tasks inside it.` : 'No tasks inside it yet.'}</small>
                </div>
              )}

              <div className="board-field">
                <span>Inside</span>
                <Dropdown
                  label="Inside"
                  value={fields.parentId}
                  options={[{ value: '', label: 'Nothing (top level)' }, ...parents.map(entry => ({ value: entry.id, label: `${WORK_TYPES[entry.type].label} · ${entry.name}` }))]}
                  onChange={parentId => set({ parentId })}
                />
                <small className="board-field-hint">Epics hold features; features and tasks hold tasks.</small>
              </div>

              <div className="board-field-pair">
                <div className="board-field">
                  <span>Sprint</span>
                  <Dropdown
                    label="Sprint"
                    value={fields.sprintId}
                    options={[{ value: '', label: 'Backlog' }, ...board.sprints.map(entry => ({ value: entry.id, label: entry.name }))]}
                    onChange={sprintId => {
                      const chosen = board.sprints.find(entry => entry.id === sprintId);
                      set({ sprintId, ...(chosen ? datesInSprint(fields, chosen) : {}) });
                    }}
                  />
                </div>
                <div className="board-field">
                  <span className="board-field-label-row">Assignee <button type="button" className="board-link" onClick={onManageMembers}>Members</button></span>
                  <Dropdown
                    label="Assignee"
                    value={fields.assignee}
                    options={[{ value: '', label: 'Unassigned' }, ...members.sort((a, b) => a.localeCompare(b)).map(name => ({ value: name, label: name }))]}
                    onChange={assignee => set({ assignee })}
                  />
                </div>
              </div>

              {/* Linking notes needs Notespace; a new item is created before notes can be linked. */}
              {spaces.notes && onOpenNote && (item
                ? <WorkNotes item={item} onLeave={leave} onOpenNote={onOpenNote} />
                : <div className="board-field"><span>Notes</span><small className="board-field-hint">Create the work item first, then link notes to it.</small></div>)}

              <div className="board-field">
                <span>Colour</span>
                <span className="board-swatches" role="radiogroup" aria-label="Colour">
                  {BAR_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={fields.color.toLowerCase() === color}
                      aria-label={color}
                      className={`board-swatch ${fields.color.toLowerCase() === color ? 'is-chosen' : ''}`}
                      style={{ background: color }}
                      onClick={() => set({ color })}
                    />
                  ))}
                </span>
              </div>

              {!isEpic && (
                <label className="board-field">
                  <span>Progress <strong>{fields.status === 'done' ? 100 : fields.progress}%</strong></span>
                  <input
                    className="board-range"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    disabled={fields.status === 'done'}
                    value={fields.status === 'done' ? 100 : fields.progress}
                    onChange={event => set({ progress: Number(event.target.value) })}
                  />
                </label>
              )}
            </>
          )}

          <div className="board-field-pair">
            <div className="board-field">
              <span>Start</span>
              <DateField label="Start date" value={fields.start} onChange={start => set({ start, end: fields.end < start ? start : fields.end })} />
            </div>
            <div className="board-field">
              <span>End</span>
              <DateField label="End date" value={fields.end} onChange={end => set({ end })} />
            </div>
          </div>

          {error && <p className="board-form-error" role="alert">{error}</p>}

          <footer className="board-drawer-foot">
            {!isNew && <button type="button" className="btn btn-quiet board-delete" onClick={() => setConfirming(true)}><Icon name="trash" size={15} /> Delete</button>}
            <span className="board-drawer-fill" />
            <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{isNew ? 'Create' : 'Save'}</button>
          </footer>
        </form>
      </aside>

      {confirming && (
        <ConfirmDialog
          title={sprint ? `Delete ${sprint.name}?` : `Delete ${item?.name ?? 'this item'}?`}
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        >
          {sprint ? 'Its work moves to the backlog.' : nested ? `The ${nested} ${nested === 1 ? 'item' : 'items'} inside it will be deleted too.` : 'This cannot be undone.'}
        </ConfirmDialog>
      )}
    </div>
  );
}
