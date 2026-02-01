"use server";

/**
 * FDA Whisperer - Document Analysis Server Action
 * Analyzes any compound-related document and returns:
 * - What could go wrong / regulatory risks
 * - Expected questions at each approval stage
 * - Key approval factors from recent precedents
 */

import { createClient } from "@/lib/supabase/server";
import { getEmbedding } from "@/lib/embeddings";
import { loadGuidanceContext } from "@/lib/guidance-loader";
import { extractTextFromFile, isSupportedFile } from "@/lib/extract-text";
import { chatCompletion } from "@/lib/llm";

export interface StageQuestions {
  stage: string;
  stageLabel: string;
  questions: string[];
}

export interface DocumentAnalysisResult {
  fileName: string;
  extractedTextLength: number;
  documentExcerpt: string;
  stageQuestions: StageQuestions[];
  keyApprovalFactors: string[];
  regulatoryRiskSummary: string;
  potentialRisks: string[];
  precedentCount: number;
  error?: string;
}

const APPROVAL_STAGES = [
  { key: "pIND", label: "Pre-IND (pIND) Meeting" },
  { key: "IND", label: "IND Submission & 30-Day Review" },
  { key: "TypeB_EOP2", label: "Type B - End of Phase 2 (EOP2) Meeting" },
  { key: "TypeC", label: "Type C - General Guidance Meeting" },
  { key: "PreNDA", label: "Pre-NDA/BLA Meeting" },
  { key: "NDA", label: "NDA/BLA Submission & Review" },
  { key: "Advisory", label: "Advisory Committee (if applicable)" },
  { key: "Approval", label: "Approval Decision" },
];

async function searchPrecedents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  embedding: number[],
  limit = 20
) {
  const { data, error } = await supabase.rpc("match_regulatory_precedents", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit,
    filter_drug_class: null,
    filter_review_type: null,
    filter_jurisdiction: null,
  });

  if (error) {
    console.error("Supabase RPC error:", error);
    return [];
  }

  return (data ?? []) as Array<{
    id: string;
    content: string;
    similarity: number;
    drug_class: string | null;
    therapeutic_area: string | null;
    review_type: string | null;
  }>;
}

export async function analyzeDocument(formData: FormData): Promise<DocumentAnalysisResult> {
  const file = formData.get("file") as File | null;
  const comment = (formData.get("comment") as string)?.trim() ?? "";
  if (!file || !(file instanceof File)) {
    return {
      fileName: "",
      extractedTextLength: 0,
      documentExcerpt: "",
      stageQuestions: [],
      keyApprovalFactors: [],
      regulatoryRiskSummary: "",
      potentialRisks: [],
      precedentCount: 0,
      error: "No file provided",
    };
  }

  const fileName = file.name;
  if (!isSupportedFile(file)) {
    return {
      fileName,
      extractedTextLength: 0,
      documentExcerpt: "",
      stageQuestions: [],
      keyApprovalFactors: [],
      regulatoryRiskSummary: "",
      potentialRisks: [],
      precedentCount: 0,
      error: "Supported formats: PDF, Word (.docx, .doc), plain text (.txt)",
    };
  }

  try {
    const { text: fullText, error: extractError } = await extractTextFromFile(file);
    const extractedTextLength = fullText.length;

    if (fullText.trim().length < 100) {
      return {
        fileName,
        extractedTextLength,
        documentExcerpt: "",
        stageQuestions: [],
        keyApprovalFactors: [],
        regulatoryRiskSummary: "Insufficient text extracted. Document may be scanned, image-based, or empty.",
        potentialRisks: [],
        precedentCount: 0,
        error: extractError ?? "Could not extract sufficient text",
      };
    }

    const guidanceContext = await loadGuidanceContext(8000);
    const supabase = await createClient();

    const docExcerpt = fullText.slice(0, 8000);
    let precedents: Awaited<ReturnType<typeof searchPrecedents>> = [];
    try {
      const embedding = await getEmbedding(docExcerpt);
      precedents = await searchPrecedents(supabase, embedding, 25);
    } catch {
      // No OpenAI key or vector search failed - proceed without precedents
    }

    const precedentExcerpts = precedents
      .slice(0, 15)
      .map(
        (p) =>
          `[${(p.similarity * 100).toFixed(0)}% match] ${p.review_type ?? "N/A"}: ${p.content.slice(0, 300)}...`
      )
      .join("\n\n");

    const systemPrompt = `You are the FDA Whisperer—a Lead Regulatory Intelligence AI for Bio-Pharma.
Analyze ANY compound-related document (IND, protocol, CMC, PK/PD, safety data, clinical results, etc.) and identify:
1. What could potentially go wrong—regulatory risks, approval blockers, common deficiencies
2. Expected FDA questions at EACH approval stage
3. Key factors that drove recent approvals (what mattered most)
Be specific, actionable, and cite precedent patterns. Focus on risks and what to address.
${guidanceContext.length > 0 ? "Incorporate FDA guidance where relevant." : ""}`;

    const userPrompt = `Document: ${fileName} (${extractedTextLength} chars extracted)
${comment ? `\nUser comment/question: ${comment}\n(Give extra attention to this when analyzing.)\n` : ""}

Document excerpt (first ~4000 chars):
${docExcerpt.slice(0, 4000)}

---
Relevant regulatory precedents (SBAs/EPARs):
${precedentExcerpts || "No precedents in vector store. Ingest SBAs/EPARs for better analysis."}

---
TASK 1: List 5-10 POTENTIAL RISKS—what could go wrong with this compound based on the document and precedents (e.g., "CMC: insufficient stability data", "Safety: small N for rare AE", "Efficacy: post-hoc analyses").

TASK 2: For each approval stage, list 2-4 specific questions FDA typically asks. Stages: Pre-IND, IND, Type B (EOP2), Type C, Pre-NDA/BLA, NDA/BLA, Advisory Committee, Approval

TASK 3: List 5-8 KEY FACTORS that drove recent approvals (what to emphasize or strengthen).

TASK 4: One paragraph regulatory risk summary—what could derail or delay this compound?

Respond in this exact JSON format (no other text):
{
  "potentialRisks": ["Risk 1", "Risk 2", ...],
  "stageQuestions": [
    {"stage": "pIND", "stageLabel": "Pre-IND Meeting", "questions": ["Q1", "Q2", ...]},
    ... (all 8 stages)
  ],
  "keyApprovalFactors": ["Factor 1", "Factor 2", ...],
  "regulatoryRiskSummary": "One paragraph..."
}`;

    let stageQuestions: StageQuestions[] = APPROVAL_STAGES.map((s) => ({
      stage: s.key,
      stageLabel: s.label,
      questions: ["Analysis requires OpenAI API key and ingested precedents."],
    }));
    let keyApprovalFactors: string[] = [
      "Ingest FDA SBAs and EMA EPARs for precedent-based factors.",
    ];
    let regulatoryRiskSummary =
      "Enable OPENAI_API_KEY and ingest precedents for analysis.";
    let potentialRisks: string[] = [];

    try {
      const raw = await chatCompletion(systemPrompt, userPrompt, 2500);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          stageQuestions?: StageQuestions[];
          keyApprovalFactors?: string[];
          regulatoryRiskSummary?: string;
          potentialRisks?: string[];
        };
        if (parsed.stageQuestions?.length) stageQuestions = parsed.stageQuestions;
        if (parsed.keyApprovalFactors?.length)
          keyApprovalFactors = parsed.keyApprovalFactors;
        if (parsed.regulatoryRiskSummary)
          regulatoryRiskSummary = parsed.regulatoryRiskSummary;
        if (parsed.potentialRisks?.length) potentialRisks = parsed.potentialRisks;
      }
    } catch (err) {
      console.error("LLM analysis error:", err);
      regulatoryRiskSummary =
        "Analysis failed. Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local. " +
        (err instanceof Error ? err.message : "");
    }

    return {
      fileName,
      extractedTextLength,
      documentExcerpt: docExcerpt,
      stageQuestions,
      keyApprovalFactors,
      regulatoryRiskSummary,
      potentialRisks,
      precedentCount: precedents.length,
    };
  } catch (err) {
    console.error("Document analysis error:", err);
    return {
      fileName,
      extractedTextLength: 0,
      documentExcerpt: "",
      stageQuestions: [],
      keyApprovalFactors: [],
      regulatoryRiskSummary: "",
      potentialRisks: [],
      precedentCount: 0,
      error: err instanceof Error ? err.message : "Analysis failed",
    };
  }
}

export async function askDocumentQuestion(
  documentExcerpt: string,
  analysisSummary: string,
  question: string
): Promise<string> {
  if (!question.trim()) return "";

  const systemPrompt =
    "You are the FDA Whisperer—a Lead Regulatory Intelligence AI for Bio-Pharma. Answer questions about the uploaded document using its content and the analysis summary. Be specific, actionable, and regulatory-focused.";
  const userPrompt = `Document excerpt:\n${documentExcerpt.slice(0, 6000)}\n\n---\nAnalysis summary:\n${analysisSummary}\n\n---\nQuestion: ${question}\n\nAnswer:`;

  try {
    return await chatCompletion(systemPrompt, userPrompt, 800);
  } catch (err) {
    console.error("Ask question error:", err);
    return "Failed to answer. Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local. " + (err instanceof Error ? err.message : "");
  }
}
