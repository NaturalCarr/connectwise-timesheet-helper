# Agent instructions

Read README.md and docs/AGENT_PROTOCOL.md before edits or browser operation. See docs/AGENTS.md for preparing work JSON.

- Preserve the user's work facts. Never invent tasks, time, results or school mappings.
- Keep JSON model independent. Check node src/agent-cli.mjs capabilities for the CLI contract; do not confuse CLI capability flags with verified extension behavior.
- Use the visible signed-in browser. No ConnectWise API or Claude integration.
- Find existing tickets before creation. Ambiguous matches stop. Check exact time duplicates before each save. Clear email recipients unless explicitly requested.
- Report saved records only after ID, saved row or status readback verifies them. Keep source tests separate from live saves.
- IIQ Rake is one-way (IIQ to CW). Search the current CW backlog by the user-configured Resources pattern. Ignore Pending Closure, Completed and Closed at collection, preview and apply. Preserve the preview and manual choices when replacing valid browser tabs; recheck assignment, identity and statuses before each Save. Keep diagnostics copy buttons usable during active runs. Never create tickets or time in a rake run.
- School acronym mappings are user-managed in Settings and scoped by Company; no school list is built in. Select the configured exact Site and let CW populate its address. Never infer mappings or change notifications.
- Keep real settings, credentials, user directories, captured pages and browser profiles out of Git. Do not delete .local.
- Release ZIPs contain the sanitized extension files with fictional defaults. Update manifest, helper build, install instructions and current docs together. Run relevant tests before committing or publishing.

- Keep README.md focused on features, installation and usage. Put version-by-version implementation notes in CHANGELOG.md or GitHub Releases; Git commits retain source history. Preserve the contributor credits.

- Validated non-example JSON can add explicit school/site pairs under the configured Company. Never infer missing names or overwrite conflicts. Persist mappings only after the whole import validates.
