import { describe, it, expect } from 'vitest';
import { messageToPlaintext } from './plaintext.js';

describe('messageToPlaintext', () => {
  it('extracts text from {text: "..."} (chat shape)', () => {
    expect(messageToPlaintext(JSON.stringify({ text: 'hello world' }))).toBe('hello world');
  });

  it('returns the raw string for JSON-stringified string (realtime shape)', () => {
    expect(messageToPlaintext(JSON.stringify('bonjour'))).toBe('bonjour');
  });

  it('falls back to raw content when JSON is malformed', () => {
    expect(messageToPlaintext('not json at all')).toBe('not json at all');
  });

  it('concatenates text parts from an array payload', () => {
    const arr = [
      { type: 'text', text: 'Hello' },
      { type: 'input_text', text: ' there' },
      { type: 'tool_call', tool: 'foo' },
      { type: 'output_text', text: '!' },
    ];
    expect(messageToPlaintext(JSON.stringify(arr))).toBe('Hello\n there\n!');
  });

  it('returns empty string for an array of only tool calls', () => {
    const arr = [
      { type: 'tool_call', tool: 'foo' },
      { type: 'tool_result', result: 'bar' },
    ];
    expect(messageToPlaintext(JSON.stringify(arr))).toBe('');
  });

  it('trims whitespace', () => {
    expect(messageToPlaintext(JSON.stringify({ text: '  hey  ' }))).toBe('hey');
    expect(messageToPlaintext(JSON.stringify('  hey  '))).toBe('hey');
  });

  it('accepts {content: "..."} as alternative shape', () => {
    expect(messageToPlaintext(JSON.stringify({ content: 'voice msg' }))).toBe('voice msg');
  });

  it('returns empty for null/undefined-shaped json objects', () => {
    expect(messageToPlaintext(JSON.stringify({ foo: 'bar' }))).toBe('');
    expect(messageToPlaintext(JSON.stringify({}))).toBe('');
  });
});
