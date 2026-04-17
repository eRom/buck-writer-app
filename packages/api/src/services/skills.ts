import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { watch } from 'chokidar';

export interface Skill {
  name: string;
  description: string;
  body: string;
}

/** Parse a SKILL.md file content. Returns null if invalid. */
export function parseSkillMd(content: string): Skill | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch || !descMatch) return null;

  const name = nameMatch[1].trim();
  const description = descMatch[1].trim();

  if (!name || !description) return null;

  return { name, description, body };
}

/** Load all skills from workspace/skills/. Returns Map<name, Skill>. */
export async function loadSkills(workspaceDir: string): Promise<Map<string, Skill>> {
  const skills = new Map<string, Skill>();
  const skillsDir = path.join(workspaceDir, 'skills');

  try {
    await fs.access(skillsDir);
  } catch {
    return skills;
  }

  const entries = await fs.readdir(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    try {
      const content = await fs.readFile(skillFile, 'utf8');
      const skill = parseSkillMd(content);
      if (skill) {
        skills.set(skill.name, skill);
      }
    } catch {
      // Skip missing or unreadable files
    }
  }

  return skills;
}

/** Watch skills/ for changes, call onReload when changed. */
export function createSkillsWatcher(
  workspaceDir: string,
  onReload: (skills: Map<string, Skill>) => void,
): { close: () => Promise<void> } {
  const skillsDir = path.join(workspaceDir, 'skills');

  const watcher = watch(skillsDir, {
    depth: 2,
    ignoreInitial: true,
  });

  const reload = async () => {
    const skills = await loadSkills(workspaceDir);
    onReload(skills);
  };

  watcher.on('add', reload);
  watcher.on('change', reload);
  watcher.on('unlink', reload);
  watcher.on('addDir', reload);
  watcher.on('unlinkDir', reload);

  return {
    close: () => watcher.close(),
  };
}
