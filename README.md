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

## Automation

**PDF → Schedule** – upload the Activation / Reminder "Workflow Gap" PDFs, pick a new launch date and add the computed
subitems (Label, Date, Time) to a board. PDFs are read exactly (no AI) and every Date/Time is checked against its Gap.

**Image → Review → PDF** – upload a screenshot of the subitem table. An AI reads it (n8n workflow `extract`), the app computes
the gap of every step, you review the result next to the image, then download two PDFs: **Activation** (Warm Up, Full Seq,
Special Text) and **Reminder** (Call / Text Reminder).

### Set up the image workflow in n8n
1. Build the file (keeps credentials out of git):
   `AUTH_CRED_ID=<id of the Header Auth credential used by the other webhooks> node n8n/build-extract-workflow.mjs n8n/extract-out.json`
   (or import `n8n/extract-workflow.json` and select the credential on the **Extract Hook** node).
2. n8n → Workflows → **Import from File**.
3. Open the **Claude (read image)** node → create a **Header Auth** credential: Name **`x-api-key`**, Value = your Anthropic API key.
4. Open **Extract Hook** → choose the same Header Auth credential as the other webhooks (`x-app-key`).
5. **Activate** the workflow. Set a spending limit in the Anthropic console.

Accuracy rules: nothing is exported until you tick the confirmation box; rows the AI is unsure about are highlighted; the app
warns about mixed campaign codes, missing numbers (e.g. Rem Call 1, 2, 4) and impossible date ranges.
