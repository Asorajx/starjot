import type { Note } from '../../shared/types/note';


/* =========================
   Sample Notes
   ========================= */

/* First-run examples; the store fills in missing fields and later saves edits locally. */
/* Categories refer to the default category ids (see backend/data/defaultCategories.ts). */
export const SAMPLE_NOTES: Partial<Note>[] = [
  { id: 'atlas', title: 'Project Atlas — Research brief', subtitle: 'A living document for the next chapter of Project Atlas: goals, constraints, early ideas, and the decisions still ahead.', preview: 'A living document for the next chapter of Project Atlas: goals, constraints, early ideas, and the decisions still ahead.', category: 'work', updated: 'Edited 12 min ago', date: 'Today', pinned: true, accent: 'indigo', createdAt: '2026-09-28T09:00:00.000Z', read: '6 min read' },
  { id: 'weekly', title: 'Weekly team notes', subtitle: 'Key decisions, open questions and follow-ups from our weekly product sync.', preview: 'Key decisions, open questions and follow-ups from our weekly product sync.', category: 'work', updated: 'Edited yesterday', date: 'Yesterday', pinned: true, accent: 'mint', createdAt: '2026-10-01T09:00:00.000Z', read: '4 min read' },
  { id: 'design', title: 'Design principles', subtitle: 'Building useful tools that stay quietly out of the way. Clarity, context and thoughtful defaults.', preview: 'Building useful tools that stay quietly out of the way. Clarity, context and thoughtful defaults.', category: 'school', updated: 'Edited 2 days ago', date: 'Oct 7', pinned: true, accent: 'amber', createdAt: '2026-09-20T09:00:00.000Z', read: '8 min read' },
  { id: 'ideas', title: 'Ideas worth exploring', subtitle: 'A growing collection of product directions, open questions, and little sparks of inspiration.', preview: 'A growing collection of product directions, open questions, and little sparks of inspiration.', category: 'personal', updated: 'Edited 3 days ago', date: 'Oct 6', pinned: false, accent: 'rose', createdAt: '2026-09-24T09:00:00.000Z', read: '3 min read' },
  { id: 'api', title: 'Platform architecture notes', subtitle: 'System boundaries, patterns, diagrams, and implementation considerations.', preview: 'System boundaries, patterns, diagrams, and implementation considerations.', category: 'school', updated: 'Edited 4 days ago', date: 'Oct 5', pinned: false, accent: 'indigo', createdAt: '2026-09-18T09:00:00.000Z', read: '12 min read' },
  { id: 'launch', title: 'Q4 launch checklist', subtitle: 'Milestones, messaging, handoff criteria, and reminders for the upcoming release.', preview: 'Milestones, messaging, handoff criteria, and reminders for the upcoming release.', category: 'work', updated: 'Edited last week', date: 'Oct 2', pinned: false, accent: 'mint', createdAt: '2026-09-30T09:00:00.000Z', read: '5 min read' }
];

/* Document content for the sample notes, keyed by note id. */
export const SAMPLE_CONTENT: Record<string, string> = {
  atlas: '<h2>Overview</h2><p>Project Atlas explores how a calmer, more connected workspace can help teams turn scattered thoughts into meaningful progress. The goal is simple: make it easier to think clearly, document decisions, and keep work moving.</p>'
    + '<p>We are starting with two distinct spaces — one for notes and knowledge, another for work items. They should feel connected without becoming the same thing.</p>'
    + '<h2>What we are building</h2><p>Our first milestone focuses on the experience: beautiful, intuitive screens that show how the pieces fit together. A few principles will guide the direction:</p>'
    + '<ul><li><strong>Writing comes first.</strong> A note should feel like a continuous document, not a collection of containers.</li><li><strong>Structure is optional.</strong> Turn on blocks for a particular note when more granular organization helps.</li><li><strong>Relationships stay lightweight.</strong> Link notes to work items without merging their underlying models.</li></ul>'
    + '<h2>Questions to explore</h2><p>How can we make the transition from freeform thinking to structured documentation feel natural? When should a collection of elements be kept together as one layout unit?</p>'
    + '<blockquote>Great tools should give ideas room to breathe — and structure a place to land.</blockquote>'
    + '<h2>Next steps</h2><p>Review the initial layouts with the team, gather feedback on the editing experience, and refine the components before connecting real data.</p>',
  weekly: '<h2>Discussion</h2><p>Review the current priorities and share updates on the workspace design.</p><h2>Decisions</h2><ul><li>Keep Notespace and Boardspace as independent workspaces.</li><li>Default to continuous writing for new notes.</li></ul><h2>Follow-ups</h2><p>Test the editor flow with a few sample documents.</p>',
  design: '<h2>Clarity first</h2><p>The interface should provide hierarchy without unnecessary visual noise.</p><h2>Good defaults</h2><p>Start with a simple document. Show advanced controls only when someone asks for them.</p><h2>Consistency</h2><p>Navigation, typography, and spacing should feel predictable across workspaces.</p>',
  ideas: '<h2>Ideas to revisit</h2><ul><li>Keyboard-first note creation.</li><li>A lightweight linked-reference system.</li><li>Simple document templates.</li></ul><h2>Open questions</h2><p>How can we introduce more structure without slowing down writing?</p>',
  api: '<h2>Workspace boundaries</h2><p>Notespace manages documents. Boardspace manages work items. Shared interfaces can link them without merging their data models.</p><h2>Future storage</h2><p>The Windows application will eventually use a desktop storage adapter instead of browser localStorage.</p>',
  launch: '<h2>Preparation</h2><ul><li>Review the main user flows.</li><li>Confirm empty states and keyboard interactions.</li><li>Check smaller desktop windows.</li></ul><h2>Release checklist</h2><p>Verify note creation, saving, reopening, and responsive layouts.</p>'
};
