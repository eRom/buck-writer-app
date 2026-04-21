/**
 * Extract plaintext from a message's contentJson for TTS.
 *
 * Supported shapes (matching the chat + realtime persistence paths):
 * - `{"text":"..."}` (chat route, buddy of chat-stream.tsx parse logic)
 * - `"..."` (a JSON-stringified raw string — realtime / voice-injected)
 * - Array of parts `[{type, text}]` (Responses API style, future-proof)
 *
 * Returns the concatenated trimmed text, or an empty string when no text
 * payload is present (pure tool-calls, empty messages).
 */
export function messageToPlaintext(contentJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return contentJson.trim();
  }

  if (typeof parsed === 'string') return parsed.trim();

  if (Array.isArray(parsed)) {
    return parsed
      .filter((p): p is { type: string; text?: string } =>
        typeof p === 'object' && p !== null && 'type' in p,
      )
      .filter((p) =>
        p.type === 'text' ||
        p.type === 'input_text' ||
        p.type === 'output_text',
      )
      .map((p) => p.text ?? '')
      .join('\n')
      .trim();
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as { text?: unknown; content?: unknown };
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.content === 'string') return obj.content.trim();
  }

  return '';
}
