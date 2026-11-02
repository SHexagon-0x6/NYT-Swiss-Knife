# NYT Games Swiss Knife

Simple tools to make your NYT gameplay better

Independent project; not affiliated with The New York Times.

| Game | Tools |
| --- | --- |
| Connections | Colored corner marks, category names, undo/clear marks, daily and archive difficulty, and submitted tries. |
| Sudoku | Snyder and Center marks, erase, undo and configurable mode keys. |
| Strands | Draw paths, erase by click or drag, undo, clear and show/hide sketches. |
| Wordle | Warn about conflicting letters and edit any active tile. |
| Crossword | Fast A–Z trials, Notes for candidate letters with erase/undo/clear, and configurable shortcuts. |
| Stats & calendar | Hard Sudoku and Daily Crossword times, speed colors, overall averages, daily edits, Chrome sync and JSON export. |

[Privacy policy](PRIVACY.md) · [Download releases](https://github.com/SHexagon-0x6/NYT-Swiss-Knife/releases)

Use the extension popup to enable each game's tools, and the Settings controls on a game page to choose individual tools. For controls and shortcuts, open **How to use** at the bottom of the popup.

## 1.0.0 local preview

Version 1.0.0 is an unreleased preview based on `v0.7.4`. The commands below build and test locally; they do not publish a release.

```sh
npm run prepare:local
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `local-build/nyt-games-swiss-knife-1.0.0`. Keep using this folder for the local install; after changes, rerun the command, click **Reload** in Chrome, and refresh open NYT puzzle tabs. Turn off a separate installed copy while testing to avoid duplicate puzzle controls. Existing production-extension data stays with that extension ID; it is not copied into a separate unpacked install.

### Crossword tools

- **Fast A–Z:** Select a square and start A–Z beside Rebus. Trials run as fast as the game accepts each letter, automatically dismissing incorrect-result messages. Pause, Resume or Stop anytime; success, Z or manual input stops the run.
- **Notes:** Click Notes beside A–Z or tap Ctrl, then type possible letters in an empty square. Type a letter again to remove it; Backspace/Delete erases the square. Use the adjacent Undo, Erase and Clear all buttons, or Ctrl/Cmd+Z to undo. Ctrl again or Escape returns to normal entry. Notes stay local to that puzzle and never enter answers.
- **Settings:** Enable individual tools and customize the candidate and native Pencil shortcuts (Ctrl and Shift by default). A shortcut belongs to one mode at a time.

### Stats & calendar

Open the knife logo beside NYT Settings, or expand **Calendar & stats** in the extension popup.

- **Automatic recording:** Hard Sudoku and the full-size Daily Crossword save their displayed final time when congratulations appears. **Record this time** is checked by default; closing the dialog keeps the time. A new completion replaces that puzzle date’s saved time. Uncheck it to keep the previous time, or leave the date empty if none existed. No times are captured from a filled board or running timer. Other difficulties, smaller crosswords and Incognito are excluded.
- **Edit any day:** Click a calendar date to add, change or delete its time. Enter `m:ss` or `h:mm:ss`. One record per puzzle date; averages and colors update after edits.
- **Puzzle dates:** Records follow NYT’s displayed puzzle date, including archives and early releases. The dot appears only in the calendar on that puzzle’s page. The extension popup has no date dot.
- **Colors:** Results compare with that game’s history from the first entry: fastest 25% green, middle 50% yellow, slowest 25% red. A lone result or all-equal times stay yellow (normal). Ties share a color. One overall average appears below.
- **Export:** **Export history** in **Data & sync** downloads your saved puzzle dates and times as JSON.
- **Storage:** History has no age limit. Chrome sync needs the same extension ID and Chrome account on each device. Normal updates preserve data; the prepared local build keeps a fixed preview ID. **Data & sync** controls automatic recording, sync, export and clearing history.

Compact automatic records fit 15 years at six daily results in the capacity test. Repeat solves, manual edits and deletion markers use additional space. If sync fills up, local records and the overall average continue. Keep sync enabled when clearing history to remove synced copies.

Other puzzle notes and marks are cleaned up after 90 days without an update. Uninstalling removes local extension data; export a copy of your history before uninstalling.

For a visual preview without installing, run `npm run preview`, then open `http://127.0.0.1:8765/popup.html?demo=1`. This clearly labeled sample mode exists only outside the extension and never writes real stats. Without `?demo=1`, the browser preview starts empty.

### Validation and release preparation

```sh
npm test
npm run check
npm run test:browser
STATS_SCREENSHOTS=0 npm run test:stats
npm run prepare:local
npm run package:publish
npm run verify:package
```

Chrome is required for browser checks. In containers that cannot start Chrome's sandbox, add `-- --no-sandbox` to `npm run test:browser`. Stats checks use disposable profiles and local result-screen fixtures, covering default recording, repeat-solve undo, date edits, JSON export and history retention. They do not verify delivery between signed-in Chrome devices.

The unpacked test build is in `local-build/nyt-games-swiss-knife-1.0.0`; the packaged build and checksum are in `publish/`. Reload the extension and refresh puzzle tabs after every rebuild. Live checks have covered Connections tries, marks and archive difficulty, Sudoku overlay ordering and completion recording, and Crossword result capture, fast A–Z continuation and candidate letters.

Before releasing 1.0.0:

1. Finish local acceptance testing. Check Sunday/archived Crossword results and a real two-device Chrome sync round trip, offline merges and deletion.
2. Clean up and merge the reviewed feature branch into `main`, then finish the documentation wording review.
3. Publish the updated [privacy policy](PRIVACY.md) at the store policy URL and update the store's privacy disclosures and feature descriptions for stats and sync. The only API permission remains `storage`.
4. Remove `version_name: "1.0.0 local preview"` from `manifest.json`, rerun validation and packaging, then tag and publish `v1.0.0`. The release guard prevents publishing a preview build.

## License

Released under the [MIT License](LICENSE). The extension logo is adapted from Lucide's pocket-knife icon under the [ISC license](icons/LICENSE-lucide.txt). The game icons in `icons/games/` are published by The New York Times and are not covered by this license; see [icons/README.txt](icons/README.txt).
