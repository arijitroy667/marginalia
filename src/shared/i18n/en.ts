import { APP_NAME } from '../../config';

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
  library: { title: 'Library' },
  reader: { title: 'Reader' },
  settings: { title: 'Settings' },
  auth: { title: 'Sign in' },
} as const;
