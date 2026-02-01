# FDA Whisperer

Vertical AI agent for Bio-Pharma Regulatory Intelligence. Predicts regulatory roadblocks by analyzing SBAs (Summary Basis of Approvals) and EPARs.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon key
- `OPENAI_API_KEY` – OpenAI API key (for embeddings + LLM summary)

### 3. Apply database schema

In Supabase Dashboard → SQL Editor, run the contents of `db_schema.sql` (or `supabase/migrations/db_schema.sql`).

### 4. Ingest PDFs (optional)

Place FDA SBAs and EMA EPARs in `data/pdfs/`, then:

```bash
npm run ingest
# or: npm run ingest /path/to/your/pdfs
```

### 5. Local FDA Guidance (optional)

Place FDA Guidance PDFs in `docs/` for @docs-style context in predictive audits.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Multi-Angle Search**:
  - **Angle A**: Safety signals in similar drug classes
  - **Angle B**: Reviewer stickler points (PK/PD modeling FDA dislikes)
  - **Angle C**: EMA EPAR safety warnings FDA might adopt
- **Red/Yellow/Green** risk framework based on precedent strength
- **PDF Processor** – extracts text, detects tables, and RTF keywords
