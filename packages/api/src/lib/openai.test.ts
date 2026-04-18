import { describe, it, expect, vi } from 'vitest';
import { parseSSEChunks, accumulateToolCalls, streamChat, chat } from './openai.js';

describe('parseSSEChunks', () => {
  it('parses content delta', () => {
    const line = 'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{ type: 'content', text: 'Hello' }]);
  });

  it('parses tool_calls delta', () => {
    const line = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":""}}]},"finish_reason":null}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{
      type: 'tool_call_delta',
      index: 0,
      id: 'call_1',
      name: 'read_file',
      argumentsDelta: '',
    }]);
  });

  it('parses tool_calls argument continuation', () => {
    const line = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\""}}]},"finish_reason":null}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{
      type: 'tool_call_delta',
      index: 0,
      id: undefined,
      name: undefined,
      argumentsDelta: '{"path"',
    }]);
  });

  it('parses finish_reason stop', () => {
    const line = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{
      type: 'done',
      finishReason: 'stop',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }]);
  });

  it('parses finish_reason tool_calls', () => {
    const line = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}';
    const events = parseSSEChunks(line);
    expect(events).toEqual([{ type: 'done', finishReason: 'tool_calls', usage: undefined }]);
  });

  it('handles [DONE] sentinel', () => {
    const events = parseSSEChunks('data: [DONE]');
    expect(events).toEqual([]);
  });

  it('skips empty lines', () => {
    const events = parseSSEChunks('');
    expect(events).toEqual([]);
  });
});

describe('accumulateToolCalls', () => {
  it('accumulates tool call deltas into complete tool calls', () => {
    const acc = accumulateToolCalls();

    acc.push({ index: 0, id: 'call_1', name: 'read_file', argumentsDelta: '' });
    acc.push({ index: 0, id: undefined, name: undefined, argumentsDelta: '{"path"' });
    acc.push({ index: 0, id: undefined, name: undefined, argumentsDelta: ':"test.txt"}' });

    const result = acc.finish();
    expect(result).toEqual([{
      id: 'call_1',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"test.txt"}' },
    }]);
  });
});

describe('streamChat', () => {
  it('calls OpenAI API with correct headers and body', async () => {
    const mockResponse = new Response(
      'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const stream = await streamChat({
      apiKey: 'sk-test',
      model: 'gpt-5.4-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(stream).toBeTruthy();
    fetchSpy.mockRestore();
  });
});

describe('chat', () => {
  it('returns text and usage from non-streaming call', async () => {
    const mockResponse = new Response(JSON.stringify({
      choices: [{ message: { content: 'Test title' } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse);

    const result = await chat({
      apiKey: 'sk-test',
      model: 'gpt-5.4-nano',
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 30,
    });

    expect(result.text).toBe('Test title');
    expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 3 });
    fetchSpy.mockRestore();
  });
});
