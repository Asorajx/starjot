import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useEscape } from '../lib/useDismiss';
import { usePresence } from '../lib/usePresence';
import { Icon, type IconName } from './Icon';

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;

  /* A small heading shown above this option, starting a group (such as "Categories"). */
  heading?: string;

  /* A thin line above this option, separating it from the ones before without a heading. */
  divider?: boolean;
};

type DropdownProps<T extends string> = {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;

  /* The accessible name, such as "Search in"; the button reads "<name>: <chosen option>". */
  label: string;

  /* Words shown before the chosen option on the button, such as "In". */
  prefix?: string;

  /* The button's look; it defaults to a small bordered button. */
  className?: string;

  /* Line the menu up with the button's right edge instead of its left (for buttons on the right). */
  alignEnd?: boolean;

  /* A locked note's dropdowns show their value but cannot be opened. */
  disabled?: boolean;

  /* For placing the whole dropdown, such as a code block's language picker over its block. */
  wrapperClassName?: string;
  style?: CSSProperties;
};

/* The tallest a menu grows before it scrolls (as .dropdown-menu in dropdown.css). */
const MENU_HEIGHT = 320;


/* =========================
   Dropdown
   ========================= */

/* A select box in the app's own style: a button showing the chosen option, and a menu like the */
/* note menu, with an icon beside each option and a tick on the chosen one. From the keyboard it */
/* works like a select box: ↑ and ↓ move (choosing straight away while closed), Home and End go */
/* to the first and last, a letter jumps to the next option starting with it, Enter or Space */
/* opens or chooses, and Escape or Tab closes. A click anywhere else closes it too. The menu */
/* fades in and out, and is never taller than the room left on screen. */
export function Dropdown<T extends string>({ value, options, onChange, label, prefix, className = 'dropdown-button', alignEnd, disabled = false, wrapperClassName = '', style }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);

  /* A menu that would run past the right edge of the screen (on a phone, say) lines up with the */
  /* button's right edge instead, and one that would run past the bottom opens upwards when there */
  /* is more room above. Checked each time it opens, before it is shown. */
  const [flipped, setFlipped] = useState(false);
  const [upward, setUpward] = useState(false);
  const [room, setRoom] = useState<number | undefined>();
  const menuRef = useRef<HTMLDivElement>(null);
  const { mounted, closing } = usePresence(open);
  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const button = wrapRef.current?.getBoundingClientRect();
    if (!menu || !button) return;

    /* Worked out from the button and the menu's full size, not where the menu last sat. */
    const width = menu.offsetWidth;
    const height = Math.min(menu.scrollHeight + 2, MENU_HEIGHT);
    setFlipped(!alignEnd && button.left + width > window.innerWidth - 8);
    const below = window.innerHeight - button.bottom - 12;
    const above = button.top - 12;
    const up = height > below && above > below;
    setUpward(up);
    setRoom(height > (up ? above : below) ? Math.max(120, up ? above : below) : undefined);
  }, [open, alignEnd]);
  const chosen = Math.max(0, options.findIndex(option => option.value === value));
  const [active, setActive] = useState(chosen);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useRef(`dropdown-${Math.random().toString(36).slice(2, 8)}`).current;
  const current = options[chosen];

  useEscape(open, () => setOpen(false));

  useEffect(() => {
    if (open) setActive(chosen);
  }, [open, chosen]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  /* Keep the highlighted option in view in a long list. */
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
  }

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(options.length - 1, Math.max(0, (open ? active : chosen) + step));
      if (open) setActive(next);
      else onChange(options[next].value);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active);
      else setOpen(true);
    } else if ((event.key === 'Home' || event.key === 'End') && open) {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const letter = event.key.toLowerCase();
      const from = open ? active : chosen;
      const order = [...options.keys()].map(step => (from + 1 + step) % options.length);
      const found = order.find(index => options[index].label.toLowerCase().startsWith(letter));
      if (found === undefined) return;
      event.preventDefault();
      if (open) setActive(found);
      else onChange(options[found].value);
    }
  }

  return (
    <div className={`dropdown ${wrapperClassName}`} style={style} ref={wrapRef}>
      <button
        type="button"
        role="combobox"
        className={className}
        aria-label={`${label}: ${current?.label ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        onKeyDown={handleKeyDown}
      >
        {current?.icon && <Icon name={current.icon} size={14} />}
        <span>{prefix && <><span className="dropdown-prefix">{prefix}:</span> </>}<strong>{current?.label}</strong></span>
        {!disabled && <Icon name="chevron-down" size={14} className={`dropdown-chevron ${open ? 'is-flipped' : ''}`} />}
      </button>

      {mounted && (
        <div
          ref={menuRef}
          className={`page-menu dropdown-menu ${alignEnd || flipped ? 'is-end' : ''} ${upward ? 'is-up' : ''} ${closing ? 'is-closing' : ''}`}
          style={room ? { maxHeight: room } : undefined}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-hidden={closing || undefined}
        >
          {options.map((option, index) => (
            <div key={option.value} role="presentation">
              {option.divider && <div className="dropdown-divider" role="presentation" />}
              {option.heading && <div className="dropdown-heading" role="presentation">{option.heading}</div>}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === chosen}
                className={`page-menu-item dropdown-item ${index === active ? 'is-active' : ''}`}
                onMouseMove={() => !closing && index !== active && setActive(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => !closing && choose(index)}
              >
                {option.icon && <Icon name={option.icon} size={14} />}
                <span>{option.label}</span>
                {index === chosen && <Icon name="check" size={14} className="dropdown-check" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
