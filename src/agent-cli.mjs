import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import { planWeek, planDay, planWorkItem, planTicket } from './plan.mjs';
import { buildServiceRosterCsv, inspectGoogleContactsCsv, inspectWorkspaceUsersCsv } from './google-contacts.mjs';
import { lookupServiceUser } from './roster.mjs';
import { runBrowserJob, runTicketBrowserJob } from './browser-job.mjs';

const protocolVersion = '1.0';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1]) throw new Error(`${name} requires a value.`);
  return args[index + 1];
}

async function readJson(path) {
  const text = path === '-'
    ? await new Promise((resolveText, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => resolveText(data));
      process.stdin.on('error', reject);
    })
    : await readFile(path, 'utf8');
  return JSON.parse(text);
}

try {
  if (command === 'capabilities') {
    console.log(JSON.stringify({
      protocolVersion,
      ok: true,
      capabilities: {
        ticketPlanning: true,
        ticketOnlyPlanning: true,
        timeEntryPlanning: true,
        weeklyPlanning: true,
        dailyBatchPlanning: true,
        dailyEndOfDayReport: 'source_only',
        googleContactsCsvInspection: true,
        workspaceUsersCsvInspection: true,
        localServiceRoster: true,
        serviceUserLookup: true,
        browserFormInspection: true,
        browserTimeDraftFill: 'partial_live',
        browserTicketOnlyRun: 'source_only',
        browserDailyTicketRun: 'source_only',
        browserSubmission: false
      }
    }));
  } else if (command === 'lookup-user') {
    const rosterPath = option('--roster');
    const query = option('--query');
    if (!rosterPath || !query) throw new Error('lookup-user requires --roster <path> --query <full name or email>.');
    const roster = await readJson(rosterPath);
    console.log(JSON.stringify({ protocolVersion, ok: true, lookup: lookupServiceUser(roster, query) }));
  } else if (command === 'build-roster') {
    const inputPath = option('--input');
    const outputPath = option('--output');
    if (!inputPath || !outputPath) throw new Error('build-roster requires --input <Google Admin CSV> --output <path in .local>.');
    const localRoot = resolve(root, '.local');
    const destination = resolve(outputPath);
    if (!destination.startsWith(localRoot + sep)) throw new Error('Roster output must be inside this project’s .local directory.');
    const roster = buildServiceRosterCsv(await readFile(inputPath, 'utf8'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(roster, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ protocolVersion, ok: true, rosterSummary: {
      output: destination,
      userCount: roster.users.length,
      mappedUsers: roster.users.filter((user) => user.acronym).length,
      acronyms: [...new Set(roster.users.map((user) => user.acronym).filter(Boolean))].sort()
    } }));
  } else if (command === 'inspect-contacts' || command === 'inspect-users') {
    const inputPath = option('--input');
    if (!inputPath || inputPath === '-') throw new Error(`${command} requires --input <Google CSV path>.`);
    const csv = await readFile(inputPath, 'utf8');
    console.log(JSON.stringify({ protocolVersion, ok: true, contactsProfile: command === 'inspect-users'
      ? inspectWorkspaceUsersCsv(csv) : inspectGoogleContactsCsv(csv) }));
  } else if (command === 'run-week' || command === 'run-day' || command === 'run-ticket') {
    const inputPath = option('--input');
    if (!inputPath) throw new Error(`${command} requires --input <JSON path or ->.`);
    const settingsPath = option('--settings') || resolve(root, 'ticket-settings.json');
    const [item, settings] = await Promise.all([readJson(inputPath), readJson(settingsPath)]);
    const plan = command === 'run-day' ? planDay(item, settings) : command === 'run-week' ? planWeek(item, settings) : planTicket(item, settings);
    if (plan.exampleOnly) throw new Error('Example-only work cannot be submitted.');
    const tab = option('--tab-id');
    try {
      const result = await (command !== 'run-ticket' ? runBrowserJob : runTicketBrowserJob)(plan, {
        extensionId: option('--extension-id'), browserPath: option('--browser') || undefined,
        tabId: tab ? Number(tab) : undefined
      });
      console.log(JSON.stringify({ protocolVersion, ok: result.ok, execution: result }));
      if (!result.ok) process.exitCode = 3;
    } catch (error) {
      console.log(JSON.stringify({ protocolVersion, ok: false,
        execution: { ok: false, error: error.message } }));
      process.exitCode = 3;
    }
  } else if (command === 'plan' || command === 'plan-day' || command === 'plan-week' || command === 'plan-ticket') {
    const inputPath = option('--input');
    if (!inputPath) throw new Error(`${command} requires --input <path or ->.`);
    const settingsPath = option('--settings') || resolve(root, 'ticket-settings.json');
    const [item, settings] = await Promise.all([readJson(inputPath), readJson(settingsPath)]);
    console.log(JSON.stringify({ protocolVersion, ok: true, plan: command === 'plan-day' ? planDay(item, settings) : command === 'plan-week'
      ? planWeek(item, settings) : command === 'plan-ticket'
        ? planTicket(item, settings) : planWorkItem(item, settings) }));
  } else {
    throw new Error('Use: capabilities | inspect-contacts | inspect-users --input <Google CSV path> | build-roster --input <CSV> --output <path in .local> | lookup-user --roster <path> --query <name or email> | plan | plan-ticket | plan-week --input <path or -> [--settings <path>] | run-ticket | run-week --input <JSON> --extension-id <id>.');
  }
} catch (error) {
  console.log(JSON.stringify({
    protocolVersion,
    ok: false,
    error: { code: 'INPUT_ERROR', message: error.message }
  }));
  process.exitCode = 2;
}

