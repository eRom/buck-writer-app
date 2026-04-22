// packages/api/supabase/functions/compact-state/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireBearer } from '../_shared/auth.ts';
import { chat, chatCostUsd } from '../_shared/openai.ts';

const FN = 'compact-state';

const COMPACTION_SYSTEM = `You are a context-compression assistant. Your task is to rewrite a JSON context value into a shorter form while preserving all actionable, entity-level information.

Rules:
- Target length: {{target_tokens}} tokens (aim for exactly this, never exceed).
- Preserve: named entities (people, projects, files, dates, URLs), explicit decisions, numeric values, in-progress items.
- Drop: restatements, filler, meta-commentary, anything implied by context.
- Output format: same JSON shape as input (if object) or same text form (if string).
- Never invent facts. If you must shorten aggressively, prefer cutting detail over inventing structure.`;

Deno.serve(async (req) => {
  const stage = { current: 'init' };
  try {
    stage.current = 'auth';
    const auth = requireBearer(req, Deno.env.get('EDGE_INVOKE_KEY'));
    if (auth) return auth;

    stage.current = 'parse_body';
    let body: { user_id: string; key: string; current_value: string; token_budget: number };
    try {
      body = await req.json();
    } catch (e) {
      throw new Error(`invalid JSON body: ${e instanceof Error ? e.message : String(e)}`);
    }
    const { user_id, key, current_value, token_budget } = body;
    if (!user_id || !key || typeof current_value !== 'string' || !token_budget) {
      throw new Error(`missing fields: user_id=${!!user_id} key=${!!key} current_value=${typeof current_value} token_budget=${token_budget}`);
    }
    const target = Math.floor(token_budget * 0.6);

    stage.current = 'client_init';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

    stage.current = 'llm_compact';
    const systemMsg = COMPACTION_SYSTEM.replaceAll('{{target_tokens}}', String(target));
    const userMsg = `Key: ${key}\nCurrent value (over budget): ${current_value}\nToken budget: ${token_budget}\nTarget: ${target}\n\nReturn ONLY the compacted value, no commentary, no markdown fences.`;

    const res = await chat({
      apiKey: openaiKey,
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
    });
    if (!res.content) throw new Error('empty LLM content');

    stage.current = 'log_usage';
    const usageInsert = await supabase.from('buck_memory_usage').insert({
      user_id,
      kind: 'compaction',
      model: res.model,
      prompt_tok: res.usage.prompt_tokens,
      completion_tok: res.usage.completion_tokens,
      cost_usd: chatCostUsd(res.model, res.usage),
      metadata: { key, token_budget, target },
    });
    if (usageInsert.error) {
      console.error(JSON.stringify({ fn: FN, stage: 'log_usage', warn: usageInsert.error.message }));
    }

    return new Response(JSON.stringify({ compacted_value: res.content }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(JSON.stringify({ fn: FN, stage: stage.current, error: msg, stack }));
    return new Response(
      JSON.stringify({ error: 'internal', stage: stage.current, message: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
