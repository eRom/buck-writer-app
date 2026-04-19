import { describe, it, expect, vi } from 'vitest';
import {
  parseResponsesEventBlock,
  createSSEBuffer,
  streamResponses,
  respond,
  OpenAIError,
} from './openai.js';

describe('parseResponsesEventBlock', () => {
  it('parses response.output_text.delta', () => {
    const block =
      'event: response.output_text.delta\n' +
      'data: {"type":"response.output_text.delta","output_index":0,"item_id":"msg_1","delta":"Hello"}';
    const ev = parseResponsesEventBlock(block);
    expect(ev).toMatchObject({
      type: 'response.output_text.delta',
      delta: 'Hello',
      item_id: 'msg_1',
    });
  });

  it('parses response.function_call_arguments.done', () => {
    const block =
      'event: response.function_call_arguments.done\n' +
      'data: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"path\\":\\"a.md\\"}"}';
    const ev = parseResponsesEventBlock(block);
    expect(ev?.type).toBe('response.function_call_arguments.done');
    if (ev?.type === 'response.function_call_arguments.done') {
      expect(ev.arguments).toBe('{"path":"a.md"}');
    }
  });

  it('parses response.completed with usage', () => {
    const block =
      'event: response.completed\n' +
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","output":[],"usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15,"input_tokens_details":{"cached_tokens":3}}}}';
    const ev = parseResponsesEventBlock(block);
    expect(ev?.type).toBe('response.completed');
    if (ev?.type === 'response.completed') {
      expect(ev.response.usage.input_tokens).toBe(10);
      expect(ev.response.usage.input_tokens_details?.cached_tokens).toBe(3);
    }
  });

  it('parses response.mcp_call.completed', () => {
    const block =
      'event: response.mcp_call.completed\n' +
      'data: {"type":"response.mcp_call.completed","item_id":"mcp_1"}';
    const ev = parseResponsesEventBlock(block);
    expect(ev).toMatchObject({ type: 'response.mcp_call.completed', item_id: 'mcp_1' });
  });

  it('parses [DONE] sentinel as null', () => {
    const block = 'data: [DONE]';
    expect(parseResponsesEventBlock(block)).toBeNull();
  });

  it('returns null on blank', () => {
    expect(parseResponsesEventBlock('')).toBeNull();
    expect(parseResponsesEventBlock('\n\n')).toBeNull();
  });

  it('returns unknown on malformed JSON', () => {
    const block = 'event: foo\ndata: not-json';
    const ev = parseResponsesEventBlock(block);
    expect(ev?.type).toBe('unknown');
  });
});

describe('createSSEBuffer', () => {
  it('yields events as blocks arrive, holds the tail', () => {
    const buf = createSSEBuffer();
    const part1 =
      'event: response.output_text.delta\n' +
      'data: {"type":"response.output_text.delta","output_index":0,"item_id":"m","delta":"A"}\n\n' +
      'event: response.output_text.delta\n' +
      'data: {"type":"response.output_text.delta","output_index":0,"item_id":"m","delta":"B"}';
    const events = buf.push(part1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: 'A' });

    const events2 = buf.push('\n\n');
    expect(events2).toHaveLength(1);
    expect(events2[0]).toMatchObject({ delta: 'B' });
  });

  it('flush drains any trailing block without terminator', () => {
    const buf = createSSEBuffer();
    buf.push('event: response.completed\n');
    buf.push(
      'data: {"type":"response.completed","response":{"id":"r","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3}}}',
    );
    const rest = buf.flush();
    expect(rest).toHaveLength(1);
    expect(rest[0]?.type).toBe('response.completed');
  });
});

describe('streamResponses', () => {
  it('POSTs to /v1/responses with Bearer + stream:true', async () => {
    const mockResp = new Response('event: response.created\ndata: {"type":"response.created","response":{"id":"r1"}}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResp);

    await streamResponses({
      apiKey: 'sk-test',
      body: { model: 'gpt-5.4-mini', input: 'hi' },
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        }),
      }),
    );
    const opts = fetchSpy.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(opts.body as string) as { stream: boolean };
    expect(body.stream).toBe(true);
    fetchSpy.mockRestore();
  });

  it('throws OpenAIError on non-2xx', async () => {
    const mockResp = new Response(
      JSON.stringify({ error: { message: 'bad key' } }),
      { status: 401 },
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResp);
    await expect(
      streamResponses({
        apiKey: 'sk-bad',
        body: { model: 'x', input: 'y' },
      }),
    ).rejects.toBeInstanceOf(OpenAIError);
    vi.restoreAllMocks();
  });
});

describe('respond', () => {
  it('returns text + usage + responseId', async () => {
    const mockResp = new Response(
      JSON.stringify({
        id: 'resp_abc',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Title here' }],
          },
        ],
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
      }),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResp);
    const out = await respond({
      apiKey: 'sk-test',
      body: { model: 'gpt-5.4-nano', input: 'give me a title' },
    });
    expect(out.text).toBe('Title here');
    expect(out.usage.input_tokens).toBe(4);
    expect(out.responseId).toBe('resp_abc');
    vi.restoreAllMocks();
  });

  it('uses output_text shortcut when provided', async () => {
    const mockResp = new Response(
      JSON.stringify({
        id: 'resp_def',
        output_text: 'Short title',
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResp);
    const out = await respond({
      apiKey: 'sk-test',
      body: { model: 'gpt-5.4-nano', input: 'x' },
    });
    expect(out.text).toBe('Short title');
    vi.restoreAllMocks();
  });
});
