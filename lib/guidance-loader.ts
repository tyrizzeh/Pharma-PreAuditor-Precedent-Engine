/**
 * Loads local FDA Guidance PDFs for context in predictive_audit.
 * Place PDFs in /docs or /public/docs for @docs-style reference.
 */
import fs from "fs/promises";
import path from "path";
const DOCS_DIR = path.join(process.cwd(), "docs");

export async function loadGuidanceContext(maxChars = 15000): Promise<string> {
  try {
    await fs.access(DOCS_DIR);
  } catch {
    return "";
  }

  const files = await fs.readdir(DOCS_DIR);
  const pdfFiles = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length === 0) return "";

  const chunks: string[] = [];
  let totalChars = 0;

  const pdfParse = (await import("pdf-parse")).default as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

  for (const file of pdfFiles) {
    if (totalChars >= maxChars) break;

    try {
      const buffer = await fs.readFile(path.join(DOCS_DIR, file));
      const data = await pdfParse(buffer);
      const paras = data.text.split(/\n\s*\n+/).filter((p) => p.trim().length > 50);
      for (const p of paras) {
        if (totalChars + p.length > maxChars) break;
        chunks.push(`[${file}]\n${p.trim()}`);
        totalChars += p.length;
      }
    } catch (err) {
      console.warn(`Failed to load guidance ${file}:`, err);
    }
  }

  if (chunks.length === 0) return "";

  return `\n--- LOCAL FDA GUIDANCE (place PDFs in /docs) ---\n${chunks.join("\n\n---\n\n")}\n--- END GUIDANCE ---\n`;
}
