# Security

The extension requests only `storage` and runs content scripts on supported NYT puzzle paths. It has no background service, remote executable code, account system, telemetry, cookies permission or all-sites permission.

All game adapters use rendered boards and visible feedback. User text is rendered as text, never evaluated or inserted as HTML. Saved records are bounded; old puzzle records are pruned after 90 days without an update.

The optional public difficulty reader validates the linked NYT Companion URL, omits credentials and referrers, rejects redirects, limits response size and time, and retains only the numeric rating and source metadata.

Closed shadow roots reduce direct access to controls but share the page's security boundary. A website can observe page-level input, change visible puzzle data or remove the tools. Extension storage can be shared with Incognito and concurrent tabs use the last saved record.

Release workflows run static, unit and browser checks and build from an explicit runtime allowlist. Source, tests, credentials and store graphics are excluded from the extension ZIP. GitHub Actions are pinned to commit IDs.

See [the privacy policy](PRIVACY.md) for data handling and [repository issues](https://github.com/SHexagon-0x6/NYT-Swiss-Knife/issues) for compatibility reports. Do not post passwords or confidential information in issues.
