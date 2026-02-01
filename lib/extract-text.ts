/**
 * Extract plain text from uploaded documents (PDF, DOCX, DOC, TXT)
 * Server-only: uses pdf-parse and mammoth
 */

export async function extractTextFromFile(
  file: File
): Promise<{ text: string; error?: string }> {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();

  if (ext === ".txt") {
    const text = await file.text();
    return { text: text.trim() };
  }

  if (ext === ".pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = await file.arrayBuffer();
      const data = await pdfParse(Buffer.from(buffer));
      return { text: (data.text || "").trim() };
    } catch (err) {
      return {
        text: "",
        error: err instanceof Error ? err.message : "PDF extraction failed",
      };
    }
  }

  if (ext === ".docx" || ext === ".doc") {
    try {
      const mammoth = (await import("mammoth")).default;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: result.value.trim(),
        error: result.messages.length ? result.messages[0]?.message : undefined,
      };
    } catch (err) {
      return {
        text: "",
        error: err instanceof Error ? err.message : "Word extraction failed",
      };
    }
  }

  return { text: "", error: `Unsupported format: ${ext}` };
}
