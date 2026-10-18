import { readFile } from 'node:fs/promises';
import { planWorkItem } from './plan.mjs';

const [settingsPath, itemPath] = process.argv.slice(2);
if (!settingsPath || !itemPath) {
  console.error('Usage: node src/plan-cli.mjs <ticket-settings.json> <work-item.json>');
  process.exitCode = 2;
} else {
  try {
    const [settings, item] = await Promise.all([
      readFile(settingsPath, 'utf8').then(JSON.parse),
      readFile(itemPath, 'utf8').then(JSON.parse)
    ]);
    console.log(JSON.stringify(planWorkItem(item, settings), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
