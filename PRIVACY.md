# NYT Games Swiss Knife privacy policy

Updated November 1, 2026.

NYT Games Swiss Knife is an independent browser extension for supported New York Times puzzles. It is not affiliated with or endorsed by The New York Times.

## What the extension uses

The extension processes visible puzzle words, letters, clues and feedback to provide its puzzle tools. It also handles your manual marks, category names, puzzle interactions, observed Connections guesses and feature preferences.

For the stats calendar, the extension reads the visible congratulations result for Hard Sudoku and the full-size Daily Crossword and records its displayed final time by default. Closing the dialog keeps the record; unchecking **Record this time** restores the previous time for that date, or removes the new record if no previous time existed. Automatic recording can be disabled. You can also add, edit or delete a time by selecting a calendar date. Other Sudoku difficulties, Mini, Midi and Bonus crosswords and Incognito completion capture are excluded.

Saved stats contain the game type, NYT puzzle date, duration in seconds, and totals and counts. Repeat completions and manual changes retain a revision timestamp; the latest revision takes precedence. Deletion markers prevent older synced copies from restoring removed times. Each puzzle date counts once; a new completion replaces its saved time. Conflicting first records created offline converge on the faster time. The last captured duration, its recording choice and the previous saved time per puzzle date are cached locally so declining a new result can restore the old time and reopening a result does not overwrite calendar corrections. Deleting the date or clearing history removes this local capture information. The last displayed puzzle date for each supported game is also cached locally to choose the calendar’s opening month. The date dot appears only on a puzzle page, using its displayed date. These caches are not synced.

The supported puzzle's page path, identifier, date and saved-data timestamps associate your records with the correct puzzle. This does not include a history of unrelated browsing. Configured shortcuts are processed locally; general keystroke histories are not stored.

The extension does not request your name, email address, passwords, payment details or location. It does not read account cookies or hidden puzzle answers.

## Storage and deletion

Preferences and puzzle notes are stored on your device using `chrome.storage.local`. These records include manual annotations (including Crossword candidate letters), category labels, observed attempt history and any retained records from older versions. Notes, marks, guesses and ordinary tool preferences are not synchronized with your Chrome account.

Puzzle records are removed during cleanup after 90 days without an update. Cleanup runs when the extension is used. General preferences remain until changed or the extension is uninstalled. Disabling a game does not delete its records. Uninstalling the extension removes its local extension storage.

Completion stats are separate from puzzle notes and do not expire under that 90-day cleanup. They remain locally until you clear history or uninstall the extension. The calendar’s Data & sync controls let you export a JSON copy, pause automatic recording, turn stats sync on or off, or clear history. No times are reconstructed from your NYT account or historical game data. The extension does not distinguish assisted and unassisted solves; it records the displayed result or the time you enter.

### Chrome account synchronization

Stats sync is enabled by default. Stats are compacted into yearly blocks and copied to `chrome.storage.sync`, with no age-based expiration. Chrome may synchronize them through Google's Chrome sync service to the same extension on other Chrome browsers signed into your account with extension synchronization enabled. The extension does not receive your Google account identity, credentials or authentication tokens. Chrome's own privacy practices and sync settings govern this service. When Chrome sync is unavailable, recorded results remain saved locally; the extension retries when used or restarted and provides a retry button. It cannot verify delivery to another device.

The format is estimated to hold at least 15 years at six daily results with durations up to 18 hours, within Chrome’s storage quota. This estimate covers first automatic records. Repeat-solve, manual revision and deletion metadata also use space; capacity depends on result durations and edit frequency. If the quota is reached, existing synced history is retained and new records and totals continue locally; the extension reports the full sync storage. A new device may then have an incomplete history and a different average until syncing can resume. Turning off stats sync stops subsequent reads and writes to Chrome sync storage; it does not remove previously synced records. To erase synced history, enable stats sync and use **Clear history**. A reset timestamp is retained and synchronized to prevent older copies on offline devices from restoring deleted history when they reconnect. Records saved offline before learning about that reset are also discarded when the device accepts the reset. Devices with stats sync disabled retain their copies until you clear them or re-enable sync. Exported files are managed by you and are not removed by clearing extension history.

Chrome requires **Allow in incognito** before the extension can run in private windows. Extension storage can be shared between normal and Incognito windows; closing an Incognito window does not necessarily delete its saved marks or preferences.

The stats feature does not automatically record completions from Incognito windows.

## Sharing and network requests

The extension does not upload saved puzzle records to its publisher. It has no extension analytics, advertising, publisher account system or remote executable code. Completion stats may be transferred by Chrome account synchronization as described above; there is no publisher-operated stats server. User data is not sold.

When Connections Daily difficulty is enabled, the extension requests the matching public NYT Companion article. It uses the game's link when available. For archived puzzles without a matching link, it uses the archive date and daily puzzle number, checking the previous day's and puzzle day's article URLs. Requests omit account credentials and the referrer. Only the numeric rating and source metadata are kept in a temporary memory cache; article hints and solutions are not displayed or saved. Saved marks and guess history are not sent with the request. You can disable this feature in Settings.

Your requested Wordle edits, Sudoku Auto Candidate changes and Crossword A–Z trials use the game's native controls. Crossword trials begin only when you start them and leave puzzle completion to the game's normal behavior. The game website's own requests and privacy practices are separate from this extension.

Opening this policy on GitHub or another external link is subject to that website's privacy practices.

## Permissions and on-page controls

The `storage` permission saves preferences, puzzle records and completion stats locally, and makes the disclosed stats available to Chrome sync. A bundled background service worker handles stats writes, merges and deletion. No additional API permissions are requested for stats. Content scripts run only on the supported NYT puzzle paths declared in the manifest. They read the visible board and result screens and place the requested tools; the extension does not request access to every website.

The tools run within the game page. Closed shadow roots reduce direct access to their controls, but do not create a separate security boundary. Website scripts can still observe page-level input events and board annotations.

## Limited use

Data obtained from supported game pages is used only to provide the extension's disclosed puzzle tools and personal stats, consistent with the Chrome Web Store User Data Policy and its Limited Use requirements. The publisher does not receive or inspect your saved puzzle records or stats. Data is not used for advertising, unrelated purposes, creditworthiness or lending decisions.
