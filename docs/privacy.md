# Privacy

Marginalia is built so that your books and notes stay yours.

## What is stored, and where

| Data                                              | On your device (IndexedDB)                             | In your Supabase project (when signed in)                                                                    |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| PDF files                                         | Yes, the books you open (an offline cache you control) | Yes, in a private bucket readable only by your account. Books over 50 MB stay on the device that added them. |
| Highlights, notes, bookmarks, reading position    | Yes                                                    | Yes                                                                                                          |
| Settings (theme, colours and meanings, shortcuts) | Yes                                                    | Yes                                                                                                          |
| Your email address                                | No                                                     | Yes, for sign-in (Supabase Auth)                                                                             |

Every row and file in the cloud belongs to one account. Row Level Security on every table and on the file bucket
means no other account can read or change it; an automated two-user test checks this.

## What is never collected

- No analytics, no tracking, no advertising identifiers, no third-party scripts. The app's Content-Security-Policy
  only allows it to talk to its own origin and your Supabase project.
- No logs of your books, quotes or notes. The app does not write to the console at all.
- No error reporting service.

## Your control

- **Export**: every book's annotations as Markdown or JSON (annotation panel), or everything at once (Settings →
  Your data).
- **Remove from a device**: Settings → Sign out → "Remove data from this device" deletes the local library, files,
  annotations and settings on that device. Your account keeps its copy.
- **Delete a book**: "Delete file only" removes the PDF but keeps your annotations; "Delete everything" removes the
  book, the file and all its annotations, on all devices.
- **Delete your account**: removing the user in your Supabase project's Authentication page deletes all of its
  rows (cascade); delete its folder in the `pdfs` bucket to remove the files.

## Who runs the server

You do: the cloud side is your own Supabase project, and only you and the people you give access to it can see
its data. Supabase's own terms and privacy policy apply to that hosting.
