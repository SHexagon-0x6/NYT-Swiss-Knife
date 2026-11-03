# NYT Games Swiss Knife privacy policy

NYT Games Swiss Knife is an independent browser extension for Connections, Sudoku, Wordle and Crossword puzzles from The New York Times. It is not affiliated with or endorsed by The New York Times.

## What the extension uses

The extension processes visible puzzle words, letters, clues, feedback and interactions to provide its tools. It also handles your marks, category names, observed game guesses and preferences.

Hard Sudoku and full-size Daily Crossword completion times are recorded from visible results by default. You can disable recording or uncheck Record this time to restore the previous time for that date, or remove the new record if none existed. You can also add, edit or delete times through the calendar. Other Sudoku difficulties and Mini, Midi and Bonus crosswords are excluded.

Stats contain the game type, puzzle date, duration, totals, counts and revision or deletion metadata. Each puzzle date counts once; new completions replace saved times. Timestamps and deletion markers reconcile changes and prevent older synced copies from restoring removed records.

Captured times, recording choices, previous saved times and displayed puzzle dates are cached locally to support corrections and calendar display. These caches are not synced. Deleting a date or clearing history removes the related capture information.

### Done status in the popup

To show **Done** or **New puzzle ready** for each game, the extension saves one date per game: the latest puzzle date you finished in this browser. It is read only from what the game page shows, such as a finished board, a completion message or the game’s “Great job on today’s puzzle” start screen. Any Sudoku difficulty and any crossword count; monthly Bonus crosswords do not. A newer date replaces the older one, so no list of past days is kept. Done status is not recorded in Incognito or for games you have turned off, and it is not synced.

The popup compares that date with the publisher’s usual release schedule on your device. It does not contact The New York Times or any other server and does not read your NYT account, so a puzzle finished in the NYT app or another browser shows **New puzzle ready** until you open it here.

Puzzle paths, identifiers, dates and timestamps associate records with the correct puzzle. Shortcuts are processed locally; unrelated browsing and general keystroke histories are not stored. The extension does not request your name, email, passwords, payment details or location, or read account cookies or hidden puzzle answers.

## Storage and deletion

Preferences and annotations are stored in chrome.storage.local. These include annotations, Crossword candidate letters, category labels, observed attempts and retained records from older versions. Notes, marks, guesses and ordinary tool preferences are not synced.

Puzzle annotations are removed after 90 days without an update, during cleanup when the extension is used. Preferences remain until you change them or uninstall the extension. Done status remains until a newer puzzle replaces it or you select Clear history. Disabling a game does not delete its records. Uninstalling removes local extension storage.

Completion stats do not expire; local copies remain until deleted or the extension is uninstalled. Data & sync lets you export JSON, control automatic recording and synchronization, and clear history. Stats use displayed or manually entered times. The extension does not reconstruct historical results from your NYT account or distinguish assisted from unassisted solves.

### Chrome account synchronization

Stats sync is enabled by default. Stats are copied to chrome.storage.sync without age-based expiration. Chrome may synchronize them to the same extension on browsers signed into your account with extension synchronization enabled. Google’s privacy practices and Chrome settings govern this service. The extension does not receive your Google account identity, credentials or authentication tokens.

If sync is unavailable, results remain saved locally. The extension retries when used or restarted and provides a retry button, but cannot verify delivery to another device.

If sync storage is full, existing synced history is retained while new records and totals continue locally. The extension reports the storage limit. Other devices may have incomplete history or different averages until syncing resumes.

Turning sync off stops further reads and writes without deleting previously synced data. To erase synced history, enable sync and select Clear history. A synchronized reset timestamp prevents older copies from restoring deleted history. Records saved offline before a device learns of the reset are also discarded when it accepts the reset. Devices with sync disabled retain their copies until cleared or sync is re-enabled.

Exported files are managed by you and are not removed when extension history is cleared.

## Sharing and network requests

The publisher does not receive or inspect saved puzzle records or stats. The extension has no publisher-operated stats server, analytics, advertising, publisher account system or remote executable code. User data is not sold.

When Connections Daily difficulty is enabled, the extension requests the relevant public NYT Companion article using the game’s link or the archived puzzle’s date and number. Requests omit account credentials and referrers. Saved marks and guess history are not sent. Only the numeric rating and source metadata are cached temporarily in memory; article hints and solutions are not displayed or saved. You can disable this feature in Settings.

Wordle edits, Connections Submit groups, Sudoku Colored candidate mode changes and Crossword A–Z trials use the game’s native controls. Submit groups and Crossword trials begin only when you start them. Each group sent by Submit groups is an ordinary guess, recorded by the game as if you had submitted it yourself. The game website’s own requests and privacy practices apply separately.

Opening this policy on GitHub or following other external links is subject to those websites’ privacy practices.

## Permissions and on-page controls

The storage permission saves preferences, puzzle annotations and completion stats locally and supports stats sync. No additional API permissions are requested for stats.

Content scripts run only on supported NYT puzzle paths declared in the manifest. They read visible boards and result screens and add the extension’s tools. The extension does not request access to every website.

The tools run within the game page. Their controls do not create a separate security boundary; website scripts can observe page-level input events and board annotations.

## Limited use

Data from supported game pages is used only for the disclosed puzzle tools and personal stats, consistent with the Chrome Web Store User Data Policy and its Limited Use requirements. Data is not used for advertising, unrelated purposes, creditworthiness or lending decisions.