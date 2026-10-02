# Manual device QA checklist (PRD §12)

Playwright WebKit is not iOS Safari. Run this on **one real Android phone (Chrome)** and **one real iPhone
(Safari, installed to the Home Screen and in a tab)** at M0 (S3, S4), M2 exit and M4. Record date, device,
OS/browser version and result next to each item.

## M0 — spikes S3/S4 (reader harness: `node spikes/serve.mjs`, then open `http://<pc-ip>:5199/spikes/overlay/`)

- [ ] Pinch-zoom the 500-page fixture between 50 % and 400 %: smooth (≥ 45 fps feel), no tab reload/crash.
- [ ] After pinch release the point under your fingers stays put (no jump) and pages re-render sharp.
- [ ] One-finger scroll never triggers zoom; two-finger pinch never scrolls the page; browser page-zoom does not engage.
- [ ] At 400 % and rotations 0/90/180/270 the red calibration outlines sit on the black boxes (≤ 1 px).
- [ ] Tap vs drag: 50 quick taps on text lines select the line; 50 short drags/long-presses start native selection (≥ 95 % correct).
- [ ] A 3-line native selection produces 3 rects aligned with the text; our toolbar does not hide under the iOS callout.

## M2 exit — annotation core

- [ ] Tap a line: band + toolbar; tap blank space: bars toggle / toolbar closes; long-press: native word selection,
      our toolbar sits below it (not under the iOS callout); drag the handles across 3 lines → 3 rects.
- [ ] Highlight with each swatch; same swatch again removes it (Undo in the toast restores it); another swatch recolours.
- [ ] Note: toolbar Note opens the editor above the keyboard; type, tap outside → saved; bubble in the gutter
      (≥ 44 px hit area) reopens it; clearing the text asks before deleting.
- [ ] Bookmark: bottom-bar Quick bookmark marks the reading line; ribbon popover renames/deletes; jump from the panel.
- [ ] Panel: swipe up on the bottom bar opens the sheet on Annotations; grabber tap expands, drag down closes;
      filters (colour chips, text) and the per-colour eye toggle work.
- [ ] Input → visible annotation feels instant (< 100 ms, NFR-PERF-03).
- [ ] Theme switch Light/Warm/Dark on a text PDF, a slide deck (`04-slides`) and a scanned PDF: text inverted,
      photos natural, navy slide untouched, scanned page inverted; warmth slider tints only the page area.
- [ ] Resume returns to the same line (triangle marker for 2 s) after closing and reopening the installed app.
- [ ] Toasts never cover the bottom bar.

## M4 — release

- [ ] Install to Home Screen (Android prompt; iOS Share → Add to Home Screen helper).
- [ ] Offline: open a cached PDF in airplane mode, annotate, reconnect, changes sync.
- [ ] `navigator.storage.persist()` granted (Android) / installed app keeps data after a week (iOS).
- [ ] Memory: 500-page fixture, scroll end to end and pinch repeatedly — no reload; peak < 300 MB if measurable.
