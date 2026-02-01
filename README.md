# Pharma PreAuditor Precedent Engine (FDA Whisperer)

Your AI regulatory intelligence assistant — chat in real time, attach documents, and get critical analysis on FDA approval likelihood and clinical development.

## Features

- **Conversational AI** — Chat naturally; ask follow-ups and get contextual answers
- **Document analysis** — Drag & drop or attach PDF, Word (.docx, .doc), or text files
- **Real-time streaming** — Responses stream as they’re generated
- **Critical thinking** — Step-by-step reasoning, FDA precedent, therapeutic area trends, approval factors, and risks

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and add your API key:
   ```bash
   cp .env.example .env.local
   ```
   - **Gemini (free):** Get a key at [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY=`
   - **OpenAI (optional):** Set `OPENAI_API_KEY=` if you prefer OpenAI

3. Run the dev server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Gemini 2.0 Flash / OpenAI GPT-4o-mini
