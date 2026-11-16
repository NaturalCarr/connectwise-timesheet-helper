# Agent instructions

Read README.md and docs/AGENT_PROTOCOL.md before edits or browser operation. See docs/AGENTS.md for preparing work JSON.

- Preserve the user's work facts. Never invent tasks, time, results or school mappings.
- Keep JSON model independent. Check node src/agent-cli.mjs capabilities for the CLI contract; do not confuse CLI capability flags with verified extension behavior.
- Use the visible signed-in browser. No ConnectWise API or Claude integration.
- Find existing tickets before creation. Ambiguous matches stop. Check exact time duplicates before each save. Clear email recipients unless explicitly requested.
- Report saved records only after ID, saved row or status readback verifies them. Keep source tests separate from live saves.
- IIQ Rake is one-way (IIQ to CW). Search the current CW backlog by the user-configured Resources pattern. Ignore Pending Closure, Completed and Closed at collection, preview and apply. Preserve the preview and manual choices when replacing valid browser tabs; recheck assignment, identity and statuses before each Save. Keep diagnostics copy buttons usable during active runs. Never create tickets or time in a rake run.
- Select only confirmed exact school Site mappings and let CW populate the address. Do not infer mappings or change notifications.
- Keep real settings, credentials, user directories, captured pages and browser profiles out of Git. Do not delete .local.
- Release ZIPs contain the sanitized extension files with fictional defaults. Update manifest, helper build, install instructions and current docs together. Run relevant tests before committing or publishing.
