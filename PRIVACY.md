# NYT Games Swiss Knife privacy policy

Updated November 1, 2026.

NYT Games Swiss Knife is an independent browser extension for supported New York Times puzzles. It is not affiliated with or endorsed by The New York Times.

## What the extension uses

The extension processes visible puzzle words, letters, clues and feedback to provide its puzzle tools. It also handles your manual marks, category names, puzzle interactions, observed Connections guesses and feature preferences.

The supported puzzle's page path, identifier, date and saved-data timestamps associate your records with the correct puzzle. This does not include a history of unrelated browsing. Configured shortcuts are processed locally; general keystroke histories are not stored.

The extension does not request your name, email address, passwords, payment details or location. It does not read account cookies or hidden puzzle answers.

## Storage and deletion

Preferences and puzzle records are stored on your device using `chrome.storage.local`, without Chrome account synchronization. Records include manual annotations, category labels, observed attempt history and any retained records from older versions.

Puzzle records are removed during cleanup after 90 days without an update. Cleanup runs when the extension is used. General preferences remain until changed or the extension is uninstalled. Disabling a game does not delete its records. Uninstalling the extension removes its local extension storage.

Chrome requires **Allow in incognito** before the extension can run in private windows. Extension storage can be shared between normal and Incognito windows; closing an Incognito window does not necessarily delete its saved marks or preferences.

## Sharing and network requests

The extension does not upload saved puzzle records to its publisher. It has no extension analytics, advertising, account system, cloud synchronization or remote executable code. User data is not sold.

When Connections Daily difficulty is enabled, the extension requests the specific public NYT Companion article linked by the game. That request omits account credentials and the referrer. Only the numeric rating and source metadata are kept in a temporary memory cache; article hints and solutions are not displayed or saved. Saved marks and guess history are not sent with the request. You can disable this feature in Settings.

Your requested Wordle edits, Sudoku Auto Candidate changes and Crossword A–Z trials use the game's native controls. Crossword trials begin only when you start them and leave puzzle completion to the game's normal behavior. The game website's own requests and privacy practices are separate from this extension.

Opening this policy on GitHub or another external link is subject to that website's privacy practices.

## Permissions and on-page controls

The `storage` permission saves preferences and puzzle records locally. Content scripts run only on the supported NYT puzzle paths declared in the manifest. They read the visible board and place the requested tools; the extension does not request access to every website.

The tools run within the game page. Closed shadow roots reduce direct access to their controls, but do not create a separate security boundary. Website scripts can still observe page-level input events and board annotations.

## Limited use

Data obtained from supported game pages is used only to provide the extension's disclosed puzzle tools, consistent with the Chrome Web Store User Data Policy and its Limited Use requirements. The publisher does not receive or inspect your local puzzle records. Data is not used for advertising, unrelated purposes, creditworthiness or lending decisions.
