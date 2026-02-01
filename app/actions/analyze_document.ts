"use server";

import { extractTextFromFile } from "@/lib/extract-text";
import { chatCompletion } from "@/lib/llm";

export interface StageQuestion {
  stage: string;
  questions: string[];
}

export interface DocumentAnalysisResult {
  fileName: string;
  extractedTextLength: number;
  documentExcerpt: string;
  likelihoodOfSuccess: {
    score: number;
    tier: "High" | "Moderate" | "Low" | "Uncertain";
    reasoning: string;
    factors: string[];
  };
  stageQuestions: StageQuestion[];
  keyApprovalFactors: string[];
  potentialRisks: string[];
  regulatoryRiskSummary: string;
  precedentCount?: number;
  error?: string;
}

const CLINICAL_STAGES = [
  "Preclinical / IND-enabling",
  "Pre-IND meeting",
  "IND submission",
  "Phase 1 (safety, PK)",
  "End of Phase 1 / Phase 2 planning",
  "Phase 2 (efficacy, dose-finding)",
  "End of Phase 2 meeting",
  "Phase 3 (pivotal trials)",
  "Pre-NDA/BLA meeting",
  "NDA/BLA submission",
  "Advisory Committee (if applicable)",
  "Post-approval / REMS",
];

export async function analyzeDocument(
  formData: FormData
): Promise<DocumentAnalysisResult> {
  const file = formData.get("file") as File | null;
  const comment = (formData.get("comment") as string)?.trim() ?? "";

  const emptyResult = (error: string): DocumentAnalysisResult => ({
    fileName: "",
    extractedTextLength: 0,
    documentExcerpt: "",
    likelihoodOfSuccess: {
      score: 0,
      tier: "Uncertain",
      reasoning: "",
      factors: [],
    },
    stageQuestions: [],
    keyApprovalFactors: [],
    potentialRisks: [],
    regulatoryRiskSummary: "",
    error,
  });

  if (!file || !(file instanceof File)) {
    return emptyResult("No file provided");
  }

  const { text, error: extractError } = await extractTextFromFile(file);
  if (extractError && !text) {
    return emptyResult(`Extraction failed: ${extractError}`);
  }

  const excerpt = text.slice(0, 12000);
  const docContext = comment ? `User context/question: ${comment}\n\n` : "";

  const systemPrompt = `You are the FDA Whisperer—a Lead Regulatory Intelligence AI for Bio-Pharma. You analyze drug development documents and predict FDA approval likelihood based on:
- FDA approval trends, precedents, and historical data
- Therapeutic area success rates (e.g., oncology ~5%, rare disease higher)
- Regulatory requirements at each development stage
- Common reasons for Complete Response Letters (CRLs), Refusal to File (RTF), and holds
- Cross-references with EMA and international guidance where FDA often follows

Respond in structured, actionable format. Be specific and cite typical FDA expectations.`;

  // 1. Likelihood of success
  const likelihoodPrompt = `${docContext}Document excerpt:\n${excerpt}\n\n---
Based on this document and FDA approval trends/data:
1. Assign a LIKELIHOOD OF SUCCESS score (0-100) for eventual FDA approval.
2. Assign a tier: High (70+), Moderate (40-69), Low (below 40), or Uncertain if insufficient data.
3. Provide concise reasoning (2-4 sentences).
4. List 3-6 key factors driving the score (e.g., "First-in-class mechanism", "Unmet need in rare disease", "CMC concerns noted").

Respond in this exact JSON format:
{"score": <number>, "tier": "<High|Moderate|Low|Uncertain>", "reasoning": "<string>", "factors": ["<factor1>", "<factor2>", ...]}`;

  // 2. Stage-specific questions
  const stagesPrompt = `${docContext}Document excerpt:\n${excerpt}\n\n---
For each of these clinical development stages, list 3-6 questions the FDA typically asks for molecules like this. Base on FDA guidance, common CRL/RTF triggers, and precedent.

Stages: ${CLINICAL_STAGES.join(", ")}

Respond as a JSON array:
[{"stage": "<stage name>", "questions": ["<q1>", "<q2>", ...]}, ...]`;

  // 3. Key approval factors + risks + summary (combined for efficiency)
  const factorsPrompt = `${docContext}Document excerpt:\n${excerpt}\n\n---
Based on FDA approval precedents and data:
1. List 5-8 KEY APPROVAL FACTORS (what typically drives approval for similar molecules).
2. List 5-8 POTENTIAL RISKS (what could lead to CRL, RTF, or hold).
3. Write a 2-4 sentence REGULATORY RISK SUMMARY.

Respond in this exact JSON format:
{"keyApprovalFactors": ["<f1>", ...], "potentialRisks": ["<r1>", ...], "regulatoryRiskSummary": "<string>"}`;

  try {
    const [likelihoodRaw, stagesRaw, factorsRaw] = await Promise.all([
      chatCompletion(systemPrompt, likelihoodPrompt, 600),
      chatCompletion(systemPrompt, stagesPrompt, 2000),
      chatCompletion(systemPrompt, factorsPrompt, 1000),
    ]);

    const parseJson = <T>(raw: string, fallback: T): T => {
      try {
        const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        return m ? (JSON.parse(m[0]) as T) : fallback;
      } catch {
        return fallback;
      }
    };

    const likelihood = parseJson(likelihoodRaw, {
      score: 50,
      tier: "Uncertain" as const,
      reasoning: "Unable to parse. Review document manually.",
      factors: [],
    });

    const stageQuestions = parseJson<StageQuestion[]>(stagesRaw, []);
    const factors = parseJson<
      { keyApprovalFactors: string[]; potentialRisks: string[]; regulatoryRiskSummary: string }
    >(factorsRaw, {
      keyApprovalFactors: [],
      potentialRisks: [],
      regulatoryRiskSummary: "",
    });

    return {
      fileName: file.name,
      extractedTextLength: text.length,
      documentExcerpt: excerpt,
      likelihoodOfSuccess: {
        score: typeof likelihood.score === "number" ? likelihood.score : 50,
        tier:
          ["High", "Moderate", "Low", "Uncertain"].includes(likelihood.tier) ?
            likelihood.tier
          : "Uncertain",
        reasoning: likelihood.reasoning || "Insufficient data to assess.",
        factors: Array.isArray(likelihood.factors) ? likelihood.factors : [],
      },
      stageQuestions: Array.isArray(stageQuestions) ? stageQuestions : [],
      keyApprovalFactors: factors.keyApprovalFactors || [],
      potentialRisks: factors.potentialRisks || [],
      regulatoryRiskSummary: factors.regulatoryRiskSummary || "",
    };
  } catch (err) {
    console.error("Analyze document error:", err);
    return {
      fileName: file.name,
      extractedTextLength: text.length,
      documentExcerpt: excerpt,
      likelihoodOfSuccess: {
        score: 0,
        tier: "Uncertain",
        reasoning: "Analysis failed. Check GEMINI_API_KEY or OPENAI_API_KEY in .env.local.",
        factors: [],
      },
      stageQuestions: [],
      keyApprovalFactors: [],
      potentialRisks: [],
      regulatoryRiskSummary: "",
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
    "You are the FDA Whisperer—a Lead Regulatory Intelligence AI. Answer questions about the uploaded document using its content and the analysis. Be specific, actionable, and regulatory-focused.";
  const userPrompt = `Document excerpt:\n${documentExcerpt.slice(0, 6000)}\n\n---\nAnalysis:\n${analysisSummary}\n\n---\nQuestion: ${question}\n\nAnswer:`;
  try {
    return await chatCompletion(systemPrompt, userPrompt, 800);
  } catch (err) {
    return "Failed to answer. " + (err instanceof Error ? err.message : "");
  }
}
