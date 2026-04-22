// packages/api/supabase/functions/consolidate-memory/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireBearer } from '../_shared/auth.ts';
import { chat, embed, chatCostUsd } from '../_shared/openai.ts';
import { CONSOLIDATION_SYSTEM, buildConsolidationUser } from './prompts.ts';

const DEDUP_THRESHOLD = 0.92;
const LOOKBACK_DAYS = 7;
const FN = 'consolidate-memory';

interface Fact { content: string; importance: number; source_ids: string[] }

Deno.serve(async (req) => {
  const stage = { current: 'init' };
  try {
    stage.current = 'auth';
    const auth = requireBearer(req, Deno.env.get('EDGE_INVOKE_KEY'));
    if (auth) return auth;

    stage.current = 'client_init';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
    const embedModel = Deno.env.get('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-large';
    const userId = Deno.env.get('BUCK_USER_ID')!;

    // 1. Fetch recent unconsolidated episodes
    stage.current = 'fetch_episodes';
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000).toISOString();
    const { data: episodesRaw, error: fetchErr } = await supabase
      .from('buck_memories')
      .select('id, content')
      .eq('user_id', userId)
      .eq('memory_type', 'episodic')
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    if (fetchErr) throw new Error(`fetch_episodes: ${fetchErr.message}`);
    const episodes = episodesRaw ?? [];
    if (episodes.length < 3) {
      return new Response(`skipped: only ${episodes.length} episodes`, { status: 200 });
    }

    // 2. LLM extract
    stage.current = 'llm_extract';
    const chatRes = await chat({
      apiKey: openaiKey,
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CONSOLIDATION_SYSTEM },
        { role: 'user', content: buildConsolidationUser(episodes) },
      ],
      responseFormat: 'json_object',
    });

    stage.current = 'parse_json';
    if (!chatRes.content) throw new Error('empty LLM content');
    let parsed: { facts?: Fact[] };
    try {
      parsed = JSON.parse(chatRes.content) as { facts?: Fact[] };
    } catch (e) {
      throw new Error(`invalid JSON from LLM: ${e instanceof Error ? e.message : String(e)} | content=${chatRes.content.slice(0, 200)}`);
    }
    const facts = parsed.facts ?? [];

    // 3. Log LLM usage (non-critical: log error but do not abort)
    stage.current = 'log_usage';
    const usageInsert = await supabase.from('buck_memory_usage').insert({
      user_id: userId,
      kind: 'consolidation',
      model: chatRes.model,
      prompt_tok: chatRes.usage.prompt_tokens,
      completion_tok: chatRes.usage.completion_tokens,
      cost_usd: chatCostUsd(chatRes.model, chatRes.usage),
      metadata: { episodes_count: episodes.length, facts_extracted: facts.length },
    });
    if (usageInsert.error) {
      console.error(JSON.stringify({ fn: FN, stage: 'log_usage', warn: usageInsert.error.message }));
    }

    // 4. Dedup + upsert facts
    let inserted = 0;
    let merged = 0;
    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      stage.current = `embed_fact_${i}`;
      const { embedding } = await embed(openaiKey, embedModel, fact.content);

      stage.current = `rpc_match_${i}`;
      const rpcRes = await supabase.rpc('match_memories', {
        query_embedding: embedding,
        match_threshold: DEDUP_THRESHOLD,
        match_count: 1,
        filter_user_id: userId,
        filter_type: 'semantic',
      });
      if (rpcRes.error) throw new Error(`rpc_match_${i}: ${rpcRes.error.message}`);
      const matches = rpcRes.data as Array<{ id: string }> | null;

      if (matches && matches.length > 0) {
        stage.current = `merge_fact_${i}`;
        const existing = matches[0];
        const { data: existingRow, error: selErr } = await supabase
          .from('buck_memories').select('source_ids, importance').eq('id', existing.id).single();
        if (selErr) throw new Error(`merge_select_${i}: ${selErr.message}`);
        const newSources = Array.from(new Set([...(existingRow?.source_ids ?? []), ...fact.source_ids]));
        const newImportance = Math.min(1, (existingRow?.importance ?? 0.5) + 0.05);
        const { error: updErr } = await supabase.from('buck_memories').update({
          source_ids: newSources,
          importance: newImportance,
        }).eq('id', existing.id);
        if (updErr) throw new Error(`merge_update_${i}: ${updErr.message}`);
        merged += 1;
      } else {
        stage.current = `insert_fact_${i}`;
        const { error: insErr } = await supabase.from('buck_memories').insert({
          user_id: userId,
          memory_type: 'semantic',
          content: fact.content,
          embedding,
          importance: Math.max(0, Math.min(1, fact.importance)),
          source_ids: fact.source_ids,
        });
        if (insErr) throw new Error(`insert_fact_${i}: ${insErr.message}`);
        inserted += 1;
      }
    }

    return new Response(JSON.stringify({
      ok: true, episodes: episodes.length, inserted, merged,
    }), { headers: { 'Content-Type': 'application/json' } });
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
