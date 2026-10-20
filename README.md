# ConnectWise Timesheet Helper

A Chromium extension and model-independent JSON CLI for routine ConnectWise PSA tickets, time entries and end-of-day reports.

## Features

- Find or create tickets using exact numbers or title references.
- Record multiple time entries, with duplicate checks and saved-row verification.
- Run daily or weekly JSON records with a review before browser actions.
- Resume saved runs and combine verified work into editable, bordered EoD email tables.
- Review daily totals, use time-entry presets, and copy failure diagnostics.

The helper uses the signed-in visible browser UI. It does not include API credentials or send EoD email automatically. Browser behavior varies; read the actual saved-record results. CLI capabilities retain explicit live-verification limitations.

## Setup

1. Clone this repository. Node.js is required only for the CLI and tests.
2. Download the latest extension ZIP from [Releases](https://github.com/NaturalCarr/connectwise-timesheet-helper/releases/latest) and extract it, or use this checkout.
3. Open your Chromium browser's extensions page, enable Developer mode, and use Load unpacked on extension/.
4. Open Ticket defaults and configuration in the extension and save your exact ConnectWise labels. Enter your Ticket Owner display name at the top of the popup. CLI users can download ticket-settings.json from the settings page and pass it with --settings.
5. Validate and review real work records before running. Samples use exampleOnly: true and cannot be submitted as-is.

The default supported host is na.myconnectwise.net. Other hosts require deliberate manifest and navigation changes. Never commit browser profiles, login data, roster exports or actual timesheets. Local history contains work notes and stays in extension storage.

## CLI and tests

```sh
node src/agent-cli.mjs capabilities
node src/agent-cli.mjs plan-day --input examples/daily.example.json
node --test
```

Optional isolated browser fixtures require Playwright and a Brave installation; set CW_BROWSER_TEST=1 to enable them. They do not submit production work.

## Recovered releases

See [HISTORY.md](HISTORY.md). Historical tags v0.8.25 through v0.9.6 preserve available sanitized extension snapshots. Dates were reconstructed from archive metadata; they are not original commits. Current CLI/tests were added as a separate present-day commit. Some versions are unavailable.

## Asset provenance

The bundled Carlton animation preserves the vector frames supplied with the project; see extension/assets/carlton-source.md. No additional third-party asset license is asserted by this export.

## EoD inventory and purchases

The report editor includes inventory counts and recommended purchase links. Add item names, quantities and links beside the EoD copy controls; additions save locally by report date. The copied email includes a bordered inventory table and clickable Item name × quantity purchase labels. These fields do not update ConnectWise or send email.
