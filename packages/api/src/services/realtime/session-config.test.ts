import { describe, it, expect } from 'vitest';
import { buildSessionConfig } from './session-config.js';
import type { McpToolDef } from '../../lib/openai.js';

const mcpTools: McpToolDef[] = [
  { type: 'mcp', server_label: 'bible', server_url: 'https://bible/', require_approval: 'always' },
  { type: 'mcp', server_label: 'writing-tools', server_url: 'https://wt/' },
];

const baseInput = {
  voice: 'coral' as const,
  turnDetection: { mode: 'server_vad' as const, threshold: 0.5, prefix_padding_ms: 500, silence_duration_ms: 500, interrupt_response: true },
  systemPrompt: '',
  livePrompt: '',
  sessionSnapshot: '',
  mcpTools,
};

describe('buildSessionConfig', () => {
  it('inject instructions = systemPrompt + livePrompt + snapshot', () => {
    const cfg = buildSessionConfig({
      ...baseInput,
      tools: { bible: true, writingTools: true, webSearch: true },
      systemPrompt: 'SYS', livePrompt: 'LIVE', sessionSnapshot: '[user]: salut\n[assistant]: bonjour',
    });
    expect(cfg.session.instructions).toContain('SYS');
    expect(cfg.session.instructions).toContain('LIVE');
    expect(cfg.session.instructions).toContain('salut');
  });

  it('force require_approval=never sur tous les MCP', () => {
    const cfg = buildSessionConfig({ ...baseInput, tools: { bible: true, writingTools: true, webSearch: false } });
    const mcps = cfg.session.tools!.filter((t) => t.type === 'mcp') as McpToolDef[];
    expect(mcps).toHaveLength(2);
    expect(mcps.every((t) => t.require_approval === 'never')).toBe(true);
  });

  it('filtre MCP selon toggles (bible off)', () => {
    const cfg = buildSessionConfig({ ...baseInput, tools: { bible: false, writingTools: true, webSearch: false } });
    const labels = (cfg.session.tools!.filter((t) => t.type === 'mcp') as McpToolDef[]).map((t) => t.server_label);
    expect(labels).toEqual(['writing-tools']);
  });

  it('ajoute web_search si toggle on', () => {
    const cfg = buildSessionConfig({ ...baseInput, tools: { bible: false, writingTools: false, webSearch: true } });
    expect(cfg.session.tools!.some((t) => t.type === 'web_search')).toBe(true);
  });

  it('inclut write_to_chat function tool toujours', () => {
    const cfg = buildSessionConfig({ ...baseInput, mcpTools: [], tools: { bible: false, writingTools: false, webSearch: false } });
    expect(cfg.session.tools!.some(
      (t) => t.type === 'function' && (t as { name?: string }).name === 'write_to_chat',
    )).toBe(true);
  });

  it('input_audio_transcription en gpt-4o-transcribe', () => {
    const cfg = buildSessionConfig({ ...baseInput, mcpTools: [], tools: { bible: false, writingTools: false, webSearch: false } });
    expect(cfg.session.input_audio_transcription).toEqual({ model: 'gpt-4o-transcribe' });
  });

  it('voice et turn_detection passés', () => {
    const cfg = buildSessionConfig({ ...baseInput, mcpTools: [], tools: { bible: false, writingTools: false, webSearch: false } });
    expect(cfg.session.voice).toBe('coral');
    expect(cfg.session.turn_detection.type).toBe('server_vad');
    expect(cfg.session.turn_detection.threshold).toBe(0.5);
  });
});
