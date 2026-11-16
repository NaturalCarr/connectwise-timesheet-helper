# Development notes and version history

Archived notes from the former README. Entries describe the state at the time; see [README.md](README.md) for current features and setup. Git commits and GitHub Releases also retain development history.

# ConnectWise timesheet helper

## Current behavior (0.11.5)

This section takes precedence over older release notes below.

- IIQ Rake starts with current open CW tickets filtered by Resources (for Natural: `*ncarr*`). Choose all or newest open tickets, then preview IIQ-to-CW status changes. Pending Closure/Completed/Closed CW records are excluded; historical run records no longer define the backlog.

- Confirmed school acronyms select their exact school Site (see School locations below). Company and notifications are unchanged. ConnectWise populates the address automatically.

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

Shared guide: [dist/share/AGENTS.md](dist/share/AGENTS.md).


Local JSON planner and Brave UI runner for ConnectWise PSA tickets and time entries.

## Product direction

The helper is intended to become the user's main interface for routine ConnectWise work. Prioritize quick daily flows for finding or creating tickets, recording time, updating ownership and status, and completing tickets. Keep the GUI usable on its own while giving agents the same work through a model-independent JSON contract. Use only work facts the user supplied, prevent duplicate records, and confirm what ConnectWise saved before reporting success. Add other routine actions as their requirements and browser behavior are established.

Each work item names a school acronym and issue. A ticket number is optional input and is used only when an existing ticket is already known. Without one, the browser searches for a match before creating a ticket, then reads the number ConnectWise assigns. Time is entered one record at a time. Tickets use Democracy Prep Public Schools as Company. Confirmed school acronyms select their mapped school Site; the acronym also remains in the title.

Version 0.8.19 makes an explicitly supplied `existingTicketId` the complete lookup criterion in both daily and weekly runs. The runner opens or searches for that exact number, clears other list search filters, and verifies the number shown on the opened ticket. A different existing title, company, or site no longer blocks this lookup. It does not rename or replace those ticket fields. Without an explicit number, the existing company/site/title duplicate search still applies before creation. Number lookup has local regression coverage; the Service Board number filter still needs a live retry. Reload the extension before retrying #1717395.

Version 0.8.20 handles Chromium rejecting browser input because another extension has embedded a popup iframe in the ConnectWise page. If the exact cross-extension access error occurs, the helper temporarily parks those iframe elements in the accessible page DOM, retries once, and restores them after detaching browser input. The same recovery covers blocked all-frame scans. The popup can reload when restored; ConnectWise forms and unrelated HTTPS pods are kept in place, and no foreign extension content is read. A fresh Brave profile with a separate fixture extension reproduced the exact error, then the production helper selected Completed, clicked Save once, verified a fresh confirmation, and restored the popup. This test used an intercepted fixture page, not a production ticket. The user's latest #1717395 run reported the October 7 15:30–16:00 entry as `saved_verified` and stopped before completion. Retry that existing ticket with the original entry after reloading; reuse the matching Time row.

The saved ticket screenshot supplied the defaults in `ticket-settings.json`. The user confirmed the company-wide Site value. School names and user locations from Google are separate from the ConnectWise Site field.

Google Workspace Directory is the source for school and person information. Use the Google Admin **Directory > Users > Download users** list export with **All user info columns and currently selected columns** and **CSV**. Save it in ignored `.local/`, then run `node src/agent-cli.mjs inspect-users --input .local/users.csv`. This reports column names and distinct organization/location values without selecting the explicit name, email, or phone columns; freeform values can still contain personal details. The first export has 183 users, and the user confirmed they are the full current service cohort; the wider Contacts Directory has 824 entries. Run `node src/agent-cli.mjs build-roster --input <export.csv> --output .local/service-roster.json` to create a local lookup containing only names, email addresses, school candidates, job fields, and status; credential columns are excluded. The output must stay in `.local/` and the command will not overwrite an existing roster. The roster identifies people and school acronyms; ticket Site always comes from `ticket-settings.json`. The Admin Users list export is a narrow directory export, separate from Google Workspace's full organization data export. Do not commit raw user exports.

An agent can resolve an exact person with `node src/agent-cli.mjs lookup-user --roster .local/service-roster.json --query "Full Name or email"`. Duplicate names return an ambiguity result; use an email address to select one person. The roster does not prove a ConnectWise Contact match.

Run a draft check:

```powershell
node src/plan-cli.mjs ticket-settings.json work-item.example.json
```

For Qwen, OpenCode, or another agent, use the JSON CLI in `docs/AGENT_PROTOCOL.md` and read `AGENTS.md` first. It has no model-specific dependency.

An agent can validate an entire week with `node src/agent-cli.mjs plan-week --input <week.json>`. The input contract is `schemas/week.schema.json`. Put all time entries for one issue in one work item; the planner checks the Monday-to-Sunday date range, repeated tickets, and overlapping times, then emits one browser step per entry. This is planning only, not submission.

The required ticket lifecycle is `Working Issue Now` before saving time, followed by `Completed` after all entries on that ticket are saved and verified. The planner and runner include both status transitions, including when reopening an existing ticket.

Ticket Owner cannot be set on the blank New Ticket form. After the initial ticket save assigns an ID, the runner sets or verifies `Natural Carr` as Ticket Owner on the saved ticket and confirms it after a reload before entering time.

For a separate voice-to-JSON tool, use the field guide in `docs/VOICE_WORK_JSON.md` and the complete HPHS sample in `examples/hphs-week.example.json`. The sample has `exampleOnly: true` and must never be submitted as real work.

Time entries use `YYYY-MM-DD` for the date and 24-hour `HH:mm` for start/end. Set `workType`, `workRole`, `billable` (`B`, `NB`, or `NC`), and `notes` on each entry. The planner computes decimal hours and never selects email recipients.

The `extension` folder contains the Brave helper. Load it with `brave://extensions` --> Developer mode --> Load unpacked, then select the `extension` folder. If it is already loaded, click Reload after a code update. Version 0.4.0 adds local runner access to `127.0.0.1` and saves the chosen ConnectWise tab ID with extension storage.

Version 0.8.7 saves the popup's ticket, weekly JSON, and current-ticket time inputs in local extension storage as they are typed. Closing and reopening the popup, or a stopped run, retains them. A verified successful run clears its submitted section; **Clear saved inputs** clears all three sections. Uploaded JSON is retained as text so the original file is not needed when the popup reopens. Ticket creation navigation activates the ConnectWise tab before reading the Service Desk position, hovers to reveal the menu, and accepts the visible Service Board item. This navigation change has local test coverage but still needs a live retry.

Version 0.8.8 changes New Ticket Company selection to wait for the exact picker suggestion and verify its dependent defaults instead of requiring transient search text to persist. The user's last live run reached this form but stopped before saving a ticket; the revised selection still needs a live retry.

Version 0.8.9 sends a browser-level click to the exact Company option because a DOM click left the picker open without populating Contact, Site, or Agreement in a live attempt. The runner stops before Save if those dependent fields remain blank. Reload the extension and retry to verify the new click path in ConnectWise.

Version 0.8.10 uses browser-level clicks for New Ticket Board, Status, Type, and Subtype, plus saved Ticket Owner, because a live run showed the prior synthetic dropdown clicks had not persisted. It verifies each selection before Save. The new selection path still needs live confirmation.

Version 0.8.11 waits for the saved ticket page to settle before and after reload. A live run created ticket #1717335 for `DPHES - Repeat Jams`, but an early post-reload read stopped the workflow before Owner and time. A retry must reuse this ticket; the extension searches for an exact existing ticket before creating one, and the known ID can also be entered in the optional Existing ticket number field. When a saved ID is observed but verification remains incomplete, the stopped result now retains that ID.

Version 0.8.12 assigns the signed-in user from **Resources & Meetings > Assign Me** on the saved ticket instead of searching the Ticket Owner dropdown. It then saves and reloads to verify the configured Owner before time entry. A live retry on #1717335 found the ticket but stopped at the old Owner dropdown; the Assign Me path needs live verification.

Version 0.8.13 activates the ConnectWise tab before locating Save & Return and scans all frames for one visible toolbar button. The live run on #1717335 confirmed Natural Carr as Owner and filled the time form, but stopped before Save because the old frame-specific toolbar locator returned no valid position. The Time badge was 0, so that entry was not saved. This new cross-frame click path needs live verification.

Version 0.8.14 adds a guarded Save & Return locator for the current ConnectWise toolbar: it tries the direct control class, label, and text, then the unique toolbar action immediately right of Save. A live diagnostic found no direct selector in seven frames while the icons were visible. The fallback is locally tested, but no automated saved Time row has yet been observed.

Version 0.8.15 follows a live run where ticket #1717335's 08:41–09:35 time entry was saved and verified (`Time 1`). The final `Completed` transition stopped while the ticket still showed `Working Issue Now`. The saved-ticket Status dropdown now uses a browser-level option click and post-save reload verification. On retry, the existing time row should be reused rather than submitted again; completion still needs live confirmation.

Version 0.8.16 handles a saved-ticket Status picker that initially displays only `Working Issue Now`: it searches the editable Status field for `Completed`, clicks one exact visible suggestion with browser input, then verifies the selected value before Save and the saved value after reload. The latest live attempt on #1717335 stopped before changing Status because the open picker showed only `Working Issue Now`. Its time entry was already saved and verified; completion still needs a live retry. The runner must reuse that time row and must not create another ticket or time entry.

Version 0.8.17 follows a live retry that selected `Completed` on #1717335 but did not save the ticket. Saved-ticket Save now uses a browser-level mouse click on the unique visible Save icon in the verified ticket frame. Even when the form already displays `Completed`, the completion action still saves and checks persistence after reload, because that value may be an unsaved selection. The actual final save remains live-unverified until the next retry.

Version 0.8.18 addresses the reported final Save misclick on #1717604 (`DPEHS - Doc-Cam Check`). The runner attaches browser input before measuring positions, waits for scrolling and layout to settle, accounts for iframe scaling, and checks the actual browser hit target before and after hover. Both the saved-ticket status option and Save must belong to the expected ticket; an overlay or shifted control stops the click. A typed `Completed` search is accepted only after the option is selected and the picker closes. Immediately before Save, the runner checks the requested status again. It waits up to a minute for a fresh success notice before reloading to verify persistence, so an old notice cannot interrupt a pending save. Four local Brave fixture tests passed for scrolling/scaling/layout changes, covered controls, stale notices, and committed status selection. The real ConnectWise final save remains unverified. Reload the extension and retry with existing ticket #1717604 and the original entry; the duplicate check must reuse an identical saved row.

Version 0.7.0 has a standalone **Open a service ticket** form at the top of the extension popup. On any signed-in ConnectWise tab, enter a school acronym and issue, optionally add an Initial Description or an existing ticket number, and click **Find or create ticket**. The extension searches the fixed company and Site for the exact title first. One match is opened, multiple matches stop, and no match leads to a new ticket. The new ticket is saved and its ConnectWise-assigned ID verified; then Ticket Owner `Natural Carr` and Status `Working Issue Now` are saved or verified. Check **Also enter one time entry** to add the actual date, start/end times, notes, work type, role, and billable choice. The runner checks for a duplicate date/start/end/notes record, saves and verifies one entry, then sets the ticket to `Completed` by default. Uncheck **Complete ticket after saving this entry** when work should remain at `Working Issue Now`. With **Also enter one time entry** unchecked, the flow just opens the ticket. **Load ticket JSON instead** accepts pasted JSON or a `.json` file into the same form. See the non-submittable examples in `examples/ticket-only.example.json` and `examples/ticket-with-time.example.json`. Reload the extension in `brave://extensions` after updating. This browser save path has not yet passed a real saved end-to-end ConnectWise run.

Agents can use the same ticket-only contract without the popup:

```powershell
node src/agent-cli.mjs plan-ticket --input .local/ticket.json
node src/agent-cli.mjs run-ticket --input .local/ticket.json --extension-id <Brave extension ID>
```

`existingTicketId` is optional. Without it, ConnectWise assigns the number after creation. The daily ticket contract is `schemas/ticket.schema.json`; it accepts one optional `timeEntry` and rejects `timeEntries` or unknown fields instead of silently discarding them.

Version 0.5.0 lets you open the extension popup on a signed-in ConnectWise tab, paste a weekly JSON record or choose a `.json` file, click **Validate weekly JSON**, review the ticket and time preview, then click **Run validated week in ConnectWise**. The popup uses the same planner as the CLI. The selected file is read locally and the validated plan is kept in temporary extension session storage until the runner tab opens; no local CLI or extension ID is needed for this path. Reload the extension in `brave://extensions` after updating it. The runner tab reports the actual result. Browser submission remains unverified until a real saved end-to-end run succeeds.

Version 0.4.1 lets the weekly runner start from Today or another ConnectWise view and clarifies that **Prepare Time Draft** is only for an open time form.

The source now includes `run-week`, which accepts a real weekly JSON work record, launches the local extension runner, and returns JSON with saved ticket/time verification results. It can start from any signed-in ConnectWise page: the runner opens **Service Desk > Service Board** when needed, searches for an existing ticket, and then opens New Ticket from the board if no exact match exists. If the selected page is a ConnectWise pop-out without the main navigation, it opens the main app in a separate tab. First select the ConnectWise tab through the extension popup's **Use this ConnectWise tab for weekly runs** button. Then run:

```powershell
node src/agent-cli.mjs run-week --input .local/week.json --extension-id <Brave extension ID>
```

The extension ID is shown at `brave://extensions` with Developer mode on. An agent can pass `--tab-id <browser tab ID>` instead of the saved tab selection. The command uses Brave installed at `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe` by default; `--browser <path>` overrides it. The CLI listens only on `127.0.0.1` for the duration of the job and exchanges the plan/result with the extension using a one-time token. The weekly sample is `exampleOnly` and is refused by `run-week`.

The popup's **Prepare Time Draft** button is for an already open blank New Time Entry. It does not create a ticket or start the weekly runner. Open the intended ticket's blank time form, enter one time record in the popup, and click the button. The popup reads the assigned ticket number from ConnectWise's Charge To field. Review every field in ConnectWise before clicking Save & Return yourself. If the popup lists Work Type, Work Role, or Billable, choose that value manually in ConnectWise. The extension uses Brave's debugger input channel to enter Notes as browser text and verifies that the editor remains visible with the exact text. The user confirmed that version 0.3.0 filled the live form including Notes. If Notes fails, the extension stops and does not save; **Copy Notes** remains an emergency fallback.

Version 0.8.0 adds **Save time on current ticket**. From a saved ticket's Ticket or Time tab, enter the actual date, start/end, work type, work role, billable choice, and Notes in the popup. The runner identifies that ticket, checks its configured Company and Site, checks the ticket's Time list for an identical entry, saves and verifies `Working Issue Now`, opens New Time Entry, saves one entry, and verifies its Time row. An existing identical row stops without changing ticket status. The optional **Complete ticket after saving this entry** checkbox then saves and verifies `Completed`. The separate **Prepare Time Draft** button remains for an already open blank form. This current-ticket browser path is source-implemented but has not yet been confirmed by a live saved ConnectWise run.

Version 0.8.1 accepts saved ticket views where the Status row label has a different separator or extra required marker. A stopped current-ticket run now reports the exact step and ticket frame control counts, so the next browser mismatch can be diagnosed without guessing whether a save occurred.

Version 0.8.2 reads `Working Issue Now` from the ticket status control even when ConnectWise's row label is ambiguous. This addresses a live current-ticket run that stopped at `verify-working-status` although the user screenshot showed ticket #1715256 in `Working Issue Now`. It still requires a live retry to establish that the runner reaches and verifies the saved Time row.

Version 0.8.3 waits for the ticket frame to settle before switching to Time, verifies the complete Time list before clicking New Time Entry, and avoids an extra reload when the ticket status is already visible and correct. This addresses a live run that stopped at `open-new-time-entry` after status verification. A real saved Time row is still unverified.

Version 0.8.4 carries the verified Time row count from before Save into post-save verification. ConnectWise can leave the saved Time Entry form open; the runner opens the Time list only after that count increases, then verifies the exact row there. If a baseline count was unavailable, it requires a save confirmation before navigating. An unchanged badge is not accepted as proof of a new record. A retry that finds an identical saved row does not save it again and can finish the ticket when **Complete ticket after saving this entry** is selected. The user also identified an optional shorter completion route through the Time Entry form's Ticket Status field; keep the separate status transition until that combined save and both resulting records are verified live.

Version 0.8.5 sends a browser-level mouse press and release to Save & Return after verifying the filled Time form. The prior synthetic DOM click left the form open and its Time badge unchanged in the user's live run. The runner now reports an unchanged badge explicitly instead of implying that a time entry may have saved. The trusted Save click and resulting record still need a live retry.

Version 0.8.6 opens Service Desk through browser-level hover, then selects Service Board with a browser-level click. This addresses a live ticket run that stopped before searching for `DPHES - Copier Jams Repeating` because a synthetic click did not open the hover menu. Reload the extension before retrying. No ticket was verified as created in that stopped run.

The user manually saved that previously open form and confirmed ticket #1715256's Time badge increased from 1 to 2. This is evidence of a manual save only. Automated Save, saved-row field verification, and completion remain unverified in a live run.

If the extension was already loaded, click Reload in `brave://extensions` before retrying after a code update. Version 0.3.0 adds the `debugger` permission; Brave may ask you to accept the changed permission or display a debugging notice while Notes is entered. Keep a copy of unsent notes before reloading; the popup does not store them.

The inspector remains under **Inspect form controls**. It reads identifiers, not field values. Browser actions for duplicate search, ticket creation, individual time saves, and completion are implemented in source but have not yet passed a real saved end-to-end ConnectWise run. `capabilities.browserSubmission` therefore remains `false`. The runner stops when it cannot verify a search, field, saved row, or status. No login credentials go in these files.

Version 0.8.21 follows a live report that the final completion click opened Bitwarden. Saved-ticket Save now activates the unique visible .cw_ToolbarButton_Save element directly in the verified ticket document, without browser-coordinate mouse input. It checks the committed status and closed picker, arms a fresh confirmation observer, activates once, and retains the existing confirmation/reload verification. Time Save & Return and status-option input keep their existing paths. Live completion remains unverified; reuse the existing ticket and exact saved time entry on retry.


Version 0.8.22 follows an exact live error showing debugger input blocked by another extension with no removable frame. Saved-ticket Status search and exact option selection now use page-element events, without debugger attachment or coordinate clicks; committed value and closed picker are still required before the exact-element Save. The popup reports the loaded background version and Save method; stopped background actions identify their build, action, and status/save stage. Production completion remains unverified. Retry the same ticket and original entry to preserve duplicate checks.


Version 0.8.23 reverts page-generated saved Status selection after a live run left Working Issue Now unchanged. Saved Status uses the guarded browser-input path again. Foreign-popup recovery now traverses open and closed shadow roots using chrome.dom.openOrClosedShadowRoot, parking only extension iframe host elements. Final Save retains exact-element activation without coordinate clicks. A closed-shadow popup is an inferred blocker until the next live retry; production completion remains unverified.


Version 0.8.24 collapses Weekly ticket and time run and Time on the current ticket into native keyboard-accessible disclosure sections, closed by default. Existing field IDs and saved draft behavior are retained. To share the standalone helper, send only the extension folder; the recipient must change owner in their copy of extension/ticket-settings.json to their exact ConnectWise display name, load that folder unpacked, and sign in with their own account. Assign Me uses the signed-in account and the configured owner is verified afterward. Do not distribute .local, browser profiles, user exports, or real work JSON. Current defaults target Democracy Prep; other companies require their own verified defaults. Production completion is still unverified.


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


Version 0.8.42 shows checking, green JSON valid, or red JSON invalid immediately below Validate JSON. JSON editors remain two lines with scrolling; work notes/descriptions retain auto-growth. A popup browser check exercises invalid/valid input, Run enablement, and capped editor height.

Version 0.8.43 allows creation after a verified zero-result title-reference lookup, including number-to-title fallback. Open matches are preferred; if none are open, closed matches are returned to prevent duplicate creation (one reused, multiple stop). New titles retain the reference text. Creation repeats reference and exact-title duplicate checks. Lookup failures and ambiguous matches still stop. The user's live run verified tickets 1727818, 1727819, and 1727822 before stopping; do not duplicate their time.


Version 0.8.44 addresses Assign Me not taking effect on imported ticket 1725615. Assignment/section clicks now attach before measuring, account for iframe scaling, wait for a stable position, and verify the browser hit target before mouse press. Owner readback is required before Save; unchanged ownership stops without a save or time entry. A scaled-frame Brave fixture verifies Assign Me after a layout shift. Actual imported-ticket reassignment remains unverified. The user's already verified tickets include 1727818, 1727819, 1727822, 1727829, and 1727832; retain their saved time.


Version 0.8.45 uses the saved Ticket Owner dropdown when a ticket already has another owner. Assign Me is used only for blank/Unassigned ownership. Both paths require owner readback before Save and persistence after reload. Owner dropdown selection uses guarded browser input and waits for the picker to close. The user confirmed Assign Me does not replace existing ownership. Live reassignment still needs verification.

Version 0.8.46 adds one recovery for a missing requested owner option on an already-owned ticket: add the signed-in resource using guarded Assign Me, then retry explicit owner selection once. Assign Me is not treated as proof of reassignment. Owner readback, Save, and reload verification remain required. The source regression verifies resource addition, explicit choice, save, and reload sequencing; this recovery needs live verification. Live results now verify 1725615/T-52629 and 1727852/T-52624, with T-52625/1725539 stopped before time.


Version 0.8.47 keeps foreign-popup monitoring active across the complete owner-assignment action, including popups introduced by field focus after debugger attachment, and restores popup frames afterward. An isolated two-extension Brave fixture verified a newly introduced closed-shadow popup is parked and restored. Live recovery remains unverified. See timesheets.md for the agent JSON guide, including lunch as an additional Payroll Wrap entry on a work ticket.

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

Newly validated plans for Democracy Prep Public Schools resolve these school acronyms to exact ConnectWise Sites: HPHS = Harlem Prep High School; HPMS = Harlem Prep Middle School; DPEES = Democracy Prep Endurance Elementary School; DPEHS = Democracy Prep Endurance High School; DPHES = Democracy Prep Harlem Elementary School; DPHMS = Democracy Prep Harlem Middle School; DPHHS = Democracy Prep Harlem High School; BPHS = Bronx Prep High School; BPMS = Bronx Prep Middle School; DPCHS = Democracy Prep Charter High School.

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

Open a CW Service Board list with the top Location, Business Unit and Service Board selectors set to View All. In IIQ Rake, choose that CW tab and an authenticated IIQ tab, enter your Resources search pattern (Natural uses `*ncarr*`), then Scan & preview changes. The Resources pattern is saved locally and is editable for coworkers. Newest means highest CW ticket numbers, not last handled in helper history.

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

## 0.12.0

Replace built-in school acronyms with Company-scoped mappings in Settings. Add, edit, remove and export mappings. Remove client-specific Site guards and bundled example acronyms. Existing saved plans remain unchanged.
