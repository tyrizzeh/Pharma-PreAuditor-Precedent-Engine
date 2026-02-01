/**
 * Extract text from various document formats
 */

import { processPDFFromBuffer } from "@/services/ingestion/pdf_processor";

const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".docx", ".doc"];
const ACCEPTED_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export function isSupportedFile(file: File): boolean {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext) || ACCEPTED_TYPES.includes(file.type);
}

export async function extractTextFromFile(file: File): Promise<{ text: string; error?: string }> {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();

  if (ext === ".txt") {
    const text = await file.text();
    return { text: text.trim() };
  }

  if (ext === ".pdf") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processPDFFromBuffer(buffer, file.name);
    return { text: result.fullText };
  }

  if (ext === ".docx" || ext === ".doc") {
    const mammoth = (await import("mammoth")).default;
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim(), error: result.messages.length ? result.messages[0]?.message : undefined };
  }

  return { text: "", error: `Unsupported format: ${ext}` };
}
