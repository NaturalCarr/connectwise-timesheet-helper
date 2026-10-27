# Agent protocol

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


Use JSON over stdin/stdout with node src/agent-cli.mjs. Run capabilities first; it is authoritative about implemented and live-verified actions. plan-day and plan-week validate without writes. Example records must remain exampleOnly: true.

Configure ticket-settings.json and extension/ticket-settings.json for your own environment. Use only actual supplied work facts. Search before creating, stop on ambiguity, duplicate-check exact date/start/end/notes, clear email recipients unless requested, and verify saved ticket/time rows before reporting success. Never use an API or session-data export as a substitute for visible-browser verification.

Commands:

```sh
node src/agent-cli.mjs capabilities
node src/agent-cli.mjs plan-day --input examples/daily.example.json
node src/agent-cli.mjs plan-week --input examples/hphs-week.example.json
node --test
```

See the schemas, README and timesheets.md for record preparation and recovery. Historical release tags contain extension files only.

## EoD inventory and purchase JSON

Daily records accept endOfDay.inventory and endOfDay.purchases. Weekly records accept endOfDays: an array of objects with date, optional subject, inventory and purchases. Each inventory row has item plus quantity (a nonnegative integer) and optional model, or a freeform count string. Repeated item names are grouped. Example:

```json
{
  "endOfDay": {
    "inventory": [
      {
        "item": "MacBooks",
        "quantity": 2,
        "model": "M1"
      },
      {
        "item": "MacBooks",
        "quantity": 1,
        "model": "M4"
      },
      {
        "item": "Chromebooks",
        "quantity": 3
      }
    ],
    "purchases": [
      {
        "item": "USB-C adapter",
        "quantity": 2,
        "url": "https://example.com/usb-c-adapter"
      }
    ]
  }
}
```

Mac models render as amount x model, for example 2 x M1, 1 x M4. Inventory is report metadata: it creates no ticket or time. Never invent quantities or inventory work time. The report editor can override these details locally per date. Purchase rows use item, positive integer quantity and HTTP(S) url; the entire Item × quantity label is linked.

EoD layout (0.9.10): inventory is rendered inside the ticket table. Each inventory row uses two merged cells spanning the four ticket columns. Recommended purchase links also remain within the same table. Clipboard and sample HTML use the shared renderer.

Version 0.9.11: Include Payroll Wrap in EoD is checked by default and remembered independently of drafts. Report previews and rich clipboard output include only verified Payroll Wrap time, including DITL intervals, deduplicated across runs. Lunch is excluded. Unchecking hides these rows without modifying saved time or ConnectWise.

Version 0.9.12 supersedes 0.9.11: Payroll Wrap is always excluded from EoD reports. There is no inclusion checkbox. Legacy inclusion preferences and payloads are ignored. Daily, weekly and historical reports omit Payroll Wrap intervals on all tickets, including lunch, and preserve actual work on mixed tickets. Timesheet records remain unchanged.

Version 0.9.13: Validate JSON enables Preview / copy EoD from JSON immediately. The runner offers the same action before and during submission. These reports use supplied work notes, planned titles and requested statuses, with no invented saved IDs or verification evidence. The dedicated report page labels the source as unverified JSON, supports per-date inventory/purchase and email edits, and never calls ConnectWise. DITL and Payroll Wrap remain excluded. Saved-record reports and combined history remain separate.

Version 0.9.14 supersedes the earlier DITL exclusion: DITL work entries belong in the EoD. Only Payroll Wrap entries (including lunch) are excluded, regardless of ticket. This applies to JSON previews, saved daily/weekly reports and combined historical reports. Timesheet entries are unchanged.

Version 0.9.15 updates the main extension screen. Ticket Owner stays visible. Open a Service Ticket and Daily/Weekly Timesheets & EoD are collapsible, with section state stored independently of work drafts. Use Ticket JSON Instead sits beside Find or Create Ticket and reveals import controls below; it never submits. The header can open the same interface in a full browser tab. Textareas retain compact JSON and growing notes behavior. Browser-save logic is unchanged.

Version 0.9.16: UI report labels now use Daily Report. Multi-Ticket (Timesheets and Reports) replaces the old batch section title. JSON endOfDay/endOfDays fields, module names and storage keys remain compatible. Report copy behavior and saved-record verification are unchanged.

Version 0.9.17: New-ticket summaries receive focus and selection checks immediately before browser typing, stable readback, and at most one retry of an editable unsaved summary. Creation and Save are never retried by this recovery. Titles longer than 100 characters are shortened before lookup and creation; imported T references are retained and the full requested title is preserved in the description. This also normalizes unsaved resumed plans. A stricter live field limit still stops safely. Diagnostics use the installed manifest version. Isolated browser tests cover transient resets, focus loss and maxlength guards; no production ticket was created during validation.

Version 0.9.18: the final creation duplicate guard reuses one verified exact match instead of stopping; multiple/invalid matches still stop, and reuse sends no New or Save. The normal runner then opens the resolved ID and checks ownership/time. Resume skips tickets whose final status and every entry were already confirmed in the same saved run; evidence is retained and no browser operations are sent for those tickets. Incomplete/uncertain entries still receive exact duplicate checks. Changed entry signatures invalidate the skip. This is not a fresh live audit of previously completed tickets.

## Document-camera reporting (0.9.19)

Daily JSON accepts endOfDay.docCams; weekly endOfDays objects accept docCams for the matching date. Example:

```json
{ "docCams": { "inUse": 12, "neededIn": ["211", "336"] } }
```

This metadata fragment is not a complete work record. inUse is the total confirmed working cameras onsite currently in use, a nonnegative whole number. neededIn lists room designations where a camera is needed. Either field may be omitted when unknown. A confirmed zero is valid; an explicit empty neededIn array means none. Unknown fields render Not recorded. Omit docCams, or use null, to leave out the row. These counts add no time.

The editor has DocCams (In Use) and DocCam needed In inputs beside inventory. Type rooms separated by commas. Clear removes the row and saves that local per-date override. Preview, rich clipboard, JSON-generated reports and saved reports all use two merged cells in the same bordered table: DocCams (In Use): 12 | DocCam needed In: 211, 336.

## Interface layout (0.9.20)

History & Resume has separate Saved runs, Verified time and Daily Reports tabs. Saved runs can be searched by date, title or ticket number and filtered by state. Six compact run cards appear per page; expand Tickets and progress for details. Resume/View results opens the original saved run. Verified time uses deduplicated saved-row evidence, with billing details and coverage shown separately. Daily Reports opens the newest available date first. Inventory, document cameras and purchase fields are collapsed until expanded.

Standalone pages share Workspace, History & Resume, and Settings navigation, consistent controls and responsive layouts. The popup keeps its compact/full-workspace behavior. These are presentation changes; saved records, user configuration, JSON contracts and browser-save safeguards remain in place.

## Report-date calendar (0.9.21)

Daily Reports open on the newest available report date, independent of the order reports were generated or loaded. Report date is now a calendar input instead of a dropdown on the JSON preview, run results, history and generated manual-report pages. The calendar spans available dates. If a selected date has no report, the old preview and editors are cleared and copy is disabled until a valid report date is chosen. Inventory and purchase edits stay tied to their report date.
