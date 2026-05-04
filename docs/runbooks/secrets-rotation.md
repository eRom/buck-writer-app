# Secrets rotation runbooks

Runbook per critical secret used by Buck Writer (prod). Run the
matching section if a secret is suspected leaked, has appeared in a
git commit, or is rotated as part of a scheduled hygiene pass.

> **Rule of thumb.** Rotate first, investigate after. A 10-minute
> degraded magic-link flow beats a 24h leaked-credential window.

---

## Common pre-flight

Before any rotation:

1. SSH into the Hostinger VPS (`ssh hostinger`).
2. `cd /opt/buck` (deploy state lives here, mounted on the
   `vps-docker-manager-prod` repo).
3. Confirm the running image:
   ```bash
   docker compose ps buck-api
   ```
4. Have a second terminal open on `~/dev/buck-writer-app` for any
   re-deploy.

After any rotation: run `docker compose logs --tail 50 buck-api`
and confirm there is no boot crash on the new env value.

---

## AUTH_JWT_SECRET — magic-link signing

**Blast radius**: every active user session is invalidated. Anyone
holding a JWT signed by the old secret receives `401`. All users must
re-do a magic-link login.

```bash
# 1. Generate the new secret (32 bytes hex = 64 chars).
openssl rand -hex 32

# 2. Push it to the VPS via the hostinger:env-sync skill (whitelist-aware).
#    DO NOT use `/hostinger:env-sync` raw — the wrapper script filters
#    dev-only vars. From your laptop:
./scripts/env-sync-to-prod.sh AUTH_JWT_SECRET=<new>

# 3. Wipe DB-resident sessions + unconsumed magic links.
ssh hostinger 'docker compose -f /opt/buck/compose.yml exec buck-api \
  sqlite3 /app/data/buck.db \
    "DELETE FROM sessions_auth; DELETE FROM auth_tokens WHERE used_at IS NULL;"'

# 4. Restart the API.
ssh hostinger 'docker compose -f /opt/buck/compose.yml restart buck-api'

# 5. Smoke: open https://buck.romain-ecarnot.com — expect a redirect to
#    the login form. Request a magic link, click it, confirm session.
```

---

## RESEND_API_KEY — magic-link delivery

**Blast radius**: incoming magic-links won't be sent until the new key
ships. Sessions are unaffected. No DB change needed.

```bash
# 1. Resend dashboard → API keys → Revoke the old key, create a new
#    one with `Sending access` only.
# 2. Push to VPS:
./scripts/env-sync-to-prod.sh RESEND_API_KEY=<new>

# 3. Restart API:
ssh hostinger 'docker compose -f /opt/buck/compose.yml restart buck-api'

# 4. Smoke: trigger a magic-link request for a whitelisted email,
#    confirm it arrives in Inbox within ~5s.
```

---

## OPENAI_API_KEY — chat / embeddings / Realtime / image gen

**Blast radius**: chat streaming, Memory M5 embeddings, Bible-MCP
embeddings, Realtime mint, image generation all stop working until the
new key ships. Active chats die on the next stream chunk.

```bash
# 1. OpenAI dashboard → API keys → Revoke old key.
# 2. CHECK billing usage between the last audit and revocation —
#    anomaly = full incident response.
# 3. Create a new key, scoped to project `buck` if available.
# 4. Push to VPS:
./scripts/env-sync-to-prod.sh OPENAI_API_KEY=<new>

# 5. Restart API:
ssh hostinger 'docker compose -f /opt/buck/compose.yml restart buck-api'

# 6. Smoke (each tests a different surface):
#    a. Chat: "Bonjour" → assert streaming reply.
#    b. Realtime: open the voice mode, say something, confirm transcript.
#    c. Memory: trigger a `/recall` on a known fact.
#    d. Image gen: ask for an image, confirm it lands in workspace.
```

---

## GEMINI_API_KEY — TTS playback

**Blast radius**: TTS button on chat messages stops working. No other
surface affected. No DB change.

```bash
# 1. Google Cloud Console → APIs & Services → Credentials → revoke +
#    create. Restrict to `Gemini API` scope.
# 2. Push:
./scripts/env-sync-to-prod.sh GEMINI_API_KEY=<new>

# 3. Restart API:
ssh hostinger 'docker compose -f /opt/buck/compose.yml restart buck-api'

# 4. Smoke: hit the Play button on any chat message, confirm audio.
```

---

## MCP_SHARED_SECRET — buck-api ↔ bible-mcp auth

**Blast radius**: Bible MCP calls fail with 401 until both sides hold
the same value. **Update the two containers in lockstep**, otherwise
you have a half-deployed window where bible queries 401.

```bash
# 1. Generate:
openssl rand -hex 32

# 2. Push to BOTH containers (the env-sync script writes to a shared
#    .env.prod consumed by both compose services):
./scripts/env-sync-to-prod.sh MCP_SHARED_SECRET=<new>

# 3. Restart both, in this order (bible-mcp first so buck-api never
#    talks to a stale bearer):
ssh hostinger 'docker compose -f /opt/buck/compose.yml restart bible-mcp && \
               docker compose -f /opt/buck/compose.yml restart buck-api'

# 4. Smoke (from your laptop):
curl -sI -H "Authorization: Bearer $NEW" \
  https://bible.buck.romain-ecarnot.com/mcp
# Expect 200 or 405 (Streamable HTTP without a body), NOT 401.
```

---

## EDGE_INVOKE_KEY — buck-api ↔ Supabase Edge Functions

**Blast radius**: Memory M5 consolidation + state-compaction Edge
Functions stop accepting calls. Pg_cron triggers will fail nightly
until the rotation is complete on both Supabase + Buck sides.

```bash
# 1. Generate:
openssl rand -hex 32

# 2. Update Supabase side:
#    Dashboard → Project Settings → Edge Functions → Secrets →
#    EDGE_INVOKE_KEY = <new>
#    Then redeploy the functions so they pick up the new value:
supabase functions deploy compact-state consolidate-memory

# 3. Update Buck side:
./scripts/env-sync-to-prod.sh EDGE_INVOKE_KEY=<new>

# 4. Restart API:
ssh hostinger 'docker compose -f /opt/buck/compose.yml restart buck-api'

# 5. Smoke: trigger a manual `/api/memory/consolidate` (admin-only)
#    and confirm 200, not 401.
```

---

## Post-rotation checklist (for any secret)

After the rotation completes:

- [ ] Old secret value purged from your password manager.
- [ ] No reference to the old value anywhere in `git log -p` since
      the rotation point (`grep -RIn "<old-prefix>" packages/ docs/`).
- [ ] Hostinger VPS `/opt/buck/.env` no longer contains the old value
      (`ssh hostinger 'grep <KEY> /opt/buck/.env'`).
- [ ] `docker compose logs --tail 100 buck-api` is free of errors
      tied to the rotated key (search for the key name).
- [ ] If the rotation was triggered by an incident: incident note
      filed in `gerber` with the timeline + scope.
