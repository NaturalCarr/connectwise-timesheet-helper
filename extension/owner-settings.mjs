import { configuredDefaults } from './config-settings.mjs';
export const ownerKey = 'helperSettings:ticketOwner';

export async function requireTicketOwner(storage = chrome.storage.local) {
  const saved = (await storage.get(ownerKey))[ownerKey];
  if (typeof saved !== 'string' || !saved.trim()) {
    throw new Error('Enter and save Ticket Owner at the top of the extension before running work.');
  }
  return saved.trim();
}

export async function withTicketOwner(settings) {
  return { ...await configuredDefaults(settings), owner: await requireTicketOwner() };
}

export async function applyTicketOwner(plan) {
  const owner = await requireTicketOwner();
  if (plan.ticket) plan.ticket.owner = owner;
  for (const item of plan.tickets || []) item.ticket.owner = owner;
  for (const step of plan.steps || []) {
    if (step.action === 'set-ticket-owner-and-verify') step.owner = owner;
  }
  return plan;
}
