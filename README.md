# ConnectWise Timesheet Helper

A browser extension for ConnectWise tickets, timesheets, and Daily Reports. Uses your signed-in browser; no ConnectWise API access is required.

## Features

- **Tickets and time:** find tickets by CW number or title text, create missing tickets, add multiple time entries, and set the final status.
- **Daily and Multi-Day runs:** validate agent-generated JSON, review the tickets, and process any date range.
- **Daily Reports:** preview before the run finishes and copy a bordered table into Outlook. Include inventory, document-camera findings, purchase recommendations with reasons, and arrival/departure times. Lunch and Payroll Wrap stay out of the report.
- **History and Resume:** continue stopped runs without repeating confirmed work.
- **IIQ Rake:** read Incident IQ statuses and apply selected changes to your assigned CW tickets. Pending Closure, Completed, and Closed are ignored. Replace browser tabs and continue without a full rescan.
- **Personal settings:** keep your Ticket Owner and ticket defaults locally. Shared examples use fictional settings.

The helper checks for duplicates and verifies saved records. Ambiguous matches or unverified saves stop for review.

## Install

1. Download the ZIP from [Releases](https://github.com/NaturalCarr/connectwise-timesheet-helper/releases/latest) and extract it to a permanent folder.
2. Open `brave://extensions`, enable Developer mode, and choose **Load unpacked**. Select the folder containing `manifest.json`.
3. Open the helper's Settings and enter your Ticket Owner and ConnectWise defaults.
4. Sign in to ConnectWise and select the intended tab in the helper.

For updates, replace the files in the same folder, click **Reload** on the Extensions page, and reopen the helper. Keeping the folder preserves its identity and local settings.

## Use it

**One ticket:** enter a CW number, title text, or new issue. Add time entries, choose the status, and select **Find or Create Ticket**.

**A day or several days:** open **Multi-Ticket (Timesheets and Reports)**, load JSON, validate it, and review the preview before running. Download examples inside the helper. You can preview and copy the Daily Report before submitting work.

**IIQ Rake:** select signed-in IIQ and CW tabs. Use a CW Service Board with top filters set to **View All**, enter your Resources pattern (for example, `*your-login*`), and scan. Review before applying. IIQ is read-only; rake doesn't create tickets or time.

After a stop, use **Resume** or **Continue selected changes to CW**. Don't rerun the original full JSON after a partial save. Clipboard icons copy diagnostics, including the active step.

## School acronyms

In **Settings → School acronyms**, add an acronym, its exact CW Company, and its exact CW Site. Add, edit, or remove rows, then **Save configuration**. No client schools are built in. Mappings stay in your browser profile and are included when you download CLI settings JSON.

Validating ticket, Daily or Multi-Day JSON automatically adds explicit school/site pairs to Settings under your configured Company. Missing Site names are never guessed; conflicting mappings stop for review. Example files do not add schools.

Matching is case-insensitive and scoped by Company. An unknown acronym keeps your configured default Site. Revalidate new work after changing mappings; saved run plans keep their original Sites. ConnectWise fills in the address after Site selection.

## Guides

- [Agent guide for preparing JSON](docs/AGENTS.md)
- [Daily JSON reference](docs/DAILY_JSON.md)
- [Agent protocol and CLI commands](docs/AGENT_PROTOCOL.md)
- [Development notes and version history](CHANGELOG.md)
- [Git commit history](https://github.com/NaturalCarr/connectwise-timesheet-helper/commits/)

JSON is model independent. The CLI plans and validates; run `node src/agent-cli.mjs capabilities` for its current contract. Browser execution happens through the extension. Keep real settings, credentials, browser profiles, and captured pages out of Git.

## Contributors

- **Natural Carr** — project owner, workflow design, and live testing.
- **OpenAI Codex** — AI assistance with development, debugging, automated tests, and documentation.
