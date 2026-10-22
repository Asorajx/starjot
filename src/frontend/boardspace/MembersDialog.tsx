import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useEscape } from '../lib/useDismiss';
import { addMember, MEMBER_LENGTH, removeMember, useBoard } from './board';
import { initialsOf } from './workItems';


/* =========================
   Team Members
   ========================= */

/* The names offered when assigning work: add one at the top, remove one with its button */
/* (which asks first when work is assigned to them, since that work becomes unassigned). */
export function MembersDialog({ onClose }: { onClose: () => void }) {
  const board = useBoard();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEscape(!removing, onClose);

  function add(event: FormEvent) {
    event.preventDefault();
    const problem = addMember(name);
    setError(problem);
    if (!problem) setName('');
    inputRef.current?.focus();
  }

  const assignedTo = (member: string) => board.items.filter(item => item.assignee === member).length;

  function askToRemove(member: string) {
    if (assignedTo(member)) setRemoving(member);
    else removeMember(member);
  }

  return (
    <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog members-dialog" role="dialog" aria-modal="true" aria-labelledby="members-title">
        <div className="members-head">
          <div>
            <h2 id="members-title">Team members</h2>
            <p>The names offered when assigning work.</p>
          </div>
          <button type="button" className="window-control" aria-label="Close" data-tooltip="Close" data-shortcut="Esc" data-tooltip-align="end" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <form className="members-add" onSubmit={add}>
          <input ref={inputRef} className="board-input" aria-label="New member's name" placeholder="Name" maxLength={MEMBER_LENGTH} value={name} onChange={event => setName(event.target.value)} />
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
        {error && <p className="board-form-error" role="alert">{error}</p>}

        {board.members.length ? (
          <ul className="members-list">
            {board.members.map(member => (
              <li key={member} className="members-row">
                <Avatar initials={initialsOf(member)} className="work-avatar" />
                <span className="members-name">{member}</span>
                <span className="members-count">{assignedTo(member)} assigned</span>
                <button type="button" className="inbox-action" aria-label={`Remove ${member}`} data-tooltip="Remove" data-tooltip-align="end" onClick={() => askToRemove(member)}>
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="members-empty">No team members yet.</p>}
      </div>

      {removing && (
        <ConfirmDialog title={`Remove ${removing}?`} confirmLabel="Remove" danger onConfirm={() => { removeMember(removing); setRemoving(null); }} onCancel={() => setRemoving(null)}>
          Their {assignedTo(removing)} work {assignedTo(removing) === 1 ? 'item becomes' : 'items become'} unassigned.
        </ConfirmDialog>
      )}
    </div>
  );
}
