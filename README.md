# TaskFlow (React + Supabase + n8n)

Monday-style task tracker: boards, groups, tasks, subitems, notes, tags, file uploads, archive, dashboard.

## Setup

### 1. Supabase
Run these in the SQL Editor, in order: `supabase.sql`, `supabase-v2.sql` ... `supabase-v7.sql`.
Then, when you go live with the login version, run **`supabase-v8-go-live.sql`** once (see below).

### 2. Accounts (username + password, a private tracker for each)
The login page asks for a username and a password. The go-live script creates three accounts - `admin1`, `admin2`,
`admin3` (password `123`) - and lists them in the `allowed_users` table. Everyone sees only their own data
(Supabase row level security, enforced in the database - not just in the UI).

- Supabase needs passwords of 6+ characters, so the app silently sends a password shorter than 6 characters with `#taskflow`
  added (`123` becomes `123#taskflow`). Passwords of 6+ characters are sent exactly as typed.
- **Change a password** (SQL Editor). For a password of 6+ characters:
  `update auth.users set encrypted_password = crypt('NewPassword1', gen_salt('bf')), updated_at = now() where email = 'admin1@taskflow.local';`
- **Add another person**: add the email to `allowed_users` and create the account, e.g. copy the `do $$ ... $$` block in
  the go-live script and change the email (`<username>@taskflow.local`).
- In Supabase -> *Authentication* -> *Sign In / Providers* you can turn off "Allow new users to sign up". Strangers cannot get in
  anyway (they are not in `allowed_users`), but this stops them from creating accounts.
- In **Vercel** add `VITE_SUPABASE_KEY` (the publishable key; Production and Preview). `VITE_SUPABASE_URL` and
  `VITE_N8N_BASE_URL` must also be set. Redeploy after changing variables.

**Go live (done on 2026-10-21)**: the login version was merged to `main` and `supabase-v8-go-live.sql` was run once in the SQL Editor.
It runs in one transaction (all or nothing): it creates the accounts, makes data private per account, gives all existing data to
`admin1`, and removes the old open access. The old n8n workflows "Task Tracker API" and "Task Tracker - Extract (image to rows)"
are switched off.

### 3. n8n (only needed for reading images with AI)
1. Build the workflow (credentials stay out of git):
   `SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=<publishable key> LLM_CRED_ID=<Header Auth credential with your Groq key> node n8n/build-extract-workflow.mjs n8n/extract-out.json`
   The Groq credential is a **Header Auth** credential: Name `Authorization`, Value `Bearer <your Groq API key>`.
2. n8n -> *Import from File* -> **Activate**. The webhook is `POST /webhook/extract-auth`.
   Every call must carry the signed-in user's Supabase token; n8n asks the database (`whoami()`) and rejects anyone who is not on
   the allowed list before the AI is called.

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
