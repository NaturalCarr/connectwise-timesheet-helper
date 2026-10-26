# ConnectWise Timesheet Helper

## Current behavior (0.9.18)

This section takes precedence over older release notes below.

- Configure Ticket Owner and ticket defaults inside the extension. CLI users can export their own settings JSON.
- Validate daily/weekly JSON in Multi-Ticket (Timesheets and Reports). Preview / copy EoD from JSON opens a Daily Report immediately, before submission completes. JSON names endOfDay/endOfDays remain compatible. Requested statuses aren't proof of saved records.
- DITL work is included. Payroll Wrap and lunch are always excluded, regardless of ticket. One bordered table contains ticket rows, two-column inventory rows and fully linked purchase labels.
- New-ticket titles are shortened to 100 characters before duplicate lookup and creation. Full titles stay in the description; imported T references are retained where applicable. Existing tickets aren't renamed. A stricter live field limit stops safely.
- Summary entry checks focus and stable readback and can retry an editable unsaved summary once. It never repeats New or Save as that recovery.
- The final creation guard reuses one verified existing match. Multiple or invalid matches still stop.
- Resume skips fully confirmed tickets from the same saved run without browser calls. Earlier evidence is retained; skipped tickets aren't freshly audited. Partial or uncertain time still gets exact duplicate checks, and missing/ambiguous previously verified rows aren't recreated.
- Reload an updated extension, select the intended ConnectWise tab, then Resume. Don't rerun the original full JSON after a partial save.
- Local/isolated-browser suite: 159 passed, 2 optional skipped. This isn't live production-save verification.

Agent guide for sharing: [docs/AGENTS.md](docs/AGENTS.md). It is also attached to the latest release.


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

## Interface layout (0.9.20)

History & Resume has separate Saved runs, Verified time and Daily Reports tabs. Saved runs can be searched by date, title or ticket number and filtered by state. Six compact run cards appear per page; expand Tickets and progress for details. Resume/View results opens the original saved run. Verified time uses deduplicated saved-row evidence, with billing details and coverage shown separately. Daily Reports opens the newest available date first. Inventory, document cameras and purchase fields are collapsed until expanded.

Standalone pages share Workspace, History & Resume, and Settings navigation, consistent controls and responsive layouts. The popup keeps its compact/full-workspace behavior. These are presentation changes; saved records, user configuration, JSON contracts and browser-save safeguards remain in place.
