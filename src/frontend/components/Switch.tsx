type SwitchProps = {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
};


/* =========================
   Switch
   ========================= */

/* An on/off switch for a setting. Its label is read out by screen readers. */
export function Switch({ label, on, disabled = false, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`preview-switch setting-switch ${on ? 'preview-switch--on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}
