export const configKey = 'helperSettings:ticketDefaults';
export const configFields = ["company","site","contact","board","status","completedStatus","type","subtype","priority","agreement","source"];
export function validateDefaults(value) {
  const result = {};
  for (const key of configFields) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(key + ' is required.');
    result[key] = value[key].trim();
  }
  return result;
}
export async function configuredDefaults(base, storage = chrome.storage.local) {
  const saved = (await storage.get(configKey))[configKey];
  return saved ? { ...base, ...validateDefaults(saved) } : base;
}
