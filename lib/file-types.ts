/**
 * Client-safe file type check (no Node-only deps)
 */

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
