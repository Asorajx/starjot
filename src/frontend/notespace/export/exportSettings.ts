/* The formats a note can be exported to. */
export type ExportFormat = 'pdf' | 'html' | 'markdown' | 'text';

/* Everything, or the text alone (without images and drawings). */
export type ExportContent = 'everything' | 'text';

/* The paper a PDF is printed on: the note's own page layout, or a size and orientation. */
export type ExportPageFormat = 'note' | 'a4' | 'a4-landscape' | 'letter' | 'letter-landscape';

/* Which of the note's details are exported (when details are exported at all). */
export type DetailParts = {
  category: boolean;
  description: boolean;
  created: boolean;
  remarks: boolean;
  pages: boolean;
};

export const DETAIL_PARTS: { key: keyof DetailParts; label: string }[] = [
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description' },
  { key: 'created', label: 'Created' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'pages', label: 'Sub-notes' }
];

/* The choices in the Export window. They are remembered for the next export. */
export type ExportSettings = {
  format: ExportFormat;
  content: ExportContent;

  /* The note's details under its title, and which of them. */
  details: boolean;
  detailParts: DetailParts;
  pageFormat: ExportPageFormat;

  /* PDF only: how large everything is printed, in percent. */
  scale: number;

  /* Add the note's sub-pages after it, in the same file. */
  subpages: boolean;

  /* PDF and HTML: every tab of a tab block, each under its name, instead of the tab shown. */
  /* (Markdown and plain text always write every tab.) */
  allTabs: boolean;
};

export const EXPORT_FORMATS: { value: ExportFormat; label: string; extension: string }[] = [
  { value: 'pdf', label: 'PDF', extension: 'pdf' },
  { value: 'html', label: 'HTML', extension: 'html' },
  { value: 'markdown', label: 'Markdown', extension: 'md' },
  { value: 'text', label: 'Plain text', extension: 'txt' }
];

export const PAGE_FORMATS: { value: ExportPageFormat; label: string }[] = [
  { value: 'note', label: 'Current layout' },
  { value: 'a4', label: 'A4' },
  { value: 'a4-landscape', label: 'A4 landscape' },
  { value: 'letter', label: 'Letter' },
  { value: 'letter-landscape', label: 'Letter landscape' }
];

export const SCALE_MIN = 50;
export const SCALE_MAX = 200;

export const DEFAULT_EXPORT: ExportSettings = {
  format: 'pdf',
  content: 'everything',
  details: true,
  detailParts: { category: true, description: true, created: true, remarks: true, pages: true },
  pageFormat: 'note',
  scale: 100,
  subpages: false,
  allTabs: false
};


/* =========================
   Settings
   ========================= */

/* Saved export settings, with anything missing or broken replaced by the defaults. */
export function normalizeExportSettings(raw: unknown): ExportSettings {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const scale = Number(record.scale);
  const parts = (record.detailParts && typeof record.detailParts === 'object' ? record.detailParts : {}) as Record<string, unknown>;
  return {
    format: EXPORT_FORMATS.some(format => format.value === record.format) ? record.format as ExportFormat : DEFAULT_EXPORT.format,
    content: record.content === 'text' ? 'text' : 'everything',
    details: record.details !== false,
    detailParts: {
      category: parts.category !== false,
      description: parts.description !== false,
      created: parts.created !== false,
      remarks: parts.remarks !== false,
      pages: parts.pages !== false
    },
    pageFormat: PAGE_FORMATS.some(format => format.value === record.pageFormat) ? record.pageFormat as ExportPageFormat : 'note',
    scale: Number.isFinite(scale) ? Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale))) : DEFAULT_EXPORT.scale,
    subpages: record.subpages === true,
    allTabs: record.allTabs === true
  };
}
