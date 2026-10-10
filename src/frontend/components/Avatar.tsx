type AvatarProps = {
  initials: string;
  className?: string;
};

/* A round badge showing someone's initials. */
export function Avatar({ initials, className = '' }: AvatarProps) {
  return (
    <span className={`avatar ${className}`.trim()} aria-label={initials}>
      {initials}
    </span>
  );
}
