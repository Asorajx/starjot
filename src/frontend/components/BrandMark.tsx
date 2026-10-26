/* =========================
   Brand Mark
   ========================= */

/* The Starjot logo: a lowercase j whose dot is a four-point star, on a blue square. */
/* public/favicon.svg draws the same mark for the browser tab, with thicker lines for 16px. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <rect width="96" height="96" rx="16" fill="#4e66d8" />
      <path d="M52 44V68C52 80 45 84 36 81" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <path d="M52 13C53.4 22.5 55.5 24.6 65 26C55.5 27.4 53.4 29.5 52 39C50.6 29.5 48.5 27.4 39 26C48.5 24.6 50.6 22.5 52 13Z" fill="#fff" />
    </svg>
  );
}
