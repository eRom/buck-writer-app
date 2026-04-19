import type { McpToolDef, ToolDef } from '../../lib/openai.js';
import type { RealtimeVoice, TurnDetectionConfig } from '@buck/shared';

export interface BuildSessionConfigInput {
  voice: RealtimeVoice;
  turnDetection: TurnDetectionConfig;
  tools: { bible: boolean; writingTools: boolean; webSearch: boolean };
  mcpTools: McpToolDef[];
  systemPrompt: string;
  livePrompt: string;
  sessionSnapshot: string;
}

export interface RealtimeSessionUpdatePayload {
  type: 'session.update';
  session: {
    instructions: string;
    voice: RealtimeVoice;
    modalities: ['audio', 'text'];
    input_audio_transcription: { model: 'gpt-4o-transcribe' };
    turn_detection: {
      type: TurnDetectionConfig['mode'];
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
      interrupt_response: boolean;
    };
    tools?: ToolDef[];
  };
}

export function buildSessionConfig(input: BuildSessionConfigInput): RealtimeSessionUpdatePayload {
  const instructions = [
    input.systemPrompt.trim(),
    input.livePrompt.trim(),
    input.sessionSnapshot.trim() ? `# Contexte conversation en cours\n${input.sessionSnapshot.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  const tools: ToolDef[] = [];
  const enabledLabels = new Set<string>();
  if (input.tools.bible) enabledLabels.add('bible');
  if (input.tools.writingTools) enabledLabels.add('writing-tools');

  for (const mcp of input.mcpTools) {
    if (!enabledLabels.has(mcp.server_label)) continue;
    tools.push({ ...mcp, require_approval: 'never' });
  }

  if (input.tools.webSearch) tools.push({ type: 'web_search' });

  tools.push({
    type: 'function',
    name: 'write_to_chat',
    description: "Écrit un message assistant dans le chat texte de la session courante.",
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['content'],
      properties: {
        content: { type: 'string', description: 'Contenu markdown du message.' },
      },
    },
    strict: true,
  });

  return {
    type: 'session.update',
    session: {
      instructions,
      voice: input.voice,
      modalities: ['audio', 'text'],
      input_audio_transcription: { model: 'gpt-4o-transcribe' },
      turn_detection: {
        type: input.turnDetection.mode,
        threshold: input.turnDetection.threshold,
        prefix_padding_ms: input.turnDetection.prefix_padding_ms,
        silence_duration_ms: input.turnDetection.silence_duration_ms,
        interrupt_response: input.turnDetection.interrupt_response,
      },
      tools,
    },
  };
}
