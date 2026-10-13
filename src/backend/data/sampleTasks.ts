import type { StatusTab, Task } from '../../shared/types/task';


/* =========================
   Sample Work Items
   ========================= */

/* Placeholder work items shown on Boardspace until it has real storage. */
export const TASKS: Record<StatusTab, Task[]> = {
  todo: [
    { id: 'WRK-104', title: 'Design the onboarding experience', description: 'Map the first-run journey and identify the essential setup steps.', priority: 'High', tags: ['Design', 'UX'], assignee: 'AM', person: 'Alex Morgan', date: 'Oct 14', linked: ['Design principles', 'Project Atlas — Research brief'] },
    { id: 'WRK-107', title: 'Draft workspace navigation guidelines', description: 'Define a consistent hierarchy for each workspace and its subviews.', priority: 'Medium', tags: ['Product'], assignee: 'JL', person: 'Jordan Lee', date: 'Oct 16', linked: ['Platform architecture notes'] },
    { id: 'WRK-112', title: 'Review note structure options', description: 'Document the continuous-first editor and optional structured blocks.', priority: 'High', tags: ['Research', 'Notespace'], assignee: 'SK', person: 'Sam Kim', date: 'Oct 18', linked: ['Project Atlas — Research brief'] },
    { id: 'WRK-116', title: 'Write release communication outline', description: 'Prepare messaging for the first internal product walkthrough.', priority: 'Low', tags: ['Content'], assignee: 'AM', person: 'Alex Morgan', date: 'Oct 21', linked: [] },
    { id: 'WRK-119', title: 'Audit responsive component states', description: 'Check navigation, card density and form layouts across breakpoints.', priority: 'Medium', tags: ['Frontend'], assignee: 'JL', person: 'Jordan Lee', date: 'Oct 24', linked: ['Design principles'] },
    { id: 'WRK-121', title: 'Plan document export experience', description: 'Explore future page-break grouping and paginated preview requirements.', priority: 'Low', tags: ['Planning'], assignee: 'SK', person: 'Sam Kim', date: 'Oct 28', linked: ['Platform architecture notes'] }
  ],
  progress: [
    { id: 'WRK-090', title: 'Build a reusable page header', description: 'Standardize breadcrumbs, actions and shared layout spacing.', priority: 'High', tags: ['Frontend'], assignee: 'JL', person: 'Jordan Lee', date: 'Oct 12', linked: ['Design principles'] },
    { id: 'WRK-095', title: 'Prototype a document editor', description: 'Explore long-form reading and editing surfaces without visible blocks.', priority: 'Medium', tags: ['Notespace'], assignee: 'SK', person: 'Sam Kim', date: 'Oct 15', linked: ['Project Atlas — Research brief'] },
    { id: 'WRK-099', title: 'Define project card anatomy', description: 'Find a clear balance of metadata, descriptive content and linked notes.', priority: 'Medium', tags: ['Boardspace'], assignee: 'AM', person: 'Alex Morgan', date: 'Oct 18', linked: [] }
  ],
  review: [
    { id: 'WRK-079', title: 'Review dashboard typography', description: 'Validate heading scale, density, text contrast and accessibility.', priority: 'Medium', tags: ['Design'], assignee: 'AM', person: 'Alex Morgan', date: 'Oct 11', linked: ['Design principles'] },
    { id: 'WRK-082', title: 'Approve icon style and sizing', description: 'Review the navigation and object iconography across the application.', priority: 'Low', tags: ['UI'], assignee: 'JL', person: 'Jordan Lee', date: 'Oct 12', linked: [] }
  ],
  done: [
    { id: 'WRK-061', title: 'Create initial product sitemap', description: 'Establish the three independent top-level workspaces.', priority: 'Medium', tags: ['Planning'], assignee: 'SK', person: 'Sam Kim', date: 'Oct 3', linked: ['Platform architecture notes'] },
    { id: 'WRK-067', title: 'Compile interface references', description: 'Collect examples of focused editors and project-management views.', priority: 'Low', tags: ['Research'], assignee: 'AM', person: 'Alex Morgan', date: 'Oct 5', linked: ['Ideas worth exploring'] },
    { id: 'WRK-072', title: 'Define light-mode foundation', description: 'Document neutrals, blue accents, borders and component radii.', priority: 'High', tags: ['Design system'], assignee: 'JL', person: 'Jordan Lee', date: 'Oct 6', linked: ['Design principles'] }
  ]
};
