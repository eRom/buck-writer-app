import { loadEnv } from '../src/env.js';
import { getSupabase } from '../src/services/memory/supabaseClient.js';

const STATIC_DEFAULTS = {
  lang: 'fr',
  tone: 'trinity',
  timezone: 'Europe/Paris',
  user_profile: { name: 'Romain', role: 'founder' },
};

async function main() {
  const env = loadEnv();
  if (!env.BUCK_USER_ID) throw new Error('BUCK_USER_ID missing');
  const supabase = getSupabase(env);

  for (const [key, value] of Object.entries(STATIC_DEFAULTS)) {
    const res = await supabase.from('buck_state').upsert({
      user_id: env.BUCK_USER_ID,
      tier: 'static',
      key,
      value,
      token_budget: null,
      updated_at: new Date().toISOString(),
    });
    if (res.error) throw res.error;
    console.log(`seeded static.${key}`);
  }
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
