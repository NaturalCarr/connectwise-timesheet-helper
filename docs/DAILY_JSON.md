# Daily tickets, time, and email

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


Paste or upload daily JSON in **Daily/ Weekly TimeSheets and EoD**. Click **Validate JSON**, then **Run validated tickets in ConnectWise**. The owner saved in the extension is used for browser runs.

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

Version 0.9.13: Validate JSON enables Preview / copy EoD from JSON immediately. The runner offers the same action before and during submission. These reports use supplied work notes, planned titles and requested statuses, with no invented saved IDs or verification evidence. The dedicated report page labels the source as unverified JSON, supports per-date inventory/purchase and email edits, and never calls ConnectWise. DITL and Payroll Wrap remain excluded. Saved-record reports and combined history remain separate.

Version 0.9.14 supersedes the earlier DITL exclusion: DITL work entries belong in the EoD. Only Payroll Wrap entries (including lunch) are excluded, regardless of ticket. This applies to JSON previews, saved daily/weekly reports and combined historical reports. Timesheet entries are unchanged.
