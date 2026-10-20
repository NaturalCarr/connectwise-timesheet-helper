# Daily tickets, time, and email

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
