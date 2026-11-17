import { validateSchoolMappings, settingsWithJsonSchools } from './school-mappings.mjs';
export const configKey = 'helperSettings:ticketDefaults';
export const configFields = ["company","site","contact","board","status","completedStatus","type","subtype","priority","agreement","source"];
export function validateDefaults(value) {
  const result = {};
  for (const key of configFields) {
    if (typeof value[key] !== 'string' || !value[key].trim()) throw new Error(key + ' is required.');
    result[key] = value[key].trim();
  }
  result.schoolMappings=validateSchoolMappings(value.schoolMappings);
  return result;
}
export async function configuredDefaults(base, storage = chrome.storage.local) {
  const saved = (await storage.get(configKey))[configKey];
  return saved ? { ...base, ...validateDefaults(saved) } : base;
}
export async function rememberJsonSchools(record,settings,storage=chrome.storage.local) {
 if(record.exampleOnly===true)return 0;
 const saved=(await storage.get(configKey))[configKey];
 const current=saved?{...settings,...validateDefaults(saved)}:settings;
 const updated=settingsWithJsonSchools(record,current);
 const added=updated.schoolMappings.length-(current.schoolMappings||[]).length;
 if(added)await storage.set({[configKey]:validateDefaults(updated)});
 return added;
}
