import { describe, it, expect, afterEach } from 'vitest';
import { loadSkills, parseSkillMd } from './skills.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('parseSkillMd', () => {
  it('parses valid SKILL.md with frontmatter', () => {
    const content = `---
name: research
description: Deep research skill
---
# Research

Use this skill to research topics.`;

    const result = parseSkillMd(content);
    expect(result).toEqual({
      name: 'research',
      description: 'Deep research skill',
      body: '# Research\n\nUse this skill to research topics.',
    });
  });

  it('returns null for invalid frontmatter', () => {
    expect(parseSkillMd('no frontmatter here')).toBeNull();
    expect(parseSkillMd('---\nname: test\n')).toBeNull();
  });

  it('returns null for missing name', () => {
    const content = `---
description: A skill without a name
---
Body text`;

    expect(parseSkillMd(content)).toBeNull();
  });

  it('returns null for missing description', () => {
    const content = `---
name: orphan
---
Body text`;

    expect(parseSkillMd(content)).toBeNull();
  });
});

describe('loadSkills', () => {
  it('loads skills from skills/ directory', async () => {
    const dir = await makeTmpDir();
    const skillDir = path.join(dir, 'skills', 'research');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: research
description: Research skill
---
# Research`,
      'utf8',
    );

    const skills = await loadSkills(dir);
    expect(skills.size).toBe(1);
    expect(skills.get('research')).toEqual({
      name: 'research',
      description: 'Research skill',
      body: '# Research',
    });
  });

  it('returns empty map if skills/ does not exist', async () => {
    const dir = await makeTmpDir();
    const skills = await loadSkills(dir);
    expect(skills.size).toBe(0);
  });

  it('ignores invalid SKILL.md files', async () => {
    const dir = await makeTmpDir();
    const skillDir = path.join(dir, 'skills', 'broken');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'no frontmatter', 'utf8');

    const skills = await loadSkills(dir);
    expect(skills.size).toBe(0);
  });

  it('loads multiple skills', async () => {
    const dir = await makeTmpDir();

    for (const name of ['alpha', 'beta']) {
      const skillDir = path.join(dir, 'skills', name);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: ${name}
description: ${name} skill
---
Body of ${name}`,
        'utf8',
      );
    }

    const skills = await loadSkills(dir);
    expect(skills.size).toBe(2);
    expect(skills.has('alpha')).toBe(true);
    expect(skills.has('beta')).toBe(true);
  });
});
