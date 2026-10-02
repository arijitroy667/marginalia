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

- [ ] Highlight, note, bookmark a line by touch; gutter markers ≥ 44 px hit area.
- [ ] Theme switch Light/Warm/Dark on a text PDF and a scanned PDF; images natural in Dark on text PDFs.
- [ ] Resume returns to the same line after closing and reopening the installed app.

## M4 — release

- [ ] Install to Home Screen (Android prompt; iOS Share → Add to Home Screen helper).
- [ ] Offline: open a cached PDF in airplane mode, annotate, reconnect, changes sync.
- [ ] `navigator.storage.persist()` granted (Android) / installed app keeps data after a week (iOS).
- [ ] Memory: 500-page fixture, scroll end to end and pinch repeatedly — no reload; peak < 300 MB if measurable.
