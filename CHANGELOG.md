# Changes

## 0.7.8

- Stats: remove Daily Crossword time recording, since NYT already keeps its own Crossword stats. Only Hard Sudoku times are recorded now; crossword times saved by earlier versions stay in your history and export.

## 0.7.7

- Popup: each game name links to its puzzle (Sudoku: nytimes.com/puzzles/sudoku, Crossword: nytimes.com/crosswords).
- Popup: show Done with the time until the next puzzle, or New puzzle ready, from the latest puzzle finished in this browser. Any Sudoku difficulty or daily crossword counts. Wordle and Connections reset at local midnight; Sudoku and crosswords at 10 p.m. ET for Tuesday–Saturday puzzles and 6 p.m. ET for Sunday and Monday puzzles (7 p.m. and 3 p.m. Pacific). Nothing is fetched and no account data is read. Clear history also removes Done status.
- Popup: games you turn off move into Archive, a small link next to How to use; switch a game back on there to restore it.
- Connections: Submit groups sends every unsolved color with exactly four single-color words through the game's own Submit, in the Submit order from Settings (purple, blue, green, yellow by default - reverse rainbow), and stops at the first miss. Each submission appears in Previous tries.
- Sudoku: replace Snyder and Center marks with Colored candidate, below Auto candidate. Turn it on with the checkbox or a hotkey (B by default); candidates you enter or tap take your color (blue by default) in italic, and tapping an existing candidate colors or uncolors it. Turning it off never changes the game's mode. Works with Auto candidate.
- Sudoku: an eye hides or shows colored candidates. Settings offer the hotkey, a hex color, Italic, and Clear all: Colors (keep the candidates) or Colored candidates (delete them from the board after a second click).

## 0.7.6

- Remove Strands support, including sketch tools, the popup entry, page integration and the bundled game logo.
- Remove Strands scripts and icons

## 0.7.5

- Remove Crossword clue hover previews and their Settings toggle.
- Speed up Crossword A–Z trials while waiting for native input and selection updates; preserve the correct letter while congratulations loads.
- Add per-square Crossword candidate letters with a plain Notes toolbar button, Ctrl shortcut, erase, Undo and Clear all. Match Notes and A–Z spacing to the native toolbar buttons. Customize candidate and Pencil shortcuts independently in native Settings. Candidates stay local to each puzzle.

- Open a compact floating calendar from a knife logo beside the game's Settings control. Open and close the same calendar with an expandable row in the extension popup. Keep the original header and always-visible game tools; remove viewport-based width clamping so Chrome opens the popup at its original 300 px width.
- Record Hard Sudoku and full-size Daily Crossword times by default inside congratulations. A new completion replaces that date’s time, including slower results; reopening the same result preserves calendar corrections. Keep the time when the dialog closes; unchecking restores the previous time or leaves an empty date unrecorded. Match the native dialog typography.
- Show colored calendar dates and one overall average per game; reveal an individual time only after clicking its date. Rank results immediately with green/yellow/red personal speed bands; a lone result or all-equal times stay normal (yellow).
- Add, edit or delete a time from any calendar date. Use the NYT puzzle date for records. Show a date dot only for the open puzzle in its on-page calendar; omit it from the extension popup. Sync manual revisions and deletion markers without reviving stale times.
- Store exact times in compact yearly blocks with no age-based cutoff. Test Chrome sync capacity for 15 years at six daily results; keep local history and lifetime averages if sync fills up.
- Add controls for automatic recording, sync, JSON export and clearing history across devices. Exclude Incognito completions.
- Read Connections’ visible selection instead of stale checkbox values. Save mouse and Enter submissions immediately and update their observed feedback.
- Anchor corner marks inside Connections tiles so they stay aligned throughout the native press animation. Remove their elements before Submit, then restore the remaining tiles’ marks after the board settles.
- Find the matching Connections Companion rating for archived puzzles even when their footer still links to today's article.
- Put Clear marks beside Undo mark in Connections; clearing can be undone. Match both buttons' inner spacing to NYT's rounded controls.
- Capture Daily Crossword congratulations with every weekday name, including “You solved a Monday Crossword.”
- Continue Crossword A–Z trials through NYT’s varying incorrect-result headings and “square’s amiss” message, including reused confirmation buttons; stop at congratulations.
- Shorten the README and help. Use larger, left-aligned help text in a centered column, with green, yellow and red stats labels.
- Keep Sudoku Snyder and Center marks inside the board and behind Pause, Help and Settings.
- Update the privacy policy for completion records and Chrome sync.
