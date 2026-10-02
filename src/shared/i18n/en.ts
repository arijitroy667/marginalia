import { APP_NAME, MAX_FILE_BYTES } from '../../config';

const q = (s: string) => `“${s}”`;

/** All UI strings (NFR-I18N-01). Components import `en` instead of inlining literals. */
export const en = {
  common: { dismiss: 'Dismiss', close: 'Close', undo: 'Undo', cancel: 'Cancel', retry: 'Retry' },
  app: {
    name: APP_NAME,
    skipToContent: 'Skip to content',
    nav: { library: 'Library', settings: 'Settings', main: 'Main' },
  },
  theme: {
    label: 'Theme',
    system: 'System',
    light: 'Light',
    warm: 'Warm',
    dark: 'Dark',
  },
  errors: {
    title: 'Something went wrong',
    body: 'The app hit an unexpected error. Your annotations are saved on this device.',
    reload: 'Reload',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This address does not exist in the app.',
    backToLibrary: 'Back to library',
  },
  library: {
    title: 'Library',
    add: 'Add PDF',
    dropHere: 'Tip: drop PDF files anywhere on this page to add them.',
    emptyTitle: 'Your library is empty',
    emptyBody: 'Add a PDF to start reading. Highlights, notes and bookmarks attach to lines, and your place is saved as you read.',
    search: 'Search titles',
    sortBy: 'Sort',
    sorts: { opened: 'Last opened', title: 'Title', added: 'Recently added' },
    viewLabel: 'Layout',
    views: { grid: 'Grid', list: 'List' },
    noMatch: (query: string) => `No titles match ${q(query)}.`,
    notStarted: 'Not started',
    progress: (pct: number) => `${pct}% read`,
    opened: (when: string) => `opened ${when}`,
    addedAgo: (when: string) => `added ${when}`,
    added: (title: string) => `Added ${q(title)}`,
    existing: (title: string) => `${q(title)} is already in your library`,
    rejected: {
      empty: (n: string) => `${q(n)} is empty.`,
      'too-large': (n: string) => `${q(n)} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      'not-pdf': (n: string) => `${q(n)} is not a PDF.`,
      corrupt: (n: string) => `${q(n)} could not be opened. It may be damaged or unsupported.`,
      'password-cancelled': (n: string) => `${q(n)} was not added: no password.`,
    },
  },
  password: {
    title: 'Password required',
    body: (n: string) => `${q(n)} is protected. The password unlocks it on this device and is never stored.`,
    wrong: 'Wrong password. Try again.',
    label: 'Password',
    submit: 'Unlock',
  },
  reader: { title: 'Reader' },
  settings: { title: 'Settings' },
  auth: { title: 'Sign in' },
} as const;
