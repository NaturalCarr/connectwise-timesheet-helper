# Agent protocol

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
