// packages/api/supabase/functions/compact-state/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireBearer } from '../_shared/auth.ts';
import { chat, chatCostUsd } from '../_shared/openai.ts';

const COMPACTION_SYSTEM = `You are a context-compression assistant. Your task is to rewrite a JSON context value into a shorter form while preserving all actionable, entity-level information.

Rules:
- Target length: {{target_tokens}} tokens (aim for exactly this, never exceed).
- Preserve: named entities (people, projects, files, dates, URLs), explicit decisions, numeric values, in-progress items.
- Drop: restatements, filler, meta-commentary, anything implied by context.
- Output format: same JSON shape as input (if object) or same text form (if string).
- Never invent facts. If you must shorten aggressively, prefer cutting detail over inventing structure.`;

Deno.serve(async (req) => {
  const auth = requireBearer(req, Deno.env.get('EDGE_INVOKE_KEY'));
  if (auth) return auth;

  const body = await req.json() as { user_id: string; key: string; current_value: string; token_budget: number };
  const { user_id, key, current_value, token_budget } = body;
  const target = Math.floor(token_budget * 0.6);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

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

  await supabase.from('buck_memory_usage').insert({
    user_id,
    kind: 'compaction',
    model: res.model,
    prompt_tok: res.usage.prompt_tokens,
    completion_tok: res.usage.completion_tokens,
    cost_usd: chatCostUsd(res.model, res.usage),
    metadata: { key, token_budget, target },
  });

  return new Response(JSON.stringify({ compacted_value: res.content }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
