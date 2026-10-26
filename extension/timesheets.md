# Timesheets: agent instructions

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


Use this guide to turn the user's account of a workday into JSON for ConnectWise Timesheet Helper. It is model independent. Generate and validate the JSON; submit only when the user asks you to run it.

## Collect and confirm the day

- Establish the calendar date in America/New_York. Resolve yesterday to an explicit date.
- Collect the actual issues, people, actions, outcomes, ticket references, workday span, lunch, other breaks, and known times/durations.
- Keep confirmed facts separate from estimates. Ask about missing timing. If the user approves estimated allocations, show a timed schedule for review before making runnable JSON. Keep that approval and the estimates in accompanying notes; do not add unsupported JSON fields.
- Do not invent work, troubleshooting, test results, root causes, or account details. Do not add hours solely to hit a target.
- Count overlapping work once. For concurrent device setup, use shared work blocks instead of summing every device's elapsed setup time.
- Preserve actual start/end times when known. Check total work, lunch, and other breaks separately. Do not count gaps automatically as work.
- Write concise professional notes in the user's voice: concrete actions and outcomes, normal wording, no inflated claims. Correct spelling; preserve people's names as supplied. Use the humanizer/naturalsounding skill if available.

## Lunch preference

Lunch is an additional time entry on one of that day's existing work tickets. Do not create a separate lunch ticket unless explicitly requested.

Use workType Payroll Wrap, notes Lunch break., billable AUTO, and the actual lunch interval. It must not overlap any other entry, including other entries on that same ticket. Attaching it to a work ticket is a timekeeping convenience: do not describe lunch as work on that issue. Keep Daily Report work notes focused on the work, using endOfDayNotes when needed.

## Ticket references and creation

- An imported reference such as T-90442 belongs in titleContains as a string. It is not a ConnectWise numeric ticket ID.
- A confirmed ConnectWise ID belongs in existingTicketId as an integer.
- Both may be supplied. The numeric ID wins. A confirmed missing ID can fall back to title text; permission/loading/verification failures must stop, not trigger creation.
- Title text searches the Summary/title field only, with Company, Site, Location, and all other grid filters cleared. The helper prefers open matches. If none are open, it considers closed matches to avoid duplicate tickets. One match is reused; multiple matches stop for a choice.
- With no match, the current helper can create a ticket after repeat duplicate checks. For title references, it retains the reference in the new title.
- With neither reference, use issue and optional school. The helper searches the exact title before creation.
- school is optional. If supplied, it prefixes the new title as ACRONYM - issue. Do not infer a school from the weekday or confuse similar acronyms.
- ConnectWise Company and Site remain Example Public Schools. Do not substitute a school name or Google organization into Site.
- Owner is configured in the extension, not in each JSON item. First-run setup is required. Existing owners are changed through the Owner dropdown; Assign Me can add the signed-in resource when needed. The helper verifies ownership before entering time.

## Daily JSON

Top level:

- schemaVersion: 1.2
- exampleOnly: true for any demonstration/template. Use false only for an actual approved record.
- timeZone: America/New_York
- date: YYYY-MM-DD
- endOfDay.subject: optional email subject
- items: one item per ticket, with all its time entries grouped together

Item fields:

- recordId: optional stable source identifier; do not reuse across different records
- issue: factual issue/title; needed for a new ticket, optional for a referenced ticket
- school: optional acronym
- description: optional factual initial description
- existingTicketId: optional integer
- titleContains: optional literal title substring, without * or ? wildcards
- finalStatus: selected supported status (the planner defaults to Completed if omitted, so specify it explicitly)
- endOfDayNotes: optional user-supplied or fact-preserving work summary for the daily Daily Report
- nextStep: optional actual follow-up; do not invent one
- timeEntries: one or more entries, each containing date, start, end, notes, workType, workRole, billable

Use 24-hour HH:mm times. Every daily entry must have the top-level date. End must be after start on the same date; split overnight work at midnight into appropriate daily records. Do not submit overlapping entries. Do not duplicate a ticket as separate items; put its entries in one array.

Use billable AUTO so ConnectWise sets billing from Work Type. The helper validates the automatic value instead of overriding it. The usual role is Onsite Engineer; confirm deviations. There is no ticket ID for a newly created ticket until ConnectWise saves it.

### Example only: work and lunch on one ticket

The following times and reference are demonstration data, not a real work record:

```json
{
  "schemaVersion": "1.2",
  "exampleOnly": true,
  "timeZone": "America/New_York",
  "date": "2026-10-15",
  "endOfDay": { "subject": "Example daily report" },
  "items": [
    {
      "recordId": "example-printing",
      "issue": "Example printing issue",
      "titleContains": "EXAMPLE-123",
      "finalStatus": "Completed",
      "endOfDayNotes": "Replace with the actual work performed and confirmed outcome.",
      "timeEntries": [
        {
          "date": "2026-10-15", "start": "09:00", "end": "09:30",
          "notes": "Replace with actual work notes.",
          "workType": "Onsite Support", "workRole": "Onsite Engineer", "billable": "AUTO"
        },
        {
          "date": "2026-10-15", "start": "13:00", "end": "13:30",
          "notes": "Lunch break.",
          "workType": "Payroll Wrap", "workRole": "Onsite Engineer", "billable": "AUTO"
        }
      ]
    }
  ]
}
```

## Weekly JSON

Use schemaVersion 1.1 and weekStart set to that week's Monday instead of daily date. Keep timeZone and items. Each entry has its own date within Monday through Sunday. Group the same ticket across days in one item's timeEntries. Include each item's finalStatus explicitly.

Weekly EoDs group entry notes and followUp by date. Do not rely on item-level endOfDayNotes/nextStep for weekly reports; those overrides are currently handled by daily planning. Use entry notes/followUp to keep weekly information specific to its day.

Download the packaged Daily JSON and Weekly JSON examples from Download Sample JSON in the extension. They are example-only and cannot be submitted unchanged.

## Work Type options

Admin; Client Meeting; Communications; Holiday; Onsite Payroll Wrap; Onsite Support; Paid Time Off (Or Sick and Vacation); Payroll Wrap; Remote Support; Sales; Staff Meeting; Training; Travel; Procurement.

Onsite [DO NOT USE] is displayed but disabled in the GUI. Do not select it. Copy Work Type labels exactly, without ConnectWise's leading dollar-sign decoration.

## Ticket final statuses

Scheduled Remote; Scheduled Onsite; Working Issue Now; Scheduling Required; Waiting Parts/Repair; Waiting Client Response; Waiting on 3rd Party; Waiting for next onsite visit; Pending Closure; Completed; Closed; Closed/Client Unresponsive.

Choose the status supported by the user's account of the work. Work Type and ticket status are different: Payroll Wrap is a Work Type, not a ticket status.

The runner verifies Working Issue Now before saving time, saves each entry separately, and applies/verifies the final status after all entries on that ticket.

## Validate and hand over

In the project directory:

```powershell
node src/agent-cli.mjs plan-day --input .local/day.json
node src/agent-cli.mjs plan-week --input .local/week.json
node src/agent-cli.mjs capabilities
```

The plan commands validate without writing to ConnectWise. Keep real work records in ignored .local, not examples or Git. Do not copy browser profiles, sessions, credentials, or private directory exports. The extension GUI needs no Node.js.

For the user: paste/upload JSON in Daily/ Weekly TimeSheets and Daily Report, click Validate JSON, review the green/red result, then Save tickets & time + generate Daily Report updates. Do not describe validation or a populated form as submitted.

For authorized agent execution, run-day/run-week use the same JSON with --extension-id and optionally --tab-id. Read capabilities before relying on unattended execution; browserSubmission is still false. No ConnectWise API or model-specific integration is used.

## Daily Report output

A successful daily/weekly run generates a formatted Ticket / Status / Notes / Next Step table for each represented date. Select the report date and click Copy Daily Report to Clipboard, then paste into an email body. The helper does not send email. Status is the final verified status from the run, not an inferred historical daily status.

A stopped run does not generate a complete Daily Report. A continuation JSON produces an Daily Report only for the records it contains; it does not automatically merge earlier runs. Maintain a cumulative list of verified results, then combine their actual ticket IDs and approved notes into a full-day report without resubmitting time or using Daily Report - Manual Entry merely to regenerate already-completed statuses.

## Continue a stopped run safely

Read the actual runner result. For each item, distinguish saved_verified/existing_verified time and completed_verified/status_changed_verified tickets from pending/stopped records. An empty entries array means that run did not reach time entry for that ticket; it does not prove there was no older time on the ticket.

When the user requests a continuation JSON, exclude fully verified tickets. Retain an observed ticketId as existingTicketId for the stopped ticket. If a ticket has partly saved time, omit its already verified entries and retain only the remaining entries for that ticket. Never shift an existing entry's date/start/end/notes just to make a retry pass; doing so can defeat duplicate matching.

Keep dates and notes unchanged for entries being retried. A Save may have succeeded even if verification stopped; inspect or recheck the exact saved row before another Save. Do not automatically retry a save based only on an error message. Do not remove another person's time, resource, or record.

For multiple matches, unverifiable status, missing owner selection, or a page/permission failure, stop and preserve the results. Report what actually saved, what remains, and the exact error. When providing JSON in chat, use one complete copyable JSON block with no comments or trailing commas.


### Saved runs, presets and Daily Report (0.9.0)
Use the helper's history/Resume for a stopped run rather than regenerating already saved entries. Resume pins observed ConnectWise IDs and duplicate-checks exact saved records. The combined Daily Report uses locally retained verified runs; do not submit duplicate time to populate a report. AUTO billing is unknown until ConnectWise readback confirms it. Morning huddle is explicitly billable; its built-in preset uses Onsite Support with billable B. Presets never supply dates or times. Email-only edits affect the copied report, not ticket records. DITL work is included in Daily Report; Payroll Wrap and lunch remain excluded.

Use concise professional wording for ticket titles, descriptions, time-entry notes and Daily Report notes. Preserve the user's actual work, outcomes, times and pending follow-ups; do not add unsupported verification or claim a planned email was sent.


Version 0.9.14 supersedes the earlier DITL exclusion: DITL work entries belong in the Daily Report. Only Payroll Wrap entries (including lunch) are excluded, regardless of ticket. This applies to JSON previews, saved daily/weekly reports and combined historical reports. Timesheet entries are unchanged.

## Document-camera reporting (0.9.19)

Daily JSON accepts endOfDay.docCams; weekly endOfDays objects accept docCams for the matching date. Example:

```json
{ "docCams": { "inUse": 12, "neededIn": ["211", "336"] } }
```

This metadata fragment is not a complete work record. inUse is the total confirmed working cameras onsite currently in use, a nonnegative whole number. neededIn lists room designations where a camera is needed. Either field may be omitted when unknown. A confirmed zero is valid; an explicit empty neededIn array means none. Unknown fields render Not recorded. Omit docCams, or use null, to leave out the row. These counts add no time.

The editor has DocCams (In Use) and DocCam needed In inputs beside inventory. Type rooms separated by commas. Clear removes the row and saves that local per-date override. Preview, rich clipboard, JSON-generated reports and saved reports all use two merged cells in the same bordered table: DocCams (In Use): 12 | DocCam needed In: 211, 336.
