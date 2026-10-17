# TaskFlow (React + n8n + Supabase)

Monday-style task tracker: boards, groups, tasks, subitems, notes, tags, file uploads, archive, dashboard.

## Setup

### 1. Supabase
Run these in the SQL Editor, in order: `supabase.sql`, `supabase-v2.sql` ... `supabase-v6.sql`.

### 2. n8n
1. In n8n, create a **Header Auth** credential: name `x-app-key`, value = a long random secret.
2. Build the workflow JSON (the secrets stay on your machine):
   ```
   SUPABASE_KEY=<publishable key> AUTH_CRED_ID=<credential id> \
     node n8n/build-workflow.mjs https://YOURPROJECT.supabase.co n8n/out.json
   ```
3. Import `n8n/out.json` into n8n and **Activate** it. All webhooks require the `x-app-key` header.

### 3. Frontend
```
cp .env.example .env     # fill in the values
npm install
npm run dev
```

`.env`:
- `VITE_N8N_BASE_URL` – your n8n production webhook base (e.g. `https://your-n8n/webhook`)
- `VITE_API_KEY` – the same secret as the Header Auth credential
- `VITE_SUPABASE_URL` – used to build public file links

`.env` is git-ignored. Never commit keys.
