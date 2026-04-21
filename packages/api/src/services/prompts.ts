import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';

export interface Prompts {
  system: string;
  tools: string;
  rules: string;
  live: string;
  tts: string;
}

export interface PromptsRef {
  current: Prompts;
}

function readIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
}

export function loadPrompts(systemsDir: string): Prompts {
  const system = readIfExists(path.join(systemsDir, 'SYSTEM.md'));
  if (!system) {
    throw new Error(`SYSTEM.md missing in ${systemsDir}`);
  }
  const tools = readIfExists(path.join(systemsDir, 'TOOLS.md'));
  const rules = readIfExists(path.join(systemsDir, 'RULES.md'));
  const live = readIfExists(path.join(systemsDir, 'LIVE.md'));
  const tts = readIfExists(path.join(systemsDir, 'TTS.md'));
  return { system, tools, rules, live, tts };
}

export function bootstrapPrompts(systemsDir: string, defaultsDir: string): void {
  if (!fs.existsSync(systemsDir)) {
    fs.mkdirSync(systemsDir, { recursive: true });
  }
  for (const file of ['SYSTEM.md', 'TOOLS.md', 'RULES.md', 'LIVE.md', 'TTS.md']) {
    const target = path.join(systemsDir, file);
    const source = path.join(defaultsDir, file);
    if (!fs.existsSync(target) && fs.existsSync(source)) {
      fs.copyFileSync(source, target);
    }
  }
}

export function createPromptsWatcher(
  systemsDir: string,
  onChange: (p: Prompts) => void,
): () => void {
  const watcher = chokidar.watch(path.join(systemsDir, '*.md'), {
    ignoreInitial: true,
  });
  const reload = () => {
    try {
      onChange(loadPrompts(systemsDir));
    } catch (err) {
      console.warn('[api] prompts reload failed:', (err as Error).message);
    }
  };
  watcher.on('add', reload);
  watcher.on('change', reload);
  watcher.on('unlink', reload);
  return () => { void watcher.close(); };
}
