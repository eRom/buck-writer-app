# M5 Supabase Provisioning (manuel)

Exécuter une fois avant de lancer les migrations et fonctions Edge.

## 1. Activer les extensions

Dans Supabase SQL editor (projet `zconxtmchptchlmeqstu`) :

    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;

## 2. Créer les secrets Vault

Dashboard → Project Settings → Vault → Add new secret :

- Name: `OPENAI_API_KEY`, value: `sk-...` (clé prod OpenAI)
- Name: `EDGE_INVOKE_KEY`, value: `<openssl rand -hex 32>` (32 bytes hex)

## 3. Générer BUCK_USER_ID

En local :

    $ uuidgen
    7a3f...

Ajouter dans `.env` (dev + prod) : `BUCK_USER_ID=<uuid>`.

## 4. Vérifier l'accès service_role

Dashboard → Project Settings → API → service_role key (secret).
Copier dans `.env` : `SUPABASE_SERVICE_ROLE_KEY=<key>`.

## 5. Checklist

- [ ] Extensions actives (SELECT * FROM pg_extension)
- [ ] Vault contient OPENAI_API_KEY et EDGE_INVOKE_KEY
- [ ] BUCK_USER_ID généré et dans .env
- [ ] SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env
- [ ] EDGE_INVOKE_KEY côté Node (.env) = valeur Vault
