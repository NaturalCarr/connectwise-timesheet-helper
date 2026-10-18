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
