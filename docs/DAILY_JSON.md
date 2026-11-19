# Daily tickets, time, and email

## Current behavior (0.9.21)

This section takes precedence over older release notes below.

- Configure Ticket Owner and ticket defaults inside the extension. CLI users can export their own settings JSON.
- Validate daily/weekly JSON in Multi-Ticket (Timesheets and Reports). Preview / copy Daily Report from JSON opens a Daily Report immediately, before submission completes. JSON names endOfDay/endOfDays remain compatible. Requested statuses aren't proof of saved records.
- DITL work is included. Payroll Wrap and lunch are always excluded, regardless of ticket. One bordered table contains ticket rows, two-column inventory rows and fully linked purchase labels.
- New-ticket titles are shortened to 100 characters before duplicate lookup and creation. Full titles stay in the description; imported T references are retained where applicable. Existing tickets aren't renamed. A stricter live field limit stops safely.
- Summary entry checks focus and stable readback and can retry an editable unsaved summary once. It never repeats New or Save as that recovery.
- The final creation guard reuses one verified existing match. Multiple or invalid matches still stop.
- Resume skips fully confirmed tickets from the same saved run without browser calls. Earlier evidence is retained; skipped tickets aren't freshly audited. Partial or uncertain time still gets exact duplicate checks, and missing/ambiguous previously verified rows aren't recreated.
- Reload an updated extension, select the intended ConnectWise tab, then Resume. Don't rerun the original full JSON after a partial save.
- Daily Reports default to the newest available report date and use a calendar selector. Dates without reports clear the preview and disable copy. Edits remain tied to their report date.
- Local/isolated-browser suite: 162 passed, 2 optional skipped. This isn't live production-save verification.


Paste or upload daily JSON in **Multi-Ticket (Timesheets and Reports)**. Click **Validate JSON**, then **Save tickets & time + generate Daily Report updates**. The owner saved in the extension is used for browser runs.

Daily JSON uses `schemaVersion: "1.2"`, a `date` in `YYYY-MM-DD`, and `items`. Each item has `school`, `issue`, and one or more `timeEntries`. Every entry must have the daily date; overlapping time is rejected across tickets. Use `existingTicketId` for a known ConnectWise number, or `titleContains` for a literal imported reference. Omit both to search for an exact school/issue ticket and create one only if none exists. Ambiguous matches stop.

Each item may specify `finalStatus`, such as `Completed` or `Waiting Client Response`. Omission defaults to `Completed`. The runner verifies `Working Issue Now` before time, saves one entry at a time, and verifies the final status. Existing matching time is reused.

Optional `endOfDay.subject` sets the email subject; otherwise it uses the date. Each item can supply `endOfDayNotes` and `nextStep`. Without `endOfDayNotes`, actual time-entry notes are joined into the report. Without `nextStep`, entry `followUp` values are used; no next step renders as N/A. The helper does not invent work summaries or send email.

When every ticket succeeds, the runner displays the email table with **Copy email table** and **Download HTML**. The JSON result also contains `endOfDay` with the report HTML. A stopped run retains verified results but does not generate a complete email.

The non-submittable example is `examples/daily.example.json`; replace example content with actual work and remove `exampleOnly` only for a real record. Schema: `schemas/day.schema.json`.

Agent commands:

```powershell
node src/agent-cli.mjs plan-day --input examples/daily.example.json
node src/agent-cli.mjs run-day --input .local/day.json --extension-id <extension-id>
```

Daily batch saving and automatic end-of-day generation still require live ConnectWise verification. A plan or populated form is not a saved record.


Version 0.8.36 generates one EoD report for each represented date after a successful daily or weekly run. Weekly reports group time-entry notes and followUp strictly by date; report-date selection controls preview, copy, and download. Ticket statuses reflect the verified final status from the run, not inferred historical statuses. JSON execution output includes endOfDays; daily endOfDay remains compatible. Failed/unverified runs produce no complete report. Email is not sent.


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

Version 0.9.13: Validate JSON enables Preview / copy Daily Report from JSON immediately. The runner offers the same action before and during submission. These reports use supplied work notes, planned titles and requested statuses, with no invented saved IDs or verification evidence. The dedicated report page labels the source as unverified JSON, supports per-date inventory/purchase and email edits, and never calls ConnectWise. DITL and Payroll Wrap remain excluded. Saved-record reports and combined history remain separate.

Version 0.9.14 supersedes the earlier DITL exclusion: DITL work entries belong in the EoD. Only Payroll Wrap entries (including lunch) are excluded, regardless of ticket. This applies to JSON previews, saved daily/weekly reports and combined historical reports. Timesheet entries are unchanged.

## Document-camera reporting (0.9.19)

Daily JSON accepts endOfDay.docCams; weekly endOfDays objects accept docCams for the matching date. Example:

```json
{ "docCams": { "inUse": 12, "neededIn": ["211", "336"] } }
```

This metadata fragment is not a complete work record. inUse is the total confirmed working cameras onsite currently in use, a nonnegative whole number. neededIn lists room designations where a camera is needed. Either field may be omitted when unknown. A confirmed zero is valid; an explicit empty neededIn array means none. Unknown fields render Not recorded. Omit docCams, or use null, to leave out the row. These counts add no time.

The editor has DocCams (In Use) and DocCam needed In inputs beside inventory. Type rooms separated by commas. Clear removes the row and saves that local per-date override. Preview, rich clipboard, JSON-generated reports and saved reports all use two merged cells in the same bordered table: DocCams (In Use): 12 | DocCam needed In: 211, 336.

## Purchase reasons (0.9.23)

Recommended purchases accept an optional `reason` string beside item, quantity and url. The editor has a Reason field; previews and rich clipboard reports show a linked Item × quantity label with the reason in the next cell. Reasons stay tied to the report date and are preserved in daily/weekly JSON, saved reports and history. Existing inputs without a reason still work. Example: `{"item":"HDMI cable","quantity":2,"url":"https://example.com/hdmi","reason":"Document-camera setup and replacement stock"}`.

## Arrival and departure (0.9.24)

Daily JSON accepts optional `endOfDay.arrivalTime` and `endOfDay.departureTime` in 24-hour HH:MM format. Weekly JSON accepts the same fields in each dated `endOfDays` record. Example: `{"arrivalTime":"08:00","departureTime":"16:30"}`. These are actual onsite times supplied by the user, not inferred from time entries. They add no records and do not change hours or billing. The Daily Report includes a table row labeled Arrival time and departure time in the Ticket column, with the actual times in the adjoining merged cell. Report editors save and clear these fields independently for each report date; manual report entry has the same inputs. Omit a time when it is unknown. Existing JSON remains compatible.

## Multiple weeks in one JSON (0.9.26)

Weekly-format JSON can include an optional inclusive `weekEnd` date to cover multiple weeks in one validated batch. Example: `{"schemaVersion":"1.1","weekStart":"2026-11-02","weekEnd":"2026-11-12","items":[...]}`. weekStart remains a Monday. Without weekEnd, the range remains the original Monday-Sunday week. Entries and dated endOfDays metadata must fall inside the selected range; duplicate checks, overlap rejection, per-day reports and resume evidence still apply. Only include actual requested work or leave dates; a date range does not generate entries for missing days.

## Multi-Day JSON (0.9.26)

Multi-Day JSON replaces the Weekly JSON label in the workspace and example download. Use `schemaVersion: "1.1"`, `startDate`, `endDate`, and `items` for any inclusive date range, including a non-Monday start or multiple weeks. Example range: `"startDate":"2026-10-29", "endDate":"2026-11-12"`. Both dates are required for this format; do not mix them with legacy weekStart/weekEnd. Dated endOfDays metadata must be inside the range. Only supplied time entries are created; missing dates add no work. Existing weekly files remain accepted with their original Monday/Sunday defaults. CLI aliases `plan-multi-day` and `run-multi-day` use the same model-independent planner and browser safeguards. Current samples: examples/multi-day.example.json and extension/MULTI-DAY-EXAMPLE.json. Daily schema 1.2 still works.

Daily and Multi-Day ticket items accept omitFromEod: true. This keeps all ticket/time work but excludes the ticket from planned and saved Daily Reports (helper 0.13.3+). Escalate / Awaiting lead and Scheduling Required are supported finalStatus values.
