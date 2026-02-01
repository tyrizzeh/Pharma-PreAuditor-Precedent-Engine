/**
 * FDA Whisperer - PDF Processor
 * Extracts text from FDA SBAs, EMA EPARs, and regulatory PDFs.
 * Identifies: (1) Tables, (2) Refusal to File (RTF) keywords.
 * Optimized for high-volume FDA document ingestion.
 */

import fs from "fs/promises";
import path from "path";

// -----------------------------------------------------------------------------
// REFUSAL TO FILE (RTF) KEYWORDS
// Based on FDA Guidance & 21 CFR 314.101 / 601.2
// -----------------------------------------------------------------------------
const RTF_KEYWORDS = [
  // Primary RTF terminology
  "refusal to file",
  "refuse to file",
  "refused for filing",
  "refused to file",
  "refuse-to-file",
  "refusal-to-file",
  "rtf letter",
  "rtf action",
  "rtf decision",
  // Administrative incompleteness
  "administrative incompleteness",
  "administratively incomplete",
  "clear omission",
  "omission of required",
  "missing required",
  "incomplete application",
  "incomplete submission",
  // Scientific incompleteness
  "scientific incompleteness",
  "scientifically incomplete",
  "inadequate clinical information",
  "inadequate clinical data",
  "inadequate quality data",
  "inadequate manufacturing",
  "inadequate manufacturing information",
  "missing pharmacology",
  "missing toxicology",
  "insufficient statistical",
  "post-hoc analys",
  "post hoc analys",
  "incomplete analysis",
  "incomplete analysis of studies",
  "inadequate facility information",
  // Regulatory citations
  "21 cfr 314.101",
  "21 cfr 601.2",
  "314.101(d)",
  "601.2",
  "section 505(b)",
  "section 351",
  // Action-related
  "not file",
  "refuse to accept",
  "refusal to accept",
  "incomplete upon submission",
  "deficiencies preclude review",
  "cannot commence review",
  "cannot begin review",
] as const;

// -----------------------------------------------------------------------------
// TABLE DETECTION PATTERNS
// FDA/EMA documents use consistent table numbering
// -----------------------------------------------------------------------------
const TABLE_PATTERNS = [
  // "Table 1", "Table 2", "Table 1.1", "Table 2a", "Table 2.1"
  /\bTable\s+\d+(?:\.\d+)?[a-z]?\b/gi,
  // "Table I", "Table II", "Table III" (Roman numerals)
  /\bTable\s+[IVXLCDM]+\b/gi,
  // "Table A", "Table B", "Table B-1"
  /\bTable\s+[A-Z](?:-\d+)?\b/gi,
  // "Table S1", "Table S2" (supplementary)
  /\bTable\s+S\d+(?:\.\d+)?\b/gi,
  // "Tables 1-3" (range)
  /\bTables\s+\d+(?:\s*[-–]\s*\d+)?\b/gi,
  // "Table." (with period - OCR artifacts)
  /\bTable\.\s*\d+\b/gi,
  // FDA-specific: "Summary Table", "Safety Table"
  /\b(?:Summary|Safety|Efficacy)\s+Table\b/gi,
];

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
export interface ProcessedChunk {
  content: string;
  pageNumber: number;
  chunkIndex: number;
  containsTable: boolean;
  rtfKeywordsDetected: string[];
  tableReferences: string[];
}

export interface ProcessedPDFResult {
  fileName: string;
  fullText: string;
  numPages: number;
  chunks: ProcessedChunk[];
  summary: {
    totalChunks: number;
    chunksWithTables: number;
    chunksWithRTFKeywords: number;
    allRTFKeywordsFound: string[];
    allTableReferences: string[];
  };
}

export interface PDFProcessorOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  minChunkLength?: number;
}

// -----------------------------------------------------------------------------
// DETECTION HELPERS
// -----------------------------------------------------------------------------
function detectTables(text: string): { hasTable: boolean; references: string[] } {
  const references: string[] = [];
  const seen = new Set<string>();

  for (const pattern of TABLE_PATTERNS) {
    const matches = text.match(pattern) ?? [];
    for (const m of matches) {
      const normalized = m.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        references.push(m.trim());
      }
    }
  }

  return { hasTable: references.length > 0, references };
}

function detectRTFKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const kw of RTF_KEYWORDS) {
    if (lower.includes(kw)) {
      found.push(kw);
    }
  }

  return [...new Set(found)];
}

// -----------------------------------------------------------------------------
// CHUNKING (simple sentence-aware chunking)
// -----------------------------------------------------------------------------
function chunkText(
  text: string,
  pageNumber: number,
  options: PDFProcessorOptions = {}
): Omit<ProcessedChunk, "containsTable" | "rtfKeywordsDetected" | "tableReferences">[] {
  const chunkSize = options.chunkSize ?? 1500;
  const chunkOverlap = options.chunkOverlap ?? 200;
  const minChunkLength = options.minChunkLength ?? 100;

  const chunks: Omit<ProcessedChunk, "containsTable" | "rtfKeywordsDetected" | "tableReferences">[] = [];
  const paragraphs = text.split(/\n\s*\n+/).filter((p) => p.trim().length >= minChunkLength);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        pageNumber,
        chunkIndex: chunkIndex++,
      });
      const overlapStart = Math.max(0, currentChunk.length - chunkOverlap);
      currentChunk = currentChunk.slice(overlapStart) + "\n\n" + para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      pageNumber,
      chunkIndex: chunkIndex,
    });
  }

  return chunks;
}

// -----------------------------------------------------------------------------
// MAIN PDF PROCESSOR
// -----------------------------------------------------------------------------

/**
 * Process a PDF buffer and extract text with table + RTF detection.
 * Use with pdf-parse or similar; accepts raw text for testing or
 * pre-extracted content.
 */
export async function processPDFFromBuffer(buffer: Buffer, fileName = "document.pdf"): Promise<ProcessedPDFResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);

  return processExtractedText(data.text, fileName, { numPages: data.numpages });
}

/**
 * Process extracted PDF text (e.g., from pdf-parse or external tool).
 * Useful when text is already extracted or for testing.
 */
export function processExtractedText(
  fullText: string,
  fileName = "document.pdf",
  meta?: { numPages?: number },
  options: PDFProcessorOptions = {}
): ProcessedPDFResult {
  const numPages = meta?.numPages ?? 1;

  // Split by page if we have page markers (pdf-parse sometimes injects \f)
  const pageTexts = fullText.split(/\f/).filter((t) => t.trim());
  const effectivePages = pageTexts.length > 0 ? pageTexts : [fullText];

  const allChunks: ProcessedChunk[] = [];
  const allRTF = new Set<string>();
  const allTables = new Set<string>();

  let chunkGlobalIndex = 0;

  for (let p = 0; p < effectivePages.length; p++) {
    const pageText = effectivePages[p];
    const pageNum = p + 1;

    const rawChunks = chunkText(pageText, pageNum, options);

    for (const raw of rawChunks) {
      const { hasTable, references } = detectTables(raw.content);
      const rtfFound = detectRTFKeywords(raw.content);

      references.forEach((r) => allTables.add(r));
      rtfFound.forEach((r) => allRTF.add(r));

      allChunks.push({
        ...raw,
        chunkIndex: chunkGlobalIndex++,
        containsTable: hasTable,
        rtfKeywordsDetected: rtfFound,
        tableReferences: references,
      });
    }
  }

  return {
    fileName,
    fullText,
    numPages,
    chunks: allChunks,
    summary: {
      totalChunks: allChunks.length,
      chunksWithTables: allChunks.filter((c) => c.containsTable).length,
      chunksWithRTFKeywords: allChunks.filter((c) => c.rtfKeywordsDetected.length > 0).length,
      allRTFKeywordsFound: [...allRTF],
      allTableReferences: [...allTables],
    },
  };
}

/**
 * Process a PDF file from disk.
 */
export async function processPDFFile(filePath: string, options?: PDFProcessorOptions): Promise<ProcessedPDFResult> {
  const buffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  return processPDFFromBuffer(buffer, fileName);
}

// -----------------------------------------------------------------------------
// CLI ENTRY POINT
// -----------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const pdfPath = args[0];

  if (!pdfPath) {
    console.error("Usage: npx tsx pdf_processor.ts <path-to-pdf>");
    process.exit(1);
  }

  try {
    const result = await processPDFFile(pdfPath);

    console.log("\n=== FDA Whisperer PDF Processor ===\n");
    console.log(`File: ${result.fileName}`);
    console.log(`Pages: ${result.numPages}`);
    console.log(`Chunks: ${result.summary.totalChunks}`);
    console.log(`Chunks with Tables: ${result.summary.chunksWithTables}`);
    console.log(`Chunks with RTF Keywords: ${result.summary.chunksWithRTFKeywords}`);

    if (result.summary.allTableReferences.length > 0) {
      console.log(`\nTables detected: ${result.summary.allTableReferences.join(", ")}`);
    }
    if (result.summary.allRTFKeywordsFound.length > 0) {
      console.log(`\nRTF keywords found: ${result.summary.allRTFKeywordsFound.join(", ")}`);
    }

    console.log("\n--- Sample Chunks with RTF Keywords ---");
    const rtfChunks = result.chunks.filter((c) => c.rtfKeywordsDetected.length > 0);
    for (const c of rtfChunks.slice(0, 3)) {
      console.log(`\n[Page ${c.pageNumber}] Keywords: ${c.rtfKeywordsDetected.join(", ")}`);
      console.log(c.content.slice(0, 300) + "...");
    }

    console.log("\n--- Sample Chunks with Tables ---");
    const tableChunks = result.chunks.filter((c) => c.containsTable);
    for (const c of tableChunks.slice(0, 3)) {
      console.log(`\n[Page ${c.pageNumber}] Tables: ${c.tableReferences.join(", ")}`);
      console.log(c.content.slice(0, 300) + "...");
    }
  } catch (err) {
    console.error("Error processing PDF:", err);
    process.exit(1);
  }
}

// Run CLI when executed directly
if (process.argv[1] === __filename) {
  main();
}

export default { processPDFFromBuffer, processPDFFile, processExtractedText };
