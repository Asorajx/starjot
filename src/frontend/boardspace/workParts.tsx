import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Dropdown } from '../components/Dropdown';
import { Icon, type IconName } from '../components/Icon';
import { useDismiss } from '../lib/useDismiss';
import type { BoardProject, WorkItem, WorkStatus, WorkType } from '../../shared/types/board';
import { setAssignee, setStatus } from './board';
import { initialsOf, WORK_STATUSES, WORK_TYPES } from './workItems';


/* =========================
   Work Item Parts
   ========================= */

/* Shared by Boardspace's views (the list and the timeline). */

/* The icon beside each kind of work. */
export const TYPE_ICONS: Record<WorkType, IconName> = { epic: 'layers', feature: 'blocks', task: 'check-square' };

/* A small coloured square for a kind of work, named in its tooltip. */
export function WorkTypeIcon({ type }: { type: WorkType }) {
  return <span className={`work-type is-${type}`} data-tooltip={WORK_TYPES[type].label} aria-label={WORK_TYPES[type].label} role="img"><Icon name={TYPE_ICONS[type]} size={12} /></span>;
}

/* A bar of progress with its percentage beside it. */
export function Progress({ percent, label }: { percent: number; label: string }) {
  return (
    <span className="work-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} data-tooltip={label}>
      <span className="work-progress-track"><b style={{ width: `${percent}%` }} /></span>
      <span className="work-progress-value">{percent}%</span>
    </span>
  );
}

/* A work item's status as a tinted chip, which opens the status choices. */
export function StatusPicker({ item }: { item: WorkItem }) {
  return (
    <Dropdown
      label={`Status of ${item.name}`}
      className={`work-status is-${item.status}`}
      value={item.status}
      options={(Object.keys(WORK_STATUSES) as WorkStatus[]).map(status => ({ value: status, label: WORK_STATUSES[status] }))}
      onChange={status => setStatus(item.id, status)}
    />
  );
}

/* Who a work item is for: their initials, and their name opening the team's names. */
export function AssigneePicker({ item, board }: { item: WorkItem; board: BoardProject }) {
  const members = [...board.members];
  if (item.assignee && !members.includes(item.assignee)) members.push(item.assignee);
  return (
    <>
      <Avatar initials={item.assignee ? initialsOf(item.assignee) : '–'} className="work-avatar" />
      <Dropdown
        label={`Assignee of ${item.name}`}
        className="work-assignee"
        value={item.assignee}
        options={[{ value: '', label: 'Unassigned' }, ...members.sort((a, b) => a.localeCompare(b)).map(name => ({ value: name, label: name }))]}
        onChange={name => setAssignee(item.id, name)}
      />
    </>
  );
}


/* =========================
   Menus
   ========================= */

/* A divider goes above an item with `divider`; `heading` also names the group it starts. */
export type MenuItem = { key: string; label: string; hint: string; icon: IconName; divider?: boolean; heading?: string; run: () => void };

type MenuButtonProps = {
  label: string;
  icon: IconName;
  primary?: boolean;
  /* Show the icon alone, with the label as its tooltip (the More menu). */
  iconOnly?: boolean;
  items: MenuItem[];
};

/* A button that opens a small menu of choices under it (Create, More). The menu lines up with */
/* the button's right edge, or its left edge when there is no room on the left (a wrapped bar). */
export function MenuButton({ label, icon, primary = false, iconOnly = false, items }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [fromStart, setFromStart] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);
  useDismiss(open, `[data-menu="${label}"]`, () => setOpen(false));
  useLayoutEffect(() => {
    if (!open) {
      setFromStart(false);
      return;
    }
    const button = holder.current?.getBoundingClientRect();
    const menu = holder.current?.querySelector('.board-menu-items')?.getBoundingClientRect();
    if (button && menu) setFromStart(button.right - menu.width < 8);
  }, [open]);
  useEffect(() => {
    if (open) holder.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);
  return (
    <span className="board-menu" data-menu={label} ref={holder}>
      <button
        type="button"
        className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} ${iconOnly ? 'board-icon-button' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        data-tooltip={iconOnly && !open ? label : undefined}
        data-tooltip-align={iconOnly ? 'end' : undefined}
        onClick={() => setOpen(!open)}
      >
        <Icon name={icon} size={16} />
        {!iconOnly && <><span>{label}</span><Icon name="chevron-down" size={14} /></>}
      </button>
      {open && (
        <span className={`page-menu board-menu-items ${fromStart ? 'is-start' : ''}`} role="menu" aria-label={label}>
          {items.map(item => (
            <span key={item.key}>
              {(item.divider || item.heading) && <span className="board-menu-divider" role="separator" />}
              {item.heading && <span className="board-menu-heading">{item.heading}</span>}
              <button type="button" role="menuitem" className="page-menu-item" onClick={() => { setOpen(false); item.run(); }}>
                <Icon name={item.icon} size={16} />
                <span className="board-menu-text">{item.label}<small>{item.hint}</small></span>
              </button>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
