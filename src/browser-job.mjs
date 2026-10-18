import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const limit = 1024 * 1024;

export async function runBrowserJob(plan, { extensionId, browserPath, tabId, launchBrowser,
  kind = 'week' } = {}) {
  if (plan?.exampleOnly || (kind === 'week' ? !Array.isArray(plan?.tickets) : !plan?.ticket)) {
    throw new Error(`Only a validated, non-example ${kind === 'week' ? 'weekly' : 'ticket'} plan can be submitted.`);
  }
  if (!['week', 'ticket'].includes(kind)) throw new Error('Unsupported browser job kind.');
  if (!/^[a-p]{32}$/.test(extensionId || '')) {
    throw new Error(`run-${kind} requires --extension-id <32-character Brave extension ID>.`);
  }
  if (tabId !== undefined && (!Number.isSafeInteger(tabId) || tabId <= 0)) {
    throw new Error('--tab-id must be a positive integer.');
  }
  const brave = browserPath || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
  if (!launchBrowser) await access(brave);
  const token = randomBytes(32).toString('hex');
  const origin = `chrome-extension://${extensionId}`;
  let complete;
  const completed = new Promise((resolve) => { complete = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const authorized = url.searchParams.get('token') === token && request.headers.origin === origin;
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    if (!authorized) { response.writeHead(403).end(); return; }
    if (request.method === 'GET' && url.pathname === '/job') {
      response.setHeader('Content-Type', 'application/json');
      response.writeHead(200).end(JSON.stringify({ plan }));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/result') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
        if (body.length > limit) request.destroy();
      });
      request.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (!result || typeof result.ok !== 'boolean') throw new Error('Invalid runner result.');
          response.writeHead(204).end();
          complete(result);
        } catch { response.writeHead(400).end(); }
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    const params = new URLSearchParams({ port: String(address.port), token });
    if (tabId) params.set('tabId', String(tabId));
    const runnerPage = kind === 'ticket' ? 'ticket-runner.html' : 'runner.html';
    const runnerUrl = `${origin}/${runnerPage}#${params}`;
    if (launchBrowser) await launchBrowser(runnerUrl);
    else {
      const child = spawn(brave, [runnerUrl], { detached: true, stdio: 'ignore' });
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      child.unref();
    }
    const timeout = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser run did not report a result within 15 minutes. Check the Brave runner tab.')), 900000);
      timer.unref();
    });
    return await Promise.race([completed, timeout]);
  } finally {
    server.close();
  }
}

export function runTicketBrowserJob(plan, options) {
  return runBrowserJob(plan, { ...options, kind: 'ticket' });
}
