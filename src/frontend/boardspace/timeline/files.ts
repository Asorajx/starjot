import type { BoardProject, WorkStatus, WorkType } from '../../../shared/types/board';
import { csvRows } from '../../notespace/import/importText';
import { downloadFile } from '../../lib/files';
import { addDays, daysBetween, isoDay, parseDay, shortDay, today, weekStart } from '../dates';
import { blankProject, cleanProject, newId } from '../board';
import { BAR_COLORS, canHoldWork, epicCompletion, timelineRows, WORK_STATUSES, WORK_TYPES } from '../workItems';


/* =========================
   File Names and Downloads
   ========================= */

/* A file name from the project's title, without characters file systems do not allow. */
export function projectFileName(project: BoardProject, extension: string) {
  return `${project.title.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 55) || 'Boardspace'}.${extension}`;
}

/* A project backup: the whole project as JSON, which Import reads back. */
export function exportBackup(project: BoardProject) {
  downloadFile(projectFileName(project, 'json'), new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
}


/* =========================
   CSV
   ========================= */

const CSV_COLUMNS = ['Key', 'Type', 'Name', 'Start', 'End', 'Sprint', 'Parent', 'Status', 'Assignee', 'Color', 'Progress', 'Order', 'Placement'];

/* One CSV value. A value starting with =, +, - or @ gets a ' in front, so a spreadsheet never */
/* runs it as a formula. */
function csvValue(value: unknown) {
  let text = String(value ?? '');
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* The project as a CSV spreadsheet: sprints first, then work items, in an order Import reads */
/* back. An epic's progress is written as its task completion. */
export function projectCsv(project: BoardProject) {
  const sprintNames = new Map(project.sprints.map(sprint => [sprint.id, sprint.name]));
  const rows = [
    ...project.sprints.map(sprint => [sprint.id, 'Sprint', sprint.name, sprint.start, sprint.end, '', '', '', '', '', '', sprint.order, '']),
    ...project.items.map(item => [
      item.id, WORK_TYPES[item.type].label, item.name, item.start, item.end, sprintNames.get(item.sprintId) ?? '', item.parentId,
      item.type === 'epic' ? '' : WORK_STATUSES[item.status], item.assignee, item.color,
      item.type === 'epic' ? epicCompletion(project.items, item.id).percent : item.progress, item.order, item.manualBacklog ? 'Backlog' : ''
    ])
  ];
  return `﻿${[CSV_COLUMNS, ...rows].map(row => row.map(csvValue).join(',')).join('\r\n')}\r\n`;
}

export function exportCsv(project: BoardProject) {
  downloadFile(projectFileName(project, 'csv'), new Blob([projectCsv(project)], { type: 'text/csv;charset=utf-8' }));
}

const two = (value: number) => String(value).padStart(2, '0');

/* A day written in a spreadsheet: YYYY-MM-DD, D/M/YYYY (or M/D/YYYY when the day cannot be a */
/* month), "5 Oct 2026", "Oct 5, 2026" or an Excel day number. Empty for nothing; null when it */
/* cannot be read. */
export function csvDay(value: string): string | null {
  const text = value.trim();
  if (!text) return '';
  if (/^\d{5}(?:\.0+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial <= 80000) return isoDay(new Date(Date.UTC(1899, 11, 30) + serial * 86400000));
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const fullYear = (year: number) => (year < 100 ? year + (year >= 70 ? 1900 : 2000) : year);
  const day = (year: number, month: number, date: number) => {
    const iso = `${year}-${two(month)}-${two(date)}`;
    return parseDay(iso) ? iso : null;
  };
  let match = text.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T\s].*)?$/);
  if (match) return day(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+.*)?$/);
  if (match) {
    let [date, month] = [+match[1], +match[2]];
    if (month > 12 && date <= 12) [date, month] = [month, date];
    return day(fullYear(+match[3]), month, date);
  }
  match = text.match(/^(\d{1,2})[\s/-]([a-z]{3,9})[\s/-](\d{2,4})(?:\s+.*)?$/i);
  if (match) {
    const month = months.indexOf(match[2].slice(0, 3).toLowerCase());
    return month < 0 ? null : day(fullYear(+match[3]), month + 1, +match[1]);
  }
  match = text.match(/^([a-z]{3,9})[\s/-]+(\d{1,2}),?[\s/-]+(\d{2,4})(?:\s+.*)?$/i);
  if (match) {
    const month = months.indexOf(match[1].slice(0, 3).toLowerCase());
    return month < 0 ? null : day(fullYear(+match[3]), month + 1, +match[2]);
  }
  return null;
}

/* A spreadsheet's type and status names (including Jira's), as Boardspace's. */
function csvType(value: string): WorkType | 'sprint' {
  const text = value.toLowerCase().replace(/[\s_-]/g, '');
  if (text === 'sprint') return 'sprint';
  if (text === 'epic' || text === 'initiative') return 'epic';
  if (['feature', 'story', 'userstory'].includes(text)) return 'feature';
  return 'task';
}

function csvStatus(value: string): WorkStatus {
  const text = value.toLowerCase().replace(/[\s_-]/g, '');
  if (['done', 'complete', 'completed', 'closed', 'resolved'].includes(text)) return 'done';
  if (['inprogress', 'progress', 'doing', 'started'].includes(text)) return 'progress';
  if (['review', 'inreview', 'inqa', 'testing'].includes(text)) return 'review';
  if (['blocked', 'onhold', 'impediment'].includes(text)) return 'blocked';
  return 'todo';
}

export type CsvImport = { project: BoardProject; items: number; sprints: number; skipped: number; guessed: number; unreadDates: number };

/* A project from a CSV spreadsheet, such as one exported from Excel or Jira. Columns are found */
/* by their usual names (Name or Summary, Start date, Due date, Sprint, Parent or Epic link, */
/* Status, Assignee…). Sprints come from Sprint rows and from the sprint names on work items. */
/* Work without dates takes its sprint's (or this week's) and is counted, so it can be checked. */
export function csvProject(text: string, fileName: string): CsvImport {
  const rows = csvRows(text.replace(/^﻿?sep=[,;\t]\r?\n/i, ''));
  if (rows.length < 2) throw new Error('The CSV file has no rows of work.');
  const header = rows[0].map(cell => cell.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const find = (...names: string[]) => names.map(name => header.indexOf(name)).find(index => index >= 0) ?? -1;
  const columns = {
    name: find('name', 'summary', 'taskname', 'task', 'title', 'developmenttask', 'workitem'),
    type: find('type', 'issuetype', 'workitemtype'),
    key: find('key', 'issuekey', 'taskid', 'id', 'workitemid'),
    start: find('start', 'startdate', 'plannedstart', 'plannedstartdate', 'begin'),
    inferredStart: find('inferredstartdate'),
    end: find('end', 'enddate', 'duedate', 'finish', 'finishdate', 'targetend'),
    inferredEnd: find('inferredduedate', 'inferredenddate'),
    sprint: find('sprint', 'sprintname', 'iteration'),
    placement: find('placement'),
    parent: find('parent', 'parentkey', 'parentid', 'parentissue', 'parentissuekey', 'parentworkitem'),
    epic: find('epiclink', 'epickey'),
    status: find('status', 'state'),
    assignee: find('assignee', 'assignedto', 'owner'),
    color: find('color', 'colour'),
    progress: find('progress', 'percentcomplete', 'completion'),
    order: find('order', 'sortorder', 'position')
  };
  if (columns.name < 0) throw new Error(`There is no Name or Summary column (found ${rows[0].slice(0, 8).join(', ').slice(0, 175)}).`);
  /* A ' that Export put in front of a formula-like value is taken off again. */
  const cell = (row: string[], key: keyof typeof columns) => (columns[key] < 0 ? '' : String(row[columns[key]] ?? '').trim().replace(/^'(?=\s*[=+@-])/, '').slice(0, 200));

  const project = blankProject();
  project.title = fileName.replace(/\.(csv|tsv|txt)$/i, '').replace(/[_-]/g, ' ').slice(0, 70) || 'Imported project';
  let skipped = 0;
  let guessed = 0;
  let unreadDates = 0;
  const thisWeek = isoDay(weekStart(new Date()));

  type Entry = { name: string; type: WorkType | 'sprint'; start: string; end: string; key: string; sprint: string; parent: string; status: string; assignee: string; color: string; progress: string; order: string; placement: string };
  const entries: Entry[] = [];
  for (const row of rows.slice(1)) {
    const name = cell(row, 'name');
    if (!name) {
      skipped += 1;
      continue;
    }
    const rawStart = cell(row, 'start') || cell(row, 'inferredStart');
    const rawEnd = cell(row, 'end') || cell(row, 'inferredEnd');
    let start = csvDay(rawStart);
    let end = csvDay(rawEnd);
    if (start === null) { start = ''; unreadDates += 1; }
    if (end === null) { end = ''; unreadDates += 1; }
    if (start && end && start > end) { end = start; unreadDates += 1; }
    entries.push({
      name, type: csvType(cell(row, 'type')), start, end, key: cell(row, 'key'), sprint: cell(row, 'sprint'),
      parent: cell(row, 'parent') || cell(row, 'epic'), status: cell(row, 'status'), assignee: cell(row, 'assignee'),
      color: cell(row, 'color'), progress: cell(row, 'progress'), order: cell(row, 'order'), placement: cell(row, 'placement')
    });
  }

  /* Sprints, from Sprint rows and the sprint names on work. A sprint without dates spans its work, */
  /* from the earliest date in it (a start, or else a due date). */
  const sprintRows = new Map(entries.filter(entry => entry.type === 'sprint').map(entry => [entry.name.toLowerCase(), entry]));
  const work = entries.filter(entry => entry.type !== 'sprint');
  const sprintNames = new Map([...sprintRows.values()].map(entry => [entry.name.toLowerCase(), entry.name]));
  work.forEach(entry => {
    if (entry.sprint && entry.sprint.toLowerCase() !== 'backlog') sprintNames.set(entry.sprint.toLowerCase(), entry.sprint);
  });
  const sprintIds = new Map<string, string>();
  for (const [lower, name] of sprintNames) {
    const own = sprintRows.get(lower);
    const inside = work.filter(entry => entry.sprint.toLowerCase() === lower);
    const start = own?.start || inside.flatMap(entry => [entry.start, entry.end]).filter(Boolean).sort()[0] || thisWeek;
    let end = own?.end || inside.map(entry => entry.end).filter(Boolean).sort().at(-1) || isoDay(addDays(parseDay(start) as Date, 6));
    if (end < start) end = start;
    const id = own?.key && !project.sprints.some(sprint => sprint.id === own.key) ? own.key : newId('s');
    project.sprints.push({ id, name, start, end, order: own?.order && Number.isFinite(+own.order) ? +own.order : project.sprints.length });
    sprintIds.set(lower, id);
  }

  /* Work items, then their parents (by key, or else by name). */
  const used = new Set(project.sprints.map(sprint => sprint.id));
  const byKey = new Map<string, BoardProject['items'][number]>();
  const byName = new Map<string, BoardProject['items'][number]>();
  const parents: { parent: string; id: string }[] = [];
  for (const entry of work.slice(0, 1500)) {
    const sprintId = sprintIds.get(entry.sprint.toLowerCase()) ?? '';
    const sprint = project.sprints.find(item => item.id === sprintId);
    /* Work with only a due date starts in its sprint, or on that day when it comes first. */
    const start = entry.start || (sprint && (!entry.end || sprint.start <= entry.end) ? sprint.start : entry.end) || thisWeek;
    const end = entry.end || (entry.start || !sprint ? isoDay(addDays(parseDay(start) as Date, 6)) : sprint.end);
    if (end < start) {
      skipped += 1;
      continue;
    }
    if (!entry.start || !entry.end) guessed += 1;
    const id = entry.key && !used.has(entry.key) ? entry.key : newId('i');
    used.add(id);
    const progress = Number(entry.progress.replace('%', ''));
    const type = entry.type as WorkType;
    const item = {
      id, name: entry.name, type, parentId: '', sprintId, status: csvStatus(entry.status), assignee: entry.assignee.slice(0, 80), start, end,
      color: /^#[0-9a-f]{6}$/i.test(entry.color) ? entry.color : BAR_COLORS[0],
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0,
      manualBacklog: type === 'epic' && entry.placement.toLowerCase() === 'backlog',
      order: entry.order !== '' && Number.isFinite(+entry.order) ? +entry.order : project.items.length
    };
    project.items.push(item);
    parents.push({ parent: entry.parent.toLowerCase(), id });
    if (entry.key && !byKey.has(entry.key.toLowerCase())) byKey.set(entry.key.toLowerCase(), item);
    if (!byName.has(entry.name.toLowerCase())) byName.set(entry.name.toLowerCase(), item);
  }
  skipped += Math.max(0, work.length - 1500);
  for (const link of parents) {
    const item = project.items.find(entry => entry.id === link.id);
    const parent = byKey.get(link.parent) ?? byName.get(link.parent);
    if (item && parent && parent.id !== item.id && canHoldWork(parent.type, item.type)) item.parentId = parent.id;
  }

  const clean = cleanProject(project);
  if (!clean.items.length && !clean.sprints.length) throw new Error('No rows could be read as sprints or work.');
  return { project: clean, items: clean.items.length, sprints: clean.sprints.length, skipped, guessed, unreadDates };
}

/* A file's text. Excel sometimes saves CSV as UTF-16, with or without a mark at the start. */
export async function fileText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new Error('This is an Excel workbook. In Excel, choose File → Save As → CSV UTF-8, then import that file.');
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  if (bytes.length > 8 && bytes[1] === 0 && bytes[3] === 0) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length > 8 && bytes[0] === 0 && bytes[2] === 0) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

/* A project from a chosen file: a project backup (JSON) or a CSV spreadsheet. Throws with a */
/* message to show when it cannot be read. */
export async function readProjectFile(file: File): Promise<{ project: BoardProject; message: string; warning: boolean }> {
  if (/\.xlsx?$/i.test(file.name)) throw new Error('Excel workbooks cannot be imported directly. Save the sheet as CSV UTF-8 first.');
  const text = await fileText(file);
  if (/\.(csv|tsv|txt)$/i.test(file.name) || /csv|tab-separated/i.test(file.type)) {
    const result = csvProject(text, file.name);
    const notes = [
      result.skipped ? `${result.skipped} ${result.skipped === 1 ? 'row' : 'rows'} skipped` : '',
      result.unreadDates ? `${result.unreadDates} ${result.unreadDates === 1 ? 'date' : 'dates'} not understood` : '',
      result.guessed ? `${result.guessed} ${result.guessed === 1 ? 'item' : 'items'} given dates to check` : ''
    ].filter(Boolean);
    return {
      project: result.project,
      message: `${result.items} work ${result.items === 1 ? 'item' : 'items'} and ${result.sprints} ${result.sprints === 1 ? 'sprint' : 'sprints'}${notes.length ? `. ${notes.join(' · ')}` : ''}.`,
      warning: notes.length > 0
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a project backup or a CSV spreadsheet.');
  }
  const project = cleanProject(data);
  return { project, message: `${project.items.length} work items and ${project.sprints.length} sprints from the backup.`, warning: false };
}


/* =========================
   Pictures
   ========================= */

const xml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] as string));

/* The timeline as a compact SVG picture, cropped to its dates, with the rows shown (folded */
/* sprints and items stay folded). Always in light colours. */
export function timelineSvg(project: BoardProject) {
  const rows = timelineRows(project);
  const days = [...project.items.flatMap(item => [item.start, item.end]), ...project.sprints.flatMap(sprint => [sprint.start, sprint.end])].sort();
  const first = parseDay(days[0] ?? today()) as Date;
  const last = parseDay(days.at(-1) ?? today()) as Date;
  const start = weekStart(addDays(first, -7));
  const end = addDays(weekStart(addDays(last, 13)), 6);
  const span = daysBetween(start, end) + 1;
  const dayWidth = Math.min(20, Math.max(4.2, 2100 / span));
  const left = 386;
  const head = 100;
  const rowHeight = 27;
  const width = Math.ceil(left + span * dayWidth + 15);
  const height = Math.max(172, head + rows.length * rowHeight + 8);
  const parts: string[] = [];
  const rect = (x: number, y: number, w: number, h: number, fill: string) => parts.push(`<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${h}" fill="${fill}"/>`);
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, size = 1) => parts.push(`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="${size}"/>`);
  const label = (x: number, y: number, words: string, size: number, color: string, weight: number) => parts.push(`<text x="${x}" y="${y}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(words)}</text>`);
  const cut = (words: string, max: number) => (words.length > max ? `${words.slice(0, Math.max(1, max - 1))}…` : words);
  const at = (day: string) => left + daysBetween(start, parseDay(day) as Date) * dayWidth;
  const long = (from: string, to: string) => Math.max(dayWidth, (daysBetween(parseDay(from) as Date, parseDay(to) as Date) + 1) * dayWidth);

  rect(0, 0, width, height, '#ffffff');
  rect(0, 0, width, 57, '#f8fbff');
  rect(0, 0, 4, 57, '#3978f7');
  label(17, 25, cut(project.title, 75), 18, '#15284b', 700);
  label(17, 44, `${project.items.length} WORK ITEMS   ·   ${project.sprints.length} SPRINTS`, 9, '#5d6f88', 700);
  rect(0, 57, width, 43, '#edf3ff');
  line(0, head, width, head, '#d9e4f4');
  label(18, 84, 'WORK', 9, '#56657b', 750);
  label(307, 84, 'STATUS', 9, '#56657b', 750);
  const step = span > 160 ? 28 : 7;
  for (let index = 0; index < span; index += step) {
    const x = left + index * dayWidth;
    line(x, 57, x, height, '#e8edf5');
    label(x + 5, 84, shortDay(addDays(start, index)), 9, '#5d6f88', 600);
  }
  line(left, 57, left, height, '#cbd9ed', 1.3);

  rows.forEach((row, index) => {
    const y = head + index * rowHeight;
    rect(0, y, width, rowHeight, row.kind === 'sprint' ? '#eef5ff' : index % 2 ? '#ffffff' : '#fafcff');
    line(0, y + rowHeight, width, y + rowHeight, '#edf1f7');
    if (row.kind === 'sprint') {
      const folded = project.collapsedSprints[row.id];
      label(17, y + 18, `${folded ? '▸' : '▾'}  ${cut(row.sprint?.name ?? 'Backlog', 40)}`, 10, '#294569', 700);
      if (row.sprint) {
        const x = at(row.sprint.start);
        const w = long(row.sprint.start, row.sprint.end);
        rect(x, y + 7, w, 14, '#dce9ff');
        rect(x, y + 7, 3, 14, '#3978f7');
        label(x + 7, y + 17, cut(row.sprint.name, Math.max(2, Math.floor(w / 6.4))), 8, '#3866ba', 700);
      }
      return;
    }
    const { item } = row;
    const indent = Math.min(6, row.depth) * 13;
    rect(17 + indent, y + 10, 7, 7, item.type === 'epic' ? '#9778d9' : item.type === 'feature' ? '#4f86e9' : '#31b191');
    label(30 + indent, y + 18, cut(item.name, 43 - Math.floor(indent / 8)), 9.5, '#30435e', 570);
    if (item.type === 'epic') {
      const { percent } = epicCompletion(project.items, item.id);
      rect(307, y + 12, 46, 5, '#dbe6fc');
      rect(307, y + 12, (46 * percent) / 100, 5, '#3978f7');
      label(358, y + 18, `${percent}%`, 9, '#3866ba', 650);
    } else {
      label(307, y + 18, WORK_STATUSES[item.status], 9, '#56657b', 530);
    }
    const x = at(item.start);
    const w = long(item.start, item.end);
    rect(x, y + 6, w, 15, item.color);
    label(x + 5, y + 17, cut(item.name, Math.max(2, Math.floor(w / 6.1))), 8, '#ffffff', 650);
  });

  const now = daysBetween(start, parseDay(today()) as Date);
  if (now >= 0 && now < span) {
    const x = left + (now + 0.5) * dayWidth;
    line(x, 57, x, height, '#3980f7', 1.2);
    rect(x - 2.5, 56, 5, 5, '#3980f7');
  }
  return { markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`, width, height };
}

export function exportSvg(project: BoardProject) {
  downloadFile(projectFileName(project, 'svg'), new Blob([timelineSvg(project).markup], { type: 'image/svg+xml;charset=utf-8' }));
}

/* The SVG picture drawn at twice its size (within what browsers can draw) and saved as a PNG. */
export async function exportPng(project: BoardProject) {
  const { markup, width, height } = timelineSvg(project);
  const picture = new Image();
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await picture.decode();
  const scale = Math.min(2, 6000 / width, 10000 / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to draw the picture on.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  const file = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!file) throw new Error('The picture could not be made.');
  downloadFile(projectFileName(project, 'png'), file);
}
