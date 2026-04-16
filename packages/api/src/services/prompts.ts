import fs from 'node:fs';
import path from 'node:path';

export interface Prompts {
  system: string;
  rules: string;
  user: string;
}

export function loadPrompts(promptsDir: string): Prompts {
  const systemPath = path.join(promptsDir, 'SYSTEM.md');
  if (!fs.existsSync(systemPath)) {
    throw new Error(`Prompt file missing: SYSTEM.md in ${promptsDir}`);
  }

  const system = fs.readFileSync(systemPath, 'utf8').trim();
  const rulesPath = path.join(promptsDir, 'RULES.md');
  const rules = fs.existsSync(rulesPath)
    ? fs.readFileSync(rulesPath, 'utf8').trim()
    : '';
  const userPath = path.join(promptsDir, 'USER.md');
  const user = fs.existsSync(userPath)
    ? fs.readFileSync(userPath, 'utf8').trim()
    : '';

  return { system, rules, user };
}
