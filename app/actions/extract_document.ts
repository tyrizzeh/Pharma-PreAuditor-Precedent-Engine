"use server";

import { extractTextFromFile } from "@/lib/extract-text";

export async function extractDocumentText(formData: FormData): Promise<{
  text: string;
  fileName: string;
  error?: string;
}> {
  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File)) {
    return { text: "", fileName: "", error: "No file provided" };
  }
  const { text, error } = await extractTextFromFile(file);
  return {
    text: text.slice(0, 16000),
    fileName: file.name,
    error: error && !text ? error : undefined,
  };
}
