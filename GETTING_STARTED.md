# FDA Whisperer – Quick Start

## Step 1: Create `.env.local`

From the project root (`fda-whisperer/`), run:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and add your real values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
OPENAI_API_KEY=sk-...
```

### Where to get these

| Variable | Source |
|----------|--------|
| **Supabase URL & Key** | [supabase.com](https://supabase.com) → New Project → Settings → API |
| **OpenAI API Key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

---

## Step 2: Set up Supabase

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a project (or use existing).
2. Open **SQL Editor**.
3. Copy the entire contents of `db_schema.sql`.
4. Paste and **Run**.

---

## Step 3: (Optional) Add PDFs for ingestion

To get real audit results, you need regulatory documents in the vector store:

1. Create a folder: `data/pdfs/`
2. Add FDA SBAs or EMA EPARs (PDFs).
3. Run ingestion:

```bash
npm run ingest
```

If you skip this, the app will run but audits will show “Insufficient precedent data” until you ingest PDFs.

---

## Step 4: Run the app

```bash
cd fda-whisperer
npm run dev
```

Open **http://localhost:3000**.

---

## Step 5: Use the app

1. Choose **Clinical Protocol** or **IND Submission**.
2. Paste draft text.
3. Click **Run Predictive Audit**.
4. Review Red/Yellow/Green findings and the executive summary.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Missing Supabase env vars” | Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` |
| “Insufficient precedent data” | Ingest PDFs: `npm run ingest` |
| Audit fails / no results | Ensure `db_schema.sql` was run in Supabase and ingestion completed |
