# TaskFlow (React + Supabase + n8n)

Monday-style task tracker: boards, groups, tasks, subitems, notes, tags, file uploads, archive, dashboard.

## Setup

### 1. Supabase
Run these in the SQL Editor, in order: `supabase.sql`, `supabase-v2.sql` ... `supabase-v7.sql`, then the Google-login steps below.

### 2. Google sign-in (each person gets a private tracker)
Only people with a company Google account (`@247ga.co`) can sign in, and everyone sees only their own data
(Supabase row level security, enforced in the database - not just in the UI).

1. **Google Cloud Console** -> create or pick a project -> *APIs & Services* -> *OAuth consent screen*.
   If `247ga.co` is a Google Workspace domain choose user type **Internal** (only your organisation can sign in); otherwise **External**
   (the database still refuses every account that is not `@247ga.co`).
2. *Credentials* -> *Create credentials* -> *OAuth client ID* -> **Web application**.
   Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`. Copy the **Client ID** and **Client secret**.
3. **Supabase** -> *Authentication* -> *Sign In / Providers* -> **Google** -> enable, paste the Client ID and secret, save.
4. Supabase -> *Authentication* -> *URL Configuration*: **Site URL** = your Vercel URL; add **Redirect URLs**:
   `https://<your-vercel-domain>/**`, `http://localhost:5173/**` and your Vercel preview URLs.
5. **Vercel** -> *Settings* -> *Environment Variables*: add `VITE_SUPABASE_KEY` (the publishable key; Production and Preview).
   `VITE_SUPABASE_URL` and `VITE_N8N_BASE_URL` must also be set. Redeploy after changing variables.

Database steps (Supabase SQL Editor):
- `supabase-v8a-google-login-prepare.sql` - **step A**: only adds owner columns and per-user policies; the current app keeps working.
- Test the Google-login build (a Vercel preview of the `google-login` branch, or `npm run dev`).
- **Cutover** (do it when nobody is working): merge the branch to `main` -> sign in once with Google ->
  `supabase-v8b-claim-existing-data.sql` (**step B**, moves the data you already have to your account) ->
  `supabase-v8c-lock-down.sql` (**step C**, removes the old open access and makes files private).
- Afterwards deactivate the old n8n workflows "Task Tracker API" and "Task Tracker - Extract (image to rows)".

To change the allowed domain: edit `is_company_user()` in step A, `VITE_ALLOWED_DOMAIN` in the app, and `ALLOWED_DOMAIN` when building the n8n workflow.

### 3. n8n (only needed for reading images with AI)
1. Build the workflow (credentials stay out of git):
   `SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=<publishable key> LLM_CRED_ID=<Header Auth credential with your Groq key> node n8n/build-extract-workflow.mjs n8n/extract-out.json`
   The Groq credential is a **Header Auth** credential: Name `Authorization`, Value `Bearer <your Groq API key>`.
2. n8n -> *Import from File* -> **Activate**. The webhook is `POST /webhook/extract-auth`.
   Every call must carry the signed-in user's Supabase token; n8n checks it with Supabase and rejects anyone who is not a company user
   before the AI is called.

### 4. Frontend
```
cp .env.example .env     # fill in the values
npm install
npm run dev
```

`.env` is git-ignored. Never commit keys.

## Automation

**PDF → Schedule** – upload the Activation / Reminder "Workflow Gap" PDFs, pick a new launch date and add the computed
subitems (Label, Date, Time) to a board. PDFs are read exactly (no AI) and every Date/Time is checked against its Gap.

**Image → Review → PDF** – upload a screenshot of the subitem table. An AI reads it (n8n workflow `extract`), the app computes
the gap of every step, you review the result next to the image, then download two PDFs: **Activation** (Warm Up, Full Seq,
Special Text) and **Reminder** (Call / Text Reminder).

### How the image workflow works
One upload -> the app reads the image (n8n retries once after 30 s if Groq rate-limits) -> rows are split into
Activation / Reminder -> **60 s later the app reads the image a second time** (Groq limits tokens per minute) and flags every
row where the two reads disagree -> you review, tick the confirmation box and download both PDFs.

Accuracy rules: nothing is exported until you tick the confirmation box and the double-check has finished (or you skip it);
rows the AI is unsure about or that differ between the two reads are highlighted; known labels are normalised ("Dynamic Call w ..."
becomes "Dynamic Call"); the app warns about mixed campaign codes, missing numbers (e.g. Rem Call 1, 2, 4) and impossible date ranges.
