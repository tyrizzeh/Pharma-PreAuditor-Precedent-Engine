/**
 * FDA Whisperer - Ingestion Runner
 * Processes PDFs in a directory, extracts chunks, generates embeddings,
 * and upserts into Supabase regulatory_precedents.
 */

import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { processPDFFile } from "./pdf_processor";
import { getEmbeddings } from "../../lib/embeddings";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
  const inputDir = process.argv[2] ?? path.join(process.cwd(), "data", "pdfs");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)");
    process.exit(1);
  }

  try {
    await fs.access(inputDir);
  } catch {
    console.error(`Input directory not found: ${inputDir}`);
    console.log("Usage: npm run ingest [path/to/pdfs]");
    process.exit(1);
  }

  const files = await fs.readdir(inputDir);
  const pdfFiles = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length === 0) {
    console.log("No PDFs found in", inputDir);
    process.exit(0);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  for (const file of pdfFiles) {
    const filePath = path.join(inputDir, file);
    console.log("Processing:", file);

    try {
      const result = await processPDFFile(filePath);

      const chunks = result.chunks.filter((c) => c.content.trim().length > 50);
      if (chunks.length === 0) {
        console.log("  No valid chunks extracted");
        continue;
      }

      const texts = chunks.map((c) => c.content);
      const embeddings = await getEmbeddings(texts);

      const rows = chunks.map((c, i) => ({
        content: c.content,
        embedding: embeddings[i],
        source_document: result.fileName,
        source_page: c.pageNumber,
        chunk_index: c.chunk_index,
        contains_table: c.containsTable,
        rtf_keywords_detected: c.rtfKeywordsDetected.length > 0 ? c.rtfKeywordsDetected : null,
        drug_class: null,
        therapeutic_area: null,
        review_type: null,
        reviewer_sentiment: "Unspecified",
        jurisdiction: file.toLowerCase().includes("epar") ? "EMA" : "FDA",
      }));

      const { error } = await supabase.from("regulatory_precedents").insert(rows);

      if (error) {
        console.error("  Supabase upsert error:", error.message);
      } else {
        console.log(`  Inserted ${rows.length} chunks`);
      }
    } catch (err) {
      console.error("  Error:", err);
    }
  }

  console.log("Ingestion complete.");
}

main();
