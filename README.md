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

### Set up the image workflow in n8n (Groq)
The image is read by Groq's vision model `qwen/qwen3.8-27b` through an n8n workflow (`POST /webhook/extract`).

1. Build the file (keeps credential ids out of git):
   `AUTH_CRED_ID=<Header Auth credential of the other webhooks> LLM_CRED_ID=<Header Auth credential holding your Groq key> node n8n/build-extract-workflow.mjs n8n/extract-out.json`
   The Groq credential is a **Header Auth** credential: Name `Authorization`, Value `Bearer <your Groq API key>`.
2. n8n -> Workflows -> **Import from File**, then **Activate**.
3. `PROVIDER=claude` builds the Claude (Anthropic) variant instead.

How a run works: one upload -> the app reads the image (n8n retries once after 30 s if Groq rate-limits) -> rows are split into
Activation / Reminder -> **60 s later the app reads the image a second time** (Groq limits tokens per minute) and flags every
row where the two reads disagree -> you review, tick the confirmation box and download both PDFs.

Accuracy rules: nothing is exported until you tick the confirmation box and the double-check has finished (or you skip it);
rows the AI is unsure about or that differ between the two reads are highlighted; known labels are normalised ("Dynamic Call w ..."
becomes "Dynamic Call"); the app warns about mixed campaign codes, missing numbers (e.g. Rem Call 1, 2, 4) and impossible date ranges.
