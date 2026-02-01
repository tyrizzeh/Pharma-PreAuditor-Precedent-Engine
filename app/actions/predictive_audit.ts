"use server";

/**
 * FDA Whisperer - Predictive Audit Server Action
 * Multi-Angle Search for regulatory roadblock prediction
 * Red/Yellow/Green risk framework
 */

import { createClient } from "@/lib/supabase/server";
import { getEmbedding } from "@/lib/embeddings";
import { loadGuidanceContext } from "@/lib/guidance-loader";
import { chatCompletion } from "@/lib/llm";

export type RiskLevel = "RED" | "YELLOW" | "GREEN";

export interface AuditFinding {
  id: string;
  angle: "A" | "B" | "C";
  angleLabel: string;
  content: string;
  similarity: number;
  drugClass?: string;
  therapeuticArea?: string;
  reviewType?: string;
  reviewerSentiment?: string;
  riskLevel: RiskLevel;
  summary: string;
}

export interface PredictiveAuditResult {
  findings: AuditFinding[];
  riskSummary: { red: number; yellow: number; green: number };
  executiveSummary: string;
  guidanceContextUsed: boolean;
}

function assignRiskLevel(
  similarity: number,
  reviewerSentiment?: string | null
): RiskLevel {
  const sentiment = (reviewerSentiment || "").toLowerCase();
  if (sentiment === "critical" && similarity >= 0.75) return "RED";
  if (sentiment === "critical" || (sentiment === "concerned" && similarity >= 0.8))
    return "RED";
  if (sentiment === "concerned" || similarity >= 0.85) return "YELLOW";
  return "GREEN";
}

async function searchPrecedents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  embedding: number[],
  filters: { reviewType?: string; jurisdiction?: string; drugClass?: string },
  limit = 10
) {
  const { data, error } = await supabase.rpc("match_regulatory_precedents", {
    query_embedding: embedding,
    match_threshold: 0.6,
    match_count: limit,
    filter_drug_class: filters.drugClass ?? null,
    filter_review_type: filters.reviewType ?? null,
    filter_jurisdiction: filters.jurisdiction ?? null,
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
    reviewer_sentiment: string | null;
  }>;
}

export async function predictive_audit(
  draftText: string,
  documentType: "Clinical Protocol" | "IND Submission"
): Promise<PredictiveAuditResult> {
  const supabase = await createClient();

  // Load local FDA guidance for context (@docs-style)
  const guidanceContext = await loadGuidanceContext(12000);
  const guidanceContextUsed = guidanceContext.length > 0;

  // Generate embedding and search precedents (requires OpenAI - skipped if no key)
  const draftExcerpt = draftText.slice(0, 6000);
  let angleAResults: Awaited<ReturnType<typeof searchPrecedents>> = [];
  let angleBResults: Awaited<ReturnType<typeof searchPrecedents>> = [];
  let angleCResults: Awaited<ReturnType<typeof searchPrecedents>> = [];
  try {
    const embedding = await getEmbedding(draftExcerpt);
    angleAResults = await searchPrecedents(supabase, embedding, { reviewType: "Medical" }, 12);
    angleBResults = await searchPrecedents(supabase, embedding, { reviewType: "Pharmacology" }, 12);
    angleCResults = await searchPrecedents(supabase, embedding, { jurisdiction: "EMA" }, 12);
  } catch {
    // No OpenAI key - proceed with empty findings
  }

  // Build findings with risk levels
  const findings: AuditFinding[] = [];
  const angleLabels = {
    A: "Safety Signals (Similar Drug Classes)",
    B: "Reviewer Stickler Points (PK/PD)",
    C: "EMA EPAR Safety Warnings",
  };

  for (const r of angleAResults) {
    findings.push({
      id: r.id,
      angle: "A",
      angleLabel: angleLabels.A,
      content: r.content,
      similarity: r.similarity,
      drugClass: r.drug_class ?? undefined,
      therapeuticArea: r.therapeutic_area ?? undefined,
      reviewType: r.review_type ?? undefined,
      reviewerSentiment: r.reviewer_sentiment ?? undefined,
      riskLevel: assignRiskLevel(r.similarity, r.reviewer_sentiment),
      summary: r.content.slice(0, 200) + (r.content.length > 200 ? "..." : ""),
    });
  }
  for (const r of angleBResults) {
    findings.push({
      id: r.id,
      angle: "B",
      angleLabel: angleLabels.B,
      content: r.content,
      similarity: r.similarity,
      drugClass: r.drug_class ?? undefined,
      therapeuticArea: r.therapeutic_area ?? undefined,
      reviewType: r.review_type ?? undefined,
      reviewerSentiment: r.reviewer_sentiment ?? undefined,
      riskLevel: assignRiskLevel(r.similarity, r.reviewer_sentiment),
      summary: r.content.slice(0, 200) + (r.content.length > 200 ? "..." : ""),
    });
  }
  for (const r of angleCResults) {
    findings.push({
      id: r.id,
      angle: "C",
      angleLabel: angleLabels.C,
      content: r.content,
      similarity: r.similarity,
      drugClass: r.drug_class ?? undefined,
      therapeuticArea: r.therapeutic_area ?? undefined,
      reviewType: r.review_type ?? undefined,
      reviewerSentiment: r.reviewer_sentiment ?? undefined,
      riskLevel: assignRiskLevel(r.similarity, r.reviewer_sentiment),
      summary: r.content.slice(0, 200) + (r.content.length > 200 ? "..." : ""),
    });
  }

  // Dedupe by id
  const seen = new Set<string>();
  const uniqueFindings = findings.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  const riskSummary = {
    red: uniqueFindings.filter((f) => f.riskLevel === "RED").length,
    yellow: uniqueFindings.filter((f) => f.riskLevel === "YELLOW").length,
    green: uniqueFindings.filter((f) => f.riskLevel === "GREEN").length,
  };

  // Generate executive summary via LLM (Gemini or OpenAI)
  const precedentExcerpts = uniqueFindings
    .slice(0, 15)
    .map(
      (f) =>
        `[${f.angle}] ${f.riskLevel} (${(f.similarity * 100).toFixed(0)}% match): ${f.summary}`
    )
    .join("\n");

  const systemPrompt = `You are the FDA Whisperer—a Lead Regulatory Intelligence AI for Bio-Pharma. 
Analyze precedent findings and produce a concise executive summary for a ${documentType}.
Use Red/Yellow/Green risk framework. Be specific about regulatory roadblocks.
${guidanceContextUsed ? "Incorporate insights from the provided FDA guidance when relevant." : ""}`;

  const userPrompt = `Draft document type: ${documentType}

Precedent findings from SBAs/EPARs:
${precedentExcerpts || "No precedents (ingest SBAs/EPARs for vector search, or use OpenAI for embeddings)."}

Risk counts: ${riskSummary.red} RED, ${riskSummary.yellow} YELLOW, ${riskSummary.green} GREEN

Draft excerpt for context:
${draftExcerpt.slice(0, 2000)}

Generate a 3-5 sentence executive summary with actionable recommendations.
${guidanceContext ? `\n\nLocal FDA Guidance context:\n${guidanceContext.slice(0, 8000)}` : ""}`;

  let executiveSummary = "Insufficient precedent data to generate summary. Ingest SBAs/EPARs first.";

  try {
    const summary = await chatCompletion(systemPrompt, userPrompt, 500);
    if (summary && !summary.includes("No API key")) {
      executiveSummary = summary;
    }
  } catch (err) {
    console.error("LLM summary error:", err);
    executiveSummary =
      "Could not generate LLM summary. Add GEMINI_API_KEY or OPENAI_API_KEY to .env.local. " +
      `Risks: ${riskSummary.red} RED, ${riskSummary.yellow} YELLOW, ${riskSummary.green} GREEN.`;
  }

  return {
    findings: uniqueFindings,
    riskSummary,
    executiveSummary,
    guidanceContextUsed,
  };
}
