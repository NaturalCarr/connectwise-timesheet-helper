# Voice tool to ConnectWise: weekly JSON contract

Use this format when a separate voice tool prepares a week of actual work for an agent to enter in ConnectWise. The complete example is [`../examples/hphs-week.example.json`](../examples/hphs-week.example.json); the machine-readable contract is [`../schemas/week.schema.json`](../schemas/week.schema.json).

The voice tool is responsible for recording the real issue, work, date, start/end times, and final text. The ConnectWise agent must validate those facts and submit them through the signed-in Brave UI. A school schedule, user directory, or example file is never evidence that work occurred. Do not copy the example's invented projector work into a real week.

## File shape

```json
{
  "schemaVersion": "1.1",
  "exampleOnly": false,
  "timeZone": "America/New_York",
  "weekStart": "2026-10-05",
  "items": [
    {
      "recordId": "stable-issue-id",
      "school": "SCHE",
      "issue": "Short issue title",
      "description": "Initial ticket description based on the actual report",
      "timeEntries": [
        {
          "recordId": "stable-time-id",
          "date": "2026-10-06",
          "start": "09:00",
          "end": "09:25",
          "notes": "Exact text to enter in the time entry.",
          "workType": "Onsite Support",
          "workRole": "Onsite Engineer",
          "billable": "B"
        }
      ]
    }
  ]
}
```

One `item` represents **one issue and one ticket**. Put every time entry for that issue under the same item, even when work continues on another day. Put a different issue in a separate item. The planner creates one ordered step per time entry and rejects overlapping time intervals.

## Top-level fields

| Field | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | Recommended | Use `"1.1"` for files produced by the voice tool. Older files without it remain accepted. |
| `exampleOnly` | Recommended | Set `true` in examples, `false` in real work records. A submission runner must refuse `true`. |
| `timeZone` | Recommended | Use `"America/New_York"`. Dates and times are local wall time, with no UTC conversion. |
| `weekStart` | Yes | Monday in `YYYY-MM-DD`; entries may fall Monday through Sunday of that week. |
| `items` | Yes | Nonempty array of issue/ticket objects. Order is the intended submission order. |

## Issue/ticket fields

| Field | Required | Meaning |
| --- | --- | --- |
| `recordId` | Recommended | Stable, unique ID created by the voice tool. Reuse the same ID when correcting a record; never assign it to a different issue. Helps resumption and audit. |
| `school` | Yes | School acronym, such as `SCHE`. The planner builds the ConnectWise Summary as `SCHE - <issue>`. |
| `issue` | Yes | Short description of one problem or task. Do not include the acronym again. |
| `description` | Recommended | Exact text for the ticket's Initial Description. If absent, the planner uses the Summary. |
| `existingTicketId` | Optional | Use only for a ticket ConnectWise has already assigned a number. Omit it for a new ticket; the browser runner searches first, creates if needed, then reads ConnectWise's assigned number. |
| `site` | Usually omit | If included, it must be `Example Public Schools`. It is the same ConnectWise Site for every school. |
| `context` | Optional | Grounding details from the voice record or school directory. These fields do not become ConnectWise Contact or Site automatically. |
| `sourceRecordIds` | Optional | IDs of voice recordings, transcripts, or other source records. Keep the underlying files local and private. |
| `timeEntries` | Yes | At least one time entry for this issue. |

`context` may contain `building`, `room`, `asset`, and `people`. Each person has a `name`, optional `email`, and `role` of `reportedBy`, `affected`, or `assisted`. Include only people relevant to the issue. The Google roster can help verify a name or school association, but it does not select a ConnectWise Contact. The configured ticket Contact remains `Example Contact` unless the workflow is deliberately changed.

Ticket Company, Site, Board, Status, Type, Subtype, Owner, Priority, Agreement, Contact, and Source come from [`../ticket-settings.json`](../ticket-settings.json). The voice tool should not invent alternate values. The acronym belongs in the title; it does not change the Site dropdown.

## Time-entry fields

| Field | Required | Meaning |
| --- | --- | --- |
| `recordId` | Recommended | Stable ID unique across the entire file; identifies this individual time entry for retries. |
| `date` | Yes | `YYYY-MM-DD`, within the declared week. |
| `start`, `end` | Yes | Local 24-hour `HH:mm`. `end` must be after `start` on the same date. Split overnight work into separate dated entries. |
| `notes` | Yes | Final, accurate text to paste into ConnectWise Notes. Include the work actually performed and result. Preserve meaningful line breaks. |
| `workType` | Yes | Exact ConnectWise choice, for example `Onsite Support`. |
| `workRole` | Yes | Exact ConnectWise choice, for example `Onsite Engineer`. |
| `billable` | Yes | `B` = Billable, `NB` = Do Not Bill, `NC` = No Charge. Use the correct choice for the actual work. |
| `location`, `businessUnit`, `agreement` | Optional | Exact ConnectWise choices when the prefilled form differs or must be checked. They are not school location fields. |
| `ticketStatus` | Optional | If supplied, must be `Working Issue Now`. The tool saves time before changing the ticket to `Completed`. |
| `addNoteTo` | Optional | `Discussion`, `Internal`, or `Resolution`; defaults to `Discussion`. |
| `workFacts`, `outcome`, `followUp` | Optional | Structured grounding details. `notes` is still the final text to submit; these fields do not create additional time entries or notes. |
| `sourceRecordIds` | Optional | References to the voice records supporting this specific interval. |

The planner calculates decimal hours from `start` and `end`. Do not include a manually estimated hours field. One time entry is saved and verified before the next begins. The ticket lifecycle is: find/create or reopen it, set and verify `Working Issue Now`, save and verify every time entry, then set and verify `Completed`. The tool clears Contact, Resources, and Cc email recipients unless you explicitly authorize an email workflow; the JSON format has no email-send field.

## Voice tool rules

1. Extract one issue per `item` and the actual time intervals under its `timeEntries`. Do not assign a school merely from the weekday schedule.
2. Keep `recordId` values stable across corrections. Give each entry a different ID. Keep source IDs where available so a disputed entry can be traced back.
3. Resolve uncertain names against the local 183-user service roster, but do not guess between duplicate names. An email address can disambiguate a person. Put school acronym in `school`; keep building/room/person details in `context` or factual notes.
4. Write `issue`, `description`, and `notes` as final text from the reported facts. If the recording lacks an issue, time, or work detail, leave the record out and flag it for correction; do not fabricate it.
5. Do not put credentials, recordings, raw transcripts, or browser session data in this JSON. Keep source files in ignored `.local/` if retained. Avoid unnecessary student or personal details in ticket text.
6. Set `exampleOnly` to `false` only for a real work record. The agent must still check ConnectWise for existing tickets and time entries before saving.

## Validation and current execution boundary

```powershell
node src/agent-cli.mjs plan-week --input examples/hphs-week.example.json
```

This returns a JSON plan with ticket actions and one time action per entry. It checks dates, intervals, overlap, repeated ticket keys, and duplicate record IDs. `exampleOnly: true` remains in the plan so a future submission runner can refuse it. The current CLI is a planner; it does not save to ConnectWise. Browser ticket creation, full form selection, automatic Save, duplicate lookup against ConnectWise, and saved-record verification are still to be implemented. `node src/agent-cli.mjs capabilities` reports this boundary.
