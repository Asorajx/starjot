import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useEscape } from '../lib/useDismiss';
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


/* =========================
   Dropdown
   ========================= */

/* A select box in the app's own style: a button showing the chosen option, and a menu like the */
/* note menu, with an icon beside each option and a tick on the chosen one. From the keyboard it */
/* works like a select box: ↑ and ↓ move (choosing straight away while closed), Enter or Space */
/* opens or chooses, and Escape or Tab closes. A click anywhere else closes it too. */
export function Dropdown<T extends string>({ value, options, onChange, label, prefix, className = 'dropdown-button', alignEnd, disabled = false, wrapperClassName = '', style }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);

  /* A menu that would run past the right edge of the screen (on a phone, say) lines up with the */
  /* button's right edge instead, and one that would run past the bottom opens upwards when there */
  /* is more room above. Checked each time it opens, before it is shown. */
  const [flipped, setFlipped] = useState(false);
  const [upward, setUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) {
      setFlipped(false);
      setUpward(false);
      return;
    }
    const menu = menuRef.current?.getBoundingClientRect();
    const button = wrapRef.current?.getBoundingClientRect();
    if (menu && !alignEnd && menu.right > window.innerWidth - 8) setFlipped(true);
    if (menu && button && menu.bottom > window.innerHeight - 8 && button.top > window.innerHeight - button.bottom) setUpward(true);
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
    } else if (event.key === 'Tab') {
      setOpen(false);
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
        <span>{prefix && <>{prefix} </>}<strong>{current?.label}</strong></span>
        {!disabled && <Icon name="chevron-down" size={14} className={`dropdown-chevron ${open ? 'is-flipped' : ''}`} />}
      </button>

      {open && (
        <div ref={menuRef} className={`page-menu dropdown-menu ${alignEnd || flipped ? 'is-end' : ''} ${upward ? 'is-up' : ''}`} id={listId} role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <div key={option.value} role="presentation">
              {option.divider && <div className="dropdown-divider" role="presentation" />}
              {option.heading && <div className="dropdown-heading" role="presentation">{option.heading}</div>}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === chosen}
                className={`page-menu-item dropdown-item ${index === active ? 'is-active' : ''}`}
                onMouseMove={() => index !== active && setActive(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => choose(index)}
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
