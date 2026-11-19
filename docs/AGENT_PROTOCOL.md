# Agent protocol

## Report exclusions (0.13.3)

Daily/Multi-Day items accept boolean omitFromEod. True keeps ticket execution and time records intact, excluding the ticket only from planned and saved Daily Reports. Missing means included. Release validation: 249 passed, 2 optional skipped; no live saves.

## Run tab replacement (0.13.2)

Daily/Multi-Day run pages expose a ConnectWise tab picker and Refresh tabs above Resume. A replacement selection is stored with the saved run without clearing evidence or changing its plan. Resume validates the selected live CW tab before browser actions; controls are locked during execution. Closed tab IDs in navigation can fall back to a valid saved tab or the sole CW tab; ambiguous choices still stop. A closed execution target is never replaced mid-action. Local checks do not establish live saves.

## Status support (0.13.1)

Daily/Multi-Day JSON, status selectors and the browser save guard accept `Escalate / Awaiting lead`. `Scheduling Required` remains supported. For IIQ On Hold work, choose Scheduling Required when arranging a visit or Escalate / Awaiting lead when waiting for escalation/direction; do not submit On Hold as a CW status. This update has local validation coverage; no live status save is implied.



## Current behavior (0.13.0)

This section takes precedence over older release notes below.

- IIQ Rake starts with current open CW tickets filtered by Resources (for Natural: `*your-login*`). Choose all or newest open tickets, then preview IIQ-to-CW status changes. Pending Closure/Completed/Closed CW records are excluded; historical run records no longer define the backlog.

- Settings manages schoolMappings as an array of {acronym, company, site}. There are no built-in schools. Company scopes each mapping; unknown acronyms retain the configured default. Existing plans are unchanged.

- Configure Ticket Owner and ticket defaults inside the extension. CLI users can export their own settings JSON.
- Validate daily/weekly JSON in Multi-Ticket (Timesheets and Reports). Preview / copy Daily Report from JSON opens a Daily Report immediately, before submission completes. JSON names endOfDay/endOfDays remain compatible. Requested statuses aren't proof of saved records.
- DITL work is included. Payroll Wrap and lunch are always excluded, regardless of ticket. One bordered table contains ticket rows, two-column inventory rows and fully linked purchase labels.
- New-ticket titles are shortened to 100 characters before duplicate lookup and creation. Full titles stay in the description; imported T references are retained where applicable. Existing tickets aren't renamed. A stricter live field limit stops safely.
- Summary entry checks focus and stable readback and can retry an editable unsaved summary once. It never repeats New or Save as that recovery.
- The final creation guard reuses one verified existing match. Multiple or invalid matches still stop.
- Resume skips fully confirmed tickets from the same saved run without browser calls. Earlier evidence is retained; skipped tickets aren't freshly audited. Partial or uncertain time still gets exact duplicate checks, and missing/ambiguous previously verified rows aren't recreated.
- Reload an updated extension, select the intended ConnectWise tab, then Resume. Don't rerun the original full JSON after a partial save.
- Daily Reports default to the newest available report date and use a calendar selector. Dates without reports clear the preview and disable copy. Edits remain tied to their report date.
- Latest full suite before the Pending Closure addition: 244 passed, 2 optional skipped. The Pending Closure model checks also passed. See release validation below for the publication checks.


The CLI uses JSON over stdout. It writes no ConnectWise data. It needs Node.js and has no package dependencies.

## Commands

```powershell
node src/agent-cli.mjs capabilities
node src/agent-cli.mjs inspect-users --input .local/users.csv
node src/agent-cli.mjs build-roster --input .local/users.csv --output .local/service-roster.json
node src/agent-cli.mjs lookup-user --roster .local/service-roster.json --query "Full Name or email"
node src/agent-cli.mjs plan --input work-item.example.json
node src/agent-cli.mjs plan-ticket --input .local/ticket.json
node src/agent-cli.mjs plan-week --input week.json
node src/agent-cli.mjs run-ticket --input .local/ticket.json --extension-id <Brave extension ID>
node src/agent-cli.mjs run-week --input .local/week.json --extension-id <Brave extension ID>
Get-Content work-item.example.json -Raw | node src/agent-cli.mjs plan --input -
```

Use `--settings <path>` to select a different ticket defaults file. `ticket-settings.json` is the default. The ticket-only, single-item, and weekly contracts are in `schemas/ticket.schema.json`, `schemas/work-item.schema.json`, and `schemas/week.schema.json`.

The daily ticket JSON starts with `{"schemaVersion":"1.0","school":"DPEHS","issue":"Actual issue","description":"Known details"}`. `existingTicketId` is optional. Omit it for a new ticket; the browser searches first and reads the number assigned by ConnectWise after Save. `exampleOnly: true` is refused by `run-ticket`. The optional `timeEntry` uses the same required `date`, `start`, `end`, `notes`, `workType`, `workRole`, and `billable` fields as a weekly entry. It accepts at most one entry; `timeEntries` and unknown fields are rejected. With a time entry, `completeAfterTime` defaults to `true`; set it to `false` to leave the ticket at `Working Issue Now`. Without a time entry, the ticket remains working. `plan-ticket` validates without browser writes. `run-ticket` uses the signed-in Brave UI, verifies the saved ticket and owner, checks for duplicate time, saves and verifies one time row, and then optionally completes the ticket. The same flow is available in the extension popup with text fields or pasted/uploaded JSON. Neither path depends on a particular AI model. See `examples/ticket-only.example.json` and `examples/ticket-with-time.example.json`; both are intentionally non-submittable.

For voice-generated weekly records, follow `docs/VOICE_WORK_JSON.md`. `examples/hphs-week.example.json` demonstrates an HPHS issue with two separate time entries; it is explicitly example-only. A future submission runner must refuse any file with `exampleOnly: true`.

Successful output is one JSON object with `protocolVersion`, `ok: true`, and `capabilities`, `plan`, a roster result, or `execution`. Failed input returns one JSON object with `ok: false` and `error`, and exits with code 2. A browser run that stops returns `execution.ok: false` and exits with code 3. Treat `browserSubmission: false` as a hard boundary. A plan is not a ConnectWise record.

One work item describes one ticket and at most one time entry. `existingTicketId` is optional and selects a ticket only when its number is already known. Without it, `find-or-create-ticket` means search the browser first, then create only if no exact match exists. ConnectWise assigns the number when the ticket is saved; the runner reads and uses that saved number for subsequent time entries. All tickets use the configured Democracy Prep Company and Site values. `school` is the acronym placed at the start of the ticket summary. The Site is company-wide and does not change by school. An item normally omits `site`; if supplied, it must equal the fixed value.

When `existingTicketId` is explicitly supplied, version 0.8.19 treats that number as the full lookup authority. Daily and weekly runners skip company, Site, and Summary matching for opening that ticket and verify its exact displayed number instead. The Service Board lookup clears other list filters and searches the Ticket number field only. Failure to find that number stops the run; it never creates a replacement ticket. Existing title, company, and Site fields are not rewritten by this lookup. Owner/status/time operations continue on the verified ID, with the same duplicate time checks. When no ID is supplied, company/site/title matching remains required to find or create a ticket.

`inspect-users` reads a local Google Admin Users list CSV without modifying it. It reports column names and distinct organization unit, department, building, location, title, floor, and address values with counts. It does not select the explicit name, email, or phone columns; freeform values can still contain personal details. Keep the raw export and verified mapping in ignored `.local/`. The user's records are under Google Workspace Directory, so a personal Google Contacts export is not the source for this project. `inspect-contacts` remains available for personal Contacts CSVs if needed.

`build-roster` projects a Google Admin Users CSV into a minimal JSON lookup in `.local/`. It carries name, email, organization unit, acronym, organization, title, department, and status; it never carries password, recovery, phone, or storage columns. It refuses output outside this project's `.local/` and refuses to overwrite an existing file. The current roster has 183 users, 182 assigned to five acronym groups. One user has no school acronym in their organizational unit. This roster establishes Google school associations; ConnectWise Site stays at the company-wide value and the roster does not prove a ConnectWise Contact dropdown match.

`lookup-user` resolves an exact full name or email from that local roster. One match returns the person's school association; duplicate full names return candidates instead of choosing one, and no match returns `found: false`. Never infer an issue, time interval, or ConnectWise Contact value from a person's presence in the roster.

The Admin CSV examined contains 183 users and five acronym candidates extracted from the `.../ACRONYM - Staff` organization units. The user confirmed these 183 are all people they currently service; the wider Contacts Directory displays 824 entries. Treat the 183-user CSV as the current service cohort, and expand it only if the user later expands scope. Google organization names help identify schools; they never replace the fixed ConnectWise Site value.

`plan-week` accepts `weekStart` (a Monday) and `items`. Each item describes one ticket and has one or more `timeEntries`. It rejects repeated ticket keys, exact duplicate entries, out-of-week dates, and time overlaps across the week. It returns `tickets` and ordered `steps`: find/create the ticket, set and verify Ticket Owner on the saved ticket, set and verify `Working Issue Now`, save and verify each time entry one at a time, then set and verify `Completed`. Optional `sourceRecordIds` on a ticket or entry carry references to the user-supplied dataset. The planner does not generate work descriptions or infer time from a school schedule.

`run-week` launches Brave's local extension runner with the validated plan. It rejects `exampleOnly: true` before opening Brave. Select any intended signed-in ConnectWise tab once through the extension popup, or provide `--tab-id`. From Today or another main-app page, the runner navigates through Service Desk to Service Board before searching for duplicates or creating a ticket. If the selected page is a ConnectWise pop-out, the runner opens the main app in a separate tab and leaves the pop-out untouched. The CLI returns one JSON object with `execution.results`; each ticket and time entry has its actual verified status. A stopped run exits with code 3. An input failure exits with code 2. Never convert `stopped` or `pending` to submitted. Check `capabilities.browserSubmission` before relying on the runner for unattended work; it remains false until a real saved end-to-end run has been observed.

The extension popup also accepts a pasted weekly JSON record or an uploaded `.json` file. **Validate weekly JSON** applies the same `planWeek` function and ticket defaults as the CLI and displays the planned tickets and entries. **Run validated week in ConnectWise** opens the existing runner without starting a local server. This is an alternate input path, not a separate agent contract. The input stays in the popup until validation; the validated plan is passed through temporary extension session storage and removed when the runner loads it. The runner tab reports saved and stopped steps. Browser submission is still unverified in a live saved run.

The popup stores typed ticket, weekly JSON, and current-ticket time inputs locally in the extension. A stopped run leaves those inputs available when the popup reopens. A successful run clears only its submitted section; **Clear saved inputs** clears all sections. This storage is for draft convenience and is not evidence that ConnectWise saved anything.

The popup's **Save time on current ticket** starts from the saved ticket's Ticket or Time tab. It identifies the visible ticket ID, verifies the configured Company and Site, moves the ticket to `Working Issue Now`, checks for an exact duplicate time row, saves one entry, and reads the saved Time row. Completion is an explicit checkbox. The **Prepare Time Draft** button remains a separate unsaved form fill for an already open New Time Entry. The current-ticket save path is source-implemented and still requires live saved verification.

ConnectWise may remain on a Time Entry form after Save & Return. The runner records the complete Time list count before Save. Post-save verification may navigate from that form to the ticket's Time list only when the Time badge increased; if no baseline count was available, it requires a save confirmation instead. It then checks the exact saved row and reloads to verify persistence. Do not repeat Save merely because verification failed. The user reports that, after the ticket is Working Issue Now, the Time Entry form may set Ticket Status to Completed in the same save. Treat that as an optimization to implement only with verification of both the time row and final ticket status.

Version 0.8.5 uses `chrome.debugger` browser-level mouse input for Save & Return because the prior DOM `.click()` left the live form open with the Time count unchanged. It checks the form before the click and does not click Save a second time while verifying. A dispatched mouse event is not evidence of a saved Time row; require the count and exact row verification.

Version 0.8.18 hardens the saved-ticket completion action. Browser input is attached before measuring the status suggestion and Save positions. The runner waits for stable positions and verifies the actual browser hit target belongs to the expected ticket before a press; covered or shifted targets stop. The status picker must close after selection, and the requested status is checked again immediately before Save. After one Save click, a fresh success notice is required before reload verification, with up to a minute for the save. An older notice and typed search text cannot prove saved completion. If this step stops, retry the same existing ticket and original entry; never create another ticket or bypass duplicate checking. This change passed isolated Brave fixtures and still needs a live ConnectWise retry.

Version 0.8.20 recovers from the exact error `Cannot access a chrome-extension:// URL of different extension`. Chromium can reject debugger attachment to an HTTPS tab because another extension's iframe is embedded inside it. The helper retries attachment or an all-frame scan once with those popup iframe elements temporarily detached from accessible ConnectWise documents. It retains the elements in memory, watches for new popup frames during the action, and restores them after debugger detachment or a failed retry. It does not inspect foreign frame contents or change browser security flags, extension installation, login state, or ConnectWise work records. Restored popup content may reload. If no identifiable popup exists, or attachment stays blocked, it stops without sending a click. A real two-extension Brave fixture reproduced the error and verified recovery; production completion still needs a retry. Preserve a reported `saved_verified` Time entry and reuse it through duplicate checking.

The time entry accepts `date` as `YYYY-MM-DD`, `start` and `end` as 24-hour `HH:mm`, notes, work type, work role, and `B`, `NB`, or `NC` billable status. Decimal hours are calculated from the time range. The planner sets `sendEmail` to false. It does not capture passwords or use an API.

## Browser status

`extension/` can inspect form controls and prepare one unsaved time-entry draft on the ticket already open in Brave. The user confirmed version 0.3.0 filled the live form, including Notes. The prior synthetic Notes insertion collapsed ConnectWise's editor; version 0.3.0 instead sends browser-level text input through `chrome.debugger`, then checks that Notes remains visible with the exact text. Version 0.4.0 adds source-level browser actions for duplicate ticket search, create/open, status save, time save, and post-save verification, plus a local command bridge. Version 0.4.1 adds navigation from Today and a separate main-app tab for pop-outs. These new save actions have not been verified by a real saved run. Treat `browserSubmission: false` as the current release boundary.

See `docs/FIELD_MAP.md` for the controls observed so far. Avoid dynamic `x-auto-*` and `gwt-uid-*` IDs.

Version 0.8.21 follows a live report that the final completion click opened Bitwarden. Saved-ticket Save now activates the unique visible .cw_ToolbarButton_Save element directly in the verified ticket document, without browser-coordinate mouse input. It checks the committed status and closed picker, arms a fresh confirmation observer, activates once, and retains the existing confirmation/reload verification. Time Save & Return and status-option input keep their existing paths. Live completion remains unverified; reuse the existing ticket and exact saved time entry on retry.


Version 0.8.22 follows an exact live error showing debugger input blocked by another extension with no removable frame. Saved-ticket Status search and exact option selection now use page-element events, without debugger attachment or coordinate clicks; committed value and closed picker are still required before the exact-element Save. The popup reports the loaded background version and Save method; stopped background actions identify their build, action, and status/save stage. Production completion remains unverified. Retry the same ticket and original entry to preserve duplicate checks.


Version 0.8.23 reverts page-generated saved Status selection after a live run left Working Issue Now unchanged. Saved Status uses the guarded browser-input path again. Foreign-popup recovery now traverses open and closed shadow roots using chrome.dom.openOrClosedShadowRoot, parking only extension iframe host elements. Final Save retains exact-element activation without coordinate clicks. A closed-shadow popup is an inferred blocker until the next live retry; production completion remains unverified.


Version 0.8.25 requires Ticket Owner setup at the top of the popup. Save Ticket Owner writes helperSettings:ticketOwner independently of draft keys; only an explicit settings save changes it. All browser runners require it before browser operations; daily/weekly planning and execution use it instead of the packaged owner. Changing owner invalidates weekly validation. Extension reload and draft clearing retain it; uninstall/data deletion can remove browser storage. extension/INSTALL.txt provides coworker setup; distribute only the extension ZIP, with no browser data or work records.


Version 0.8.26 adds Existing ticket title contains and a standalone Find and open by title text button. JSON accepts titleContains in daily/weekly/work-item records. This searches literal substring within fixed company/site, requires one result, opens by the resolved number, and never creates a replacement for zero matches. End-of-day email update opens a separate GUI for date, subject, exact ticket IDs or title references, selected statuses, actual notes, and next steps. It resolves all references before writes, stops on duplicates/ambiguity, saves each selected status sequentially with fresh confirmation and reload verification, and generates an escaped HTML table only after all succeed. It clears detected Contact/Resources/Cc recipients before these saves, sends no email, and adds no time entries. Clipboard HTML requires clipboardWrite permission. Partial verified status results remain visible on failure; the draft is retained in eodDraft. End-of-day browser saves and title search require live verification. A popup browser fixture verifies title field visibility, time-checkbox expansion, and persistent owner after Clear saved inputs.


Version 0.8.27 replaces Work Type text inputs in both popup time forms with the 15 screenshot options (Onsite [DO NOT USE] is disabled). Billable is not editable: GUI entries carry AUTO, skip selecting Billable in ConnectWise, verify a readable automatic Billable/Do Not Bill/No Charge value before saving, and require a recognized saved-row billing code afterward. Explicit B/NB/NC JSON remains supported; AUTO is added to JSON schemas. Old draft billing values are not restored into the GUI. No billing mapping is inferred.


Version 0.8.28 replaces time-entry completion checkboxes with Mark ticket as selectors, using the screenshot statuses. Both selectors share helperSettings:lastTicketStatus, default to Working Issue Now on first use, and retain the last selection independently of cleared/submitted drafts. The runner verifies Working Issue Now before time, then applies and verifies the requested final status. Daily JSON accepts finalStatus while completeAfterTime remains backward compatible. Non-Completed final transitions report status_changed_verified.


Version 0.8.29 adds Continue stopped run to the daily ticket runner while its tab stays open. The original plan and latest result are retained in that page; continued runs reuse the observed ticket ID and duplicate checks. For already verified time, continuation re-reads and verifies exactly one matching row before retrying final status, without another time Save or reopening to Working. Other stops replay prerequisites safely against the same ticket. Missing/duplicate saved rows stop for reconciliation. It does not blindly repeat an uncertain save. Retry results are shown in the runner; the original CLI callback is not resent. Page reload/extension reload does not preserve this in-memory continuation. Live continuation remains unverified.


Version 0.8.30 addresses the visible Paid Time Off option being missed during draft preparation. Combo selection waits up to eight seconds for the exact requested option instead of stopping at the first nonempty list, accepts nested labels, normalizes whitespace, scrolls the target into view, and waits for readback. Selection errors include visible option labels. A Brave fixture verifies a delayed nested Paid Time Off choice with nonbreaking whitespace and preserves automatic Do Not Bill. Live selection remains unverified.


Version 0.8.31 follows a live Paid Time Off selection failure after the correct option was located. Runner draft preparation now selects Work Type with browser input before filling times. The guarded click verifies the Charge To ticket ID and exact option at the browser hit point, supports nested menu labels, scrolls the option into view, and requires selection readback plus a closed picker. Billing remains ConnectWise-managed for AUTO. A Brave fixture ignores synthetic option clicks and verifies trusted selection without Save. Live Paid Time Off selection remains unverified.


Version 0.8.32 adds daily batch JSON to Daily/ Weekly TimeSheets and EoD. Daily mode uses date/items and schemaVersion 1.2, rejects different-day or overlapping entries, retains per-ticket finalStatus, and generates the end-of-day HTML only after all ticket statuses and time entries are verified. Actual saved titles/IDs are read for the report. No email is sent. CLI plan-day/run-day share the same planner and visible-browser driver. See docs/DAILY_JSON.md and examples/daily.example.json. Daily batch execution remains live-unverified.



Version 0.8.36 generates one EoD report for each represented date after a successful daily or weekly run. Weekly reports group time-entry notes and followUp strictly by date; report-date selection controls preview, copy, and download. Ticket statuses reflect the verified final status from the run, not inferred historical statuses. JSON execution output includes endOfDays; daily endOfDay remains compatible. Failed/unverified runs produce no complete report. Email is not sent.


Version 0.8.37 simplifies the popup layout and removes Time on the current ticket (use Also enter one time entry in the unified ticket form). Textareas start at one line and grow with content, including wrapping and restored drafts. School is optional; without it a new title is the issue alone. Ticket number and titleContains may coexist: a confirmed missing number falls back to title; other lookup failures stop. Title lookup excludes Completed/Closed/Closed-Client-Unresponsive tickets and requires exactly one open result; zero/ambiguous matches never create a replacement. The separate title lookup button is removed. A real popup fixture verifies layout behavior and retained owner/status; live lookup changes still need verification.


Version 0.8.40 replaces the time checkbox with + Add a Time Entry. Each press adds a removable date/start/end/work type/role/notes form. One final status applies after all entries. Ticket JSON now accepts timeEntries or legacy timeEntry, never both. Planning rejects overlaps and repeated source IDs. Execution saves and verifies each record sequentially, reuses observed ticket IDs, and duplicate-checks already saved entries on Continue. Dynamic entries are stored with the ticket draft and restored on reopening. The popup fixture verifies adding/removing forms; source tests cover a stopped second entry, safe continuation, and final status sequencing. Multiple GUI entry submission remains live-unverified.


Version 0.8.43 allows creation after a verified zero-result title-reference lookup, including number-to-title fallback. Open matches are preferred; if none are open, closed matches are returned to prevent duplicate creation (one reused, multiple stop). New titles retain the reference text. Creation repeats reference and exact-title duplicate checks. Lookup failures and ambiguous matches still stop. The user's live run verified tickets 1727818, 1727819, and 1727822 before stopping; do not duplicate their time.


Version 0.8.44 addresses Assign Me not taking effect on imported ticket 1725615. Assignment/section clicks now attach before measuring, account for iframe scaling, wait for a stable position, and verify the browser hit target before mouse press. Owner readback is required before Save; unchanged ownership stops without a save or time entry. A scaled-frame Brave fixture verifies Assign Me after a layout shift. Actual imported-ticket reassignment remains unverified. The user's already verified tickets include 1727818, 1727819, 1727822, 1727829, and 1727832; retain their saved time.


0.8.45: existing ownership is changed through the Ticket Owner dropdown, not Assign Me. Blank/Unassigned tickets still use Assign Me. Configured owner must be verified before time entry.

Version 0.8.46 adds one recovery for a missing requested owner option on an already-owned ticket: add the signed-in resource using guarded Assign Me, then retry explicit owner selection once. Assign Me is not treated as proof of reassignment. Owner readback, Save, and reload verification remain required. The source regression verifies resource addition, explicit choice, save, and reload sequencing; this recovery needs live verification. Live results now verify 1725615/T-52629 and 1727852/T-52624, with T-52625/1725539 stopped before time.


Agent preparation guide: timesheets.md. Future lunch entries belong on an existing work ticket as a separate Payroll Wrap interval. Owner action popup protection spans focus through save/reload (0.8.47).

Version 0.8.48 makes titleContains an imported-reference-only Summary search: clear Company, Site, Location, ticket number, and other visible grid filters, then search only the literal title reference. Result verification no longer requires matching company/site for this mode, including auto-opened results. Exact-title creation duplicate checks keep their configured company/site scope. Open/closed candidate handling, ambiguity stops, and incomplete-pagination checks remain. A regression verifies unrelated filters are cleared and a matching reference is accepted despite different row company/site. Live reference-only lookup still needs verification.

Version 0.8.49 separates Time Entry identity from Notes editor readiness. A matching Charge To and time fields identify the open form even while Notes initializes; draft preparation waits up to 60 seconds for Notes before filling. The post-New wait also allows 60 seconds without a second New click. Daily/weekly runner includes Copy run results for error/success JSON. Source tests cover delayed identity and Notes readiness; a browser fixture verifies copying stopped-run output. Live second-entry recovery remains unverified. DITL ticket 1728063 has a verified 08:00-08:15 entry; continuation JSON omits it.

Version 0.8.50 recognizes all supported ticket statuses, including Scheduled Onsite~, when imported ticket rows do not expose a Status label. The fallback distinguishes ticket status from SLA status; regression fixtures cover scheduled, waiting, pending, and closed values. This fixes a source cause of the T-52650 lookup stop; live lookup remains unverified. T-52647 / 1727274 time 08:30-08:40 and Completed were verified by the user run and must not be repeated.

Version 0.8.51 waits up to 60 seconds for the opened title-match ticket status to load before classifying it as open or closed. It opens each candidate once, performs read-only retries, and still stops if status remains unreadable. Regression tests cover delayed status and permanent failure. Live behavior is unverified.

Version 0.8.52 extends the post-Time-tab duplicate-list readiness retry from 20 to 240 polls. It clicks Time once and waits for a complete readable list before duplicate checks; no New or Save is sent by this retry. Regression coverage simulates a list loading beyond the old retry limit. Local tests pass; the reported production stop has not been reproduced live.

Version 0.8.53 retries the unsaved New Ticket Status selection once if readback shows one control, a closed picker, and a reverted value. Full draft validation is still required before Save. Creation and Save are not retried by this recovery. A local regression covers reversion to Pre-Process followed by successful Working Issue Now selection. Live cause and recovery remain unverified.

Version 0.8.54 addresses a targeting defect in New Ticket dropdowns: coordinates were measured before debugger attachment, which can shift the page. Board, Status, Type, and Subtype selections now attach first, remeasure until stable, verify the browser hit target, and recheck after hover before pressing. The hit must belong to an unsaved New Ticket document and the exact requested option. An isolated Brave fixture reproduces attachment shifting a scaled iframe and verifies one trusted Status selection. The live stopped form was inspected as unsaved with Pre-Process; no live Save was performed. The precise cause of every earlier stop is not established.

Version 0.8.55 removes the ConnectWise ID prefix from EoD email ticket labels while retaining title references such as T-52672. Every header and data cell has an explicit inline border, padding, and readable table colors for rich clipboard email pastes. The shared renderer covers manual, daily, and weekly EoD reports. Internal IDs remain available for verification.

Version 0.8.56 excludes whitespace-delimited DITL titles, case insensitive, from EoD tables. Start/end of a title also count as word boundaries, covering daily titles ending in DITL. Daily/weekly report ticket arrays omit them as well. Execution and saved time are unaffected.

Version 0.8.57 renames the sample dropdown Download Example Files, retaining Daily/Weekly JSON and adding an EoD HTML example download alongside a small clipboard icon. Example copy writes HTML with inline table borders plus plain text. All extension clipboard buttons use SVG icons with accessible names and hover titles. A Brave popup fixture verifies the menu, rich HTML copy, download filename, and stopped-results copy.

## Run workspace (0.9.0)

- **History and Resume:** open Run history, Resume & combined EoD from the popup. Plans, observed ticket IDs, progress and verification checkpoints stay in this browser's local extension storage across restarts. Open a saved run, review it, then Resume. Completed tickets are rechecked without reopening their status. Previously verified time that is missing or ambiguous stops for reconciliation; it is not recreated.
- **Combined EoD:** verified work from saved runs is merged by date and deduplicated by ticket and time interval/notes. Earlier saved entries from an interrupted run are included once a later run verifies the ticket's final status. A stopped/incomplete run can still leave the report incomplete. DITL exclusion and bordered, number-free email tables remain in effect.
- **Review and progress:** validation shows the planned lookup, possible creation after a verified no-match, actual entries/notes, requested statuses, daily totals, internal gaps/overlaps and shortfall against the 8.5-hour target. It does not infer unrecorded work. A runner checklist shows the current action for each ticket.
- **Time summary:** history separates saved billable/nonbillable time, lunch and unconfirmed billing. AUTO is not counted as confirmed billable until read from a saved ConnectWise row. Morning huddle presets explicitly request Billable as confirmed by the user.
- **Presets:** expand Time-entry presets to add morning huddle, Ops check-in or lunch. Custom presets save the last entry's notes/work fields without dates or times. Enter actual dates/times before running. Presets can be removed individually.
- **Diagnostics:** the clipboard icon beside progress copies the failed action, entry interval, helper version and visible control counts. It excludes raw page contents, URLs and session/credential data. Normal result JSON still contains the supplied work record.
- **Email edits:** expand Edit email only to change notes/next steps before copying. History keeps email overrides locally; changed source notes invalidate the old override. These edits do not modify ConnectWise records or ticket status. Manual EoD also has email-only editing.

Run history starts with runs saved by this version; older browser sessions cannot be reconstructed automatically. Local history contains work notes and persists until browser extension data is cleared. Uninstalling the extension or switching browser profiles does not transfer history. No emails are sent automatically. UI runs require Start reviewed run; CLI submissions execute after validation as before. Browser actions are serialized and concurrent helper runs are blocked. Local/isolated-browser tests verify recovery and UI behavior; production submission remains dependent on the live ConnectWise UI and is not implied by fixture results.

Version 0.9.1 renders pre-run previews as separate ticket cards in both the popup and runner. Each card groups the title, lookup, final status, description and individual time entries; daily totals have a separate panel. Text is inserted safely through textContent. Brave popup and durable-run fixtures passed, and the rendered card layout was visually checked.

Version 0.9.2 uses Onsite Support for the billable morning huddle. The preset and unsaved resumed huddle entries are corrected; verified and save-attempted entries are never migrated. Explicit Billable selections now use guarded trusted browser input before draft filling, followed by readback. AUTO billing remains untouched. Diagnostics report helper version 0.9.2. A Brave fixture verifies Billable selection and unit tests verify migration boundaries. No live time was saved during validation.

Version 0.9.3 adds a second Start/Resume button directly below the runner heading. It mirrors the existing button label, visibility and disabled state and invokes the same guarded action. The reload/resume Brave fixture verifies the top button and no duplicate save.

Version 0.9.4 removes reload-on-status-mismatch: status verification waits for stable readback and reports the observed value without navigating. Post-save reloads attach a dialog listener, stop after 30 seconds, and cancel beforeunload prompts to preserve unsaved forms; they never accept data loss. Owner reassignment waits for a fresh save confirmation before reload. A lost background message channel stops with an uncertain-action recovery message instead of assuming failure or retrying a save. Unit tests cover read-only mismatches and cleanup; an isolated Brave test opens a real unsaved-changes dialog, cancels it through the guard, and verifies the form remains. The exact prompt seen on production ticket 1729074 is not yet identified.

Version 0.9.5 collapses ticket cards by default with expandable summaries showing title, entry count and status. Full descriptions and time details remain available on expansion. Runner logs use a fixed 160px scrollable box; an accessible +/minus control toggles full content height. Clipboard copy still includes the entire log regardless of visible height. Brave tests verify both ticket states, log expansion/collapse, and unchanged recovery behavior; the compact layout was visually checked.

Version 0.9.6 adds the original eleven-frame Bross Carlton above the runner with a bold live status. Working uses a yellow shirt, verified completion green, and stopped/stalled red. Before starting, Ready is shown with a neutral shirt. A 90-second absence of progress updates shows Stopped with an explicit warning that an in-flight request may still finish; it never retries or claims cancellation. Progress resets the watchdog, and reduced-motion preferences stop frame cycling. Only the shirt palette changes; original vector geometry and other colors are preserved. Local assets are bundled, with no connection to Bross at runtime. Isolated Brave tests verify asset loading and working/stopped/completed labels and the green SVG fill; the rendered red/green states were visually checked.

Version 0.9.7 adds an extension configuration screen with persisted ticket defaults, separate owner settings, and a CLI JSON export. Existing plans are not silently rewritten. Local tests verify settings merging and validation; no live saves were performed.

Version 0.9.8 adds per-date inventory counts and recommended purchase links to the shared EoD editor used by manual reports, run results and history. These email-only additions persist under eodExtras:<date>, appear below the ticket table, and copy as bordered inventory rows and fully linked Item × quantity labels. Purchase URLs are restricted to HTTP(S); invalid or incomplete purchases block copy. No ConnectWise records or inventory systems are changed.

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

Version 0.9.13: Validate JSON enables Preview / copy Daily Report from JSON immediately. The runner offers the same action before and during submission. These reports use supplied work notes, planned titles and requested statuses, with no invented saved IDs or verification evidence. The dedicated report page labels the source as unverified JSON, supports per-date inventory/purchase and email edits, and never calls ConnectWise. DITL and Payroll Wrap remain excluded. Saved-record reports and combined history remain separate.

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

## Interrupted-run recovery (0.9.22)

The runner checks background responsiveness before sending browser work. A missing reply stops the preflight after five seconds; queued work blocks a second run. A background action taking more than 30 seconds shows a stalled-action message while retaining the browser lock because the action may still complete. History and reopened runner pages mark abandoned running records stopped only while holding the exclusive browser-run lock. Evidence and checkpoints are preserved. Close all runner tabs, reload the extension, then reopen the original run from History & Resume. Do not rerun the full JSON after partial saves. No production saves were performed while checking this recovery change.

## Purchase reasons (0.9.23)

Recommended purchases accept an optional `reason` string beside item, quantity and url. The editor has a Reason field; previews and rich clipboard reports show a linked Item × quantity label with the reason in the next cell. Reasons stay tied to the report date and are preserved in daily/weekly JSON, saved reports and history. Existing inputs without a reason still work. Example: `{"item":"HDMI cable","quantity":2,"url":"https://example.com/hdmi","reason":"Document-camera setup and replacement stock"}`.

## Arrival and departure (0.9.24)

Daily JSON accepts optional `endOfDay.arrivalTime` and `endOfDay.departureTime` in 24-hour HH:MM format. Weekly JSON accepts the same fields in each dated `endOfDays` record. Example: `{"arrivalTime":"08:00","departureTime":"16:30"}`. These are actual onsite times supplied by the user, not inferred from time entries. They add no records and do not change hours or billing. The Daily Report includes a table row labeled Arrival time and departure time in the Ticket column, with the actual times in the adjoining merged cell. Report editors save and clear these fields independently for each report date; manual report entry has the same inputs. Omit a time when it is unknown. Existing JSON remains compatible.

## New-ticket agreement selection (0.9.25)

Company readiness checks company, contact and site independently from agreement auto-population. After board/type/status selection, the helper explicitly selects the exact configured agreement if the current value differs or is blank, then requires stable readback before filling and saving the ticket. An already selected correct agreement is retained. Missing/ambiguous controls or a selection that does not persist stop before Save. This recovery does not retry New or Save and does not change configuration. Validated locally; production save verification is separate.

## Multiple weeks in one JSON (0.9.26)

Weekly-format JSON can include an optional inclusive `weekEnd` date to cover multiple weeks in one validated batch. Example: `{"schemaVersion":"1.1","weekStart":"2026-11-02","weekEnd":"2026-11-12","items":[...]}`. weekStart remains a Monday. Without weekEnd, the range remains the original Monday-Sunday week. Entries and dated endOfDays metadata must fall inside the selected range; duplicate checks, overlap rejection, per-day reports and resume evidence still apply. Only include actual requested work or leave dates; a date range does not generate entries for missing days.

## Multi-Day JSON (0.9.26)

Multi-Day JSON replaces the Weekly JSON label in the workspace and example download. Use `schemaVersion: "1.1"`, `startDate`, `endDate`, and `items` for any inclusive date range, including a non-Monday start or multiple weeks. Example range: `"startDate":"2026-10-29", "endDate":"2026-11-12"`. Both dates are required for this format; do not mix them with legacy weekStart/weekEnd. Dated endOfDays metadata must be inside the range. Only supplied time entries are created; missing dates add no work. Existing weekly files remain accepted with their original Monday/Sunday defaults. CLI aliases `plan-multi-day` and `run-multi-day` use the same model-independent planner and browser safeguards. Current samples: examples/multi-day.example.json and extension/MULTI-DAY-EXAMPLE.json. Daily schema 1.2 still works.

## School locations (0.9.27)

Newly validated plans resolve only the user-managed Company/acronym mappings saved in Settings or supplied in CLI ticket settings.

This supersedes the older company-wide Site rule for mapped schools. Company and notifications are unchanged. Unknown/omitted acronyms retain the configured default; conflicting explicit Sites stop. The Site picker populates addresses automatically; the helper never types address fields. Existing matched tickets receive the mapped Site before owner/time work; Save requires a fresh confirmation and post-reload Site verification. Exact-title duplicate lookup spans Sites within the company to reuse older tickets. Numeric and imported-reference lookup rules remain unchanged. Completed resume items still skip browser work. Older saved plans retain their original Site: revalidate remaining-work JSON, excluding confirmed finished entries, for the new mapping.

Local regression coverage is not a live Save verification. Reload the extension before using a newly validated plan.

### Planned IIQ Rake

Confirmed scope: all of the configured owner's open CW tickets. Match their imported IIQ references, read current IIQ statuses, and propose the closest supported CW status. Prefer exact matches; unresolved mappings and ambiguous references need review. Do not create tickets or time entries. Not implemented in 0.9.27.

## 0.9.28 Site-action response fix

The ensureTicketSite success branches now include ok: true alongside verified: true. Version 0.9.27 could finish the Site check but the runner rejected its incomplete response with ensureTicketSite failed. Message-dispatch regressions cover both already-selected and changed/saved Site paths. Existing remaining-work JSON can be reused; no time entries were attempted after this failed Site check. Local tests do not verify production saves.

## 0.9.29 guarded Company selection

New-ticket Company selection now uses the shared attach-before-measuring, stable-layout and browser-hit-test click path. Company/Contact readiness waits up to 60 seconds instead of 15. The old unguarded click path was a source targeting defect; the exact cause of the reported live blank-field failure remains unverified. No New or Save is retried. Resume preserves verified earlier tickets. Tests cover delayed dependent fields and permanent blank fields. No production saves were performed during this fix.

## IIQ Rake (0.10.0)

Open IIQ Rake from the workspace shortcuts or page navigation. Direction is always IIQ_TO_CW. IIQ pages are only searched/read; no IIQ status or comment writes exist in this workflow. No CW ticket/time creation, ownership changes, or Site corrections are part of the rake.

1. Reload the helper. Open a signed-in IIQ tab and a ConnectWise tab.
2. On IIQ Rake, connect the IIQ site once to grant optional access to that exact HTTPS origin. Select both tabs.
3. Choose All handled tickets or Most recent handled tickets (default 25 unique references, configurable down to 1). The source is this browser's saved helper run history, not a full CW-owner backlog scan. Imported rake JSON can add older handled references not stored in this browser.
4. Scan & preview changes reads rendered IIQ search results and each ticket's current status, resolves the IIQ reference in CW, and reads the current CW status. Scanning never saves either system.
5. Review the cards. Known differences start selected; matching statuses are unselected. Unknown IIQ statuses need a manual CW choice. Ambiguous or missing references are blocked.
6. Apply selected changes to CW rechecks IIQ status/source origin, CW identity, unique reference matches, and CW status before each single save. Changed evidence stops for a new scan. A successful result requires the existing CW save/reload verification. A retry seeing the target status does not save it again.

Exact normalized status names are preferred within the helper's supported CW statuses. Resolved maps to Completed, In Progress to Working Issue Now, Waiting on Requestor/Requester to Waiting Client Response, and vendor/copier-vendor/cabling-vendor waits to Waiting on 3rd Party. On Hold, Submitted, and other unconfirmed names require review. The board must actually offer the chosen status; otherwise the existing selector stops before Save. Terminal CW tickets may be reopened if the reviewed IIQ source status is still active.

Stop finishes the current ticket before stopping. The same exclusive browser-run lock prevents simultaneous timesheet and rake activity. Last preview and results stay in local extension storage and can be copied with the clipboard icon. CW email-recipient clearing follows existing status-save behavior; no email is sent. Browser profiles, ticket captures, and work history remain outside Git.

Model-independent reference input: schemas/rake.schema.json, examples/rake.example.json. Validate with node src/agent-cli.mjs plan-rake --input <JSON file or ->. Export the current list from the rake page; imported JSON must set schemaVersion 1.0 and direction IIQ_TO_CW. No credential/API dependency or agent-specific execution path is added.

Verification: live browser inspection confirmed IIQ Search, an exact ticket link, and the current status on T-53282. Automated tests use isolated browser fixtures for IIQ reading and the rake workspace plus source tests for selection, mappings, stale-state stops, and save receipts. No rake-triggered production CW saves were made during development.

## 0.10.1 IIQ ticket heading recognition

Live inspection found that the full-page IIQ ticket heading displays only T-number text, with Ticket #T-number in aria-label and a ticket-number badge. The reader now accepts that rendered accessibility label/badge as well as the earlier full-text heading. It still requires exactly one matching visible ticket heading and one readable current-status control. This fixes recognition that could time out before CW lookup. Active checking rows now appear immediately during scan. Recorded duplicate CW IDs remain blocked for review; no CW write was made during diagnosis.

## 0.10.2 CW rake readiness and recorded-number matching

Rake CW reads now wait up to 60 seconds for stable nonempty Company, Summary, and Status on the exact ticket. Company comparison normalizes case and whitespace. Missing fields are reported as incomplete; genuine mismatches include expected and actual Company values and remain blocked. Previously the page compared Company immediately after header readiness, which could classify a loading field as a different company. This is a source timing defect; individual prior mismatches did not log their actual values.

One recorded CW ticket ID is now the authoritative lookup, consistent with numeric-ticket matching elsewhere. Rake bypasses title search for that ID and verifies the exact IIQ reference in its saved title. Multiple recorded IDs stay blocked. References without a recorded ID still require one exact CW title match and repeat that match before applying. Fresh IIQ status, source origin, CW identity/status, and verified-save checks remain. Rescan old previews after reloading 0.10.2. Targeted rake/readiness/UI tests: 33 passed; no production status changes during this fix.

## 0.10.3 closed-record rake navigation

Live investigation confirmed that a recorded CW ticket returned no result in Open Records but appeared in global search after All Records was selected; its actual status was Closed. The displayed global-search ticket link uses ConnectWise.html?locale=en_US&routeTo=ServiceFV&srRecID=<number>. Rake reads now navigate the selected CW tab to that visible app route for each exact recorded ID, bypassing Service Board filters and menu navigation. This is browser-page navigation, not API access. The existing stable ID/Company/Summary/Status checks remain mandatory before preview/application. Fresh navigation also refreshes an already-open ticket before comparison. General timesheet navigation is unchanged. No live CW save was made during this diagnosis. Rescan after reload.

## 0.11.0 current assigned-ticket rake

Open a CW Service Board list with the top Location, Business Unit and Service Board selectors set to View All. In IIQ Rake, choose that CW tab and an authenticated IIQ tab, enter your Resources search pattern (Natural uses `*your-login*`), then Scan & preview changes. The Resources pattern is saved locally and is editable for coworkers. Newest means highest CW ticket numbers, not last handled in helper history.

The helper clears other column search fields, searches the visible board, waits for fresh result rows, and collects every page. It refuses incomplete or changing counts. If the Next control cannot be identified, increase Rows Per Page to show the full backlog and rescan. Tickets without one IIQ title reference are listed separately, and multiple open CW matches for the same reference still require review. Imported reference JSON also receives the current Resources eligibility check.

CW details open in a separate tab so the filtered board stays available. Before each selected save, the helper checks the exact CW number against the Resources search again, rechecks IIQ status and CW identity/status, and skips tickets that are closed or no longer assigned. It never reopens completed/closed tickets, creates tickets/time, or writes IIQ. Changed search settings invalidate the preview. Legacy previews require a new scan.

Validation: local model and isolated browser fixture checks; no live backlog scan or production status save performed for this release. The live pager layout still needs confirmation; collection stops safely if it cannot verify all pages.

0.11.0 validation result: full local/isolated-browser suite 243 passed, 2 optional skipped, 0 failed (245 tests). No live CW status saves.

## 0.11.1 rake list readiness and pagination

The Resources search can return the same rows without rebuilding the table. Rake now accepts a stable result for an unchanged set of column filters instead of requiring a row mutation that may never happen. Changed searches still wait for a result-region refresh, including attribute/loading changes. Timeout diagnostics include the last readiness reason and row counts.

Pagination uses the live-observed `.cw-ml-pgopt-count` and sibling `.nextButton .mm_button` controls. Verified read-only on the user's board: 1–40 of 57, then 41–57 of 57 with 17 rows; restored page one. No CW status or time saves. Targeted model/workspace/list-browser regression suite: 33 passed, 0 failed. The packaged helper's complete live IIQ scan remains to be retried after extension reload.

## 0.11.2 exact saved-ticket Status selection

Saved-ticket Status now activates the unique, exact option element in the open picker instead of using browser coordinates. The guard verifies ticket ID, a unique labelled Status field and picker, the requested option, and enabled state. Existing stable value/picker-closed checks still run before exact Save and reload verification. Work Type and other dropdown paths are unchanged.

Validation: 40 targeted dropdown, rake-model and isolated-browser tests passed, including a clipped/scrolled Status picker and wrong-ticket/duplicate-option rejection. No live status save performed for this fix. Reload the extension, reopen IIQ Rake, review the restored selected changes and apply again. Already closed CW tickets remain skipped on retry.

## 0.11.3 continue rake with replacement tabs

Changing CW or IIQ tab keeps the saved preview, manual status choices and selected rows. After a stop or reload, choose valid logged-in tabs and click Continue selected changes to CW; a full backlog scan is not required. Replacing CW resets the cached detail-tab binding. The selected IIQ tab must belong to the configured IIQ site; the selected CW tab must be a live CW page. Each selected ticket still receives fresh eligibility, source-status, identity and saved-status checks. Confirmed closed tickets remain skipped.

Changing Resources, scope, count, IIQ site or input JSON still clears the old preview because those change the search itself. Manual mapping/checkbox edits are saved locally. Validation: 32 targeted model and isolated-browser checks passed, including a transient stop, reload, replacement tabs and successful continuation with no list rescan. No live CW saves performed for this release.

## 0.11.4 Status picker text events and always-available diagnostics

Status activation targets the nested option text and dispatches a bounded mouse-down/up/click sequence after the existing exact-ticket/field/picker/option guards. Value retention and picker closure are still required before Save. Live inspection confirmed that clicking the Completed text commits the selection; the original Working Issue Now value was restored without saving. The packaged helper event path itself still requires a live retry.

Both rake clipboard icon buttons stay enabled during scan/apply/resume. A second icon is near the top of the page. Copied diagnostics include the helper version, working flag, current action/ticket/reference and start time, displayed status, saved preview and current run details. Copying no longer overwrites the displayed operation status. An isolated browser test pauses a resumed IIQ read and verifies diagnostics can be copied while it is pending.

0.11.4 full local/isolated-browser validation: 246 tests, 244 passed, 2 optional skipped, 0 failures. No live saves performed.

## 0.11.5 ignore Pending Closure in IIQ Rake

Rake excludes CW Pending Closure, Completed and Closed tickets. The exclusion applies during backlog collection, imported/restored preview checks and fresh checks before applying. A ticket moved to Pending Closure after preview is skipped rather than changed. IIQ Pending Closure can still map to CW Pending Closure for an otherwise eligible ticket. Targeted model regression suite: 32 passed, zero failures. No live saves performed.

## 0.11.5 release and verified state

The user supplied a 0.11.4 rake result confirming 12 saved_verified CW updates (10 Completed, two Working Issue Now). IIQ was unchanged. That is live extension evidence; the CLI capabilities still report browserSubmission false. Version 0.11.5 additionally excludes Pending Closure, including on continuation.

Continue with valid replacement CW/IIQ tabs without rescanning. Manual choices and verified results stay in the saved preview. Clipboard diagnostics remain available during the run. For JSON authoring, use docs/AGENTS.md; repository maintenance instructions are in the root AGENTS.md.

Publication validation (0.11.5): both working and sanitized checkouts passed 245 tests, with 2 optional skips and zero failures.

## User-managed school acronyms (0.12.0)

Manage rows in Settings: acronym (2–16 letters/digits), exact CW Company, exact CW Site. Company/acronym pairs must be unique; the same acronym can belong to different companies. Settings export includes schoolMappings for model-independent CLI use. Empty or omitted mappings mean no school overrides. Removing a row stops future overrides; it does not alter saved run plans or tickets. Site correction verifies the configured Company before selecting/saving.


0.12.0 validation: sanitized full suite 238 passed, 2 optional skipped; 11 targeted settings/rake/Site checks passed after removing the default IIQ client URL. No live ticket changes.

JSON school discovery (0.12.1): valid non-example imports with explicit school and site strings add Company-scoped mappings to Settings. No Site name is inferred from an acronym alone. Existing or within-batch conflicts stop without saving new mappings. CLI planning resolves explicit pairs without changing files.

## 0.12.2

Site correction waits for stable, nonempty Company and ticket Status before comparing the configured Company. True mismatches report both values and stop before any edit/save. Company is rechecked with the Site after reload. Resume retains confirmed tickets and checks the stopped ticket before entering time. No live save performed for this fix.

## Company transfer (0.13.0)

Ticket/time runs can transfer an existing ticket to the configured Company before Site, owner and time work. They reuse the ticket ID, select the exact target Company, configured Contact and Agreement, and target Site, clear email recipients, save once and verify the fields after reload. Missing/ambiguous controls, unrelated pending transfer drafts and unverified saves stop. Confirmed finished tickets remain skipped. An uncertain transfer Save is not repeated in the same document. IIQ Rake does not transfer Companies.

This path has local orchestration coverage but has not completed a live Company transfer. A Company-change dialog or unsupported picker layout may still require review; do not report a transfer as saved until reload readback verifies it.
