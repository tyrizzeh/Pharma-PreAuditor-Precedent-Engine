"use client";

import { useState } from "react";
import { predictive_audit, type PredictiveAuditResult, type AuditFinding } from "./actions/predictive_audit";
import { analyzeDocument, type DocumentAnalysisResult, type StageQuestions } from "./actions/analyze_document";
import { DocumentDropzone } from "@/components/document-dropzone";

export default function Home() {
  const [draft, setDraft] = useState("");
  const [docType, setDocType] = useState<"Clinical Protocol" | "IND Submission">("Clinical Protocol");
  const [result, setResult] = useState<PredictiveAuditResult | null>(null);
  const [docResult, setDocResult] = useState<DocumentAnalysisResult | null>(null);
  const [docComment, setDocComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!draft.trim()) return;

    setLoading(true);
    try {
      const res = await predictive_audit(draft, docType);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(file: File) {
    setError(null);
    setDocResult(null);
    setDocLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await analyzeDocument(formData);
      setDocResult(res);
      if (res.error) setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document analysis failed");
    } finally {
      setDocLoading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <header className="mb-12">
        <h1 className="text-3xl font-bold text-emerald-400">FDA Whisperer</h1>
        <p className="text-slate-400 mt-1">
          Predict regulatory roadblocks from SBAs & EPARs
        </p>
      </header>

      {/* Document Drop Zone */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-slate-200 mb-4">
          Document Analysis — Drop a PDF
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Get immediate feedback on what could go wrong with your compound—regulatory risks, expected FDA questions at each stage, and key approval factors from recent precedents.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Comments or specific question (optional)
          </label>
          <textarea
            value={docComment}
            onChange={(e) => setDocComment(e.target.value)}
            placeholder="e.g., Focus on CMC concerns. Or: What safety signals should we watch for?"
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder-slate-500 resize-y"
            disabled={docLoading}
          />
        </div>
        <DocumentDropzone onFileSelect={handleFileSelect} isLoading={docLoading} />
      </section>

      {docResult && !docResult.error && (
        <DocumentAnalysisResults result={docResult} />
      )}

      {docResult?.error && (
        <div className="p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-200 mb-8">
          {docResult.error}
        </div>
      )}

      <hr className="border-slate-700 my-12" />

      <h2 className="text-lg font-semibold text-slate-200 mb-4">
        Predictive Audit — Paste Draft Text
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4 mb-12">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Document Type
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as "Clinical Protocol" | "IND Submission")}
            className="w-full max-w-xs px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-slate-100"
          >
            <option value="Clinical Protocol">Clinical Protocol</option>
            <option value="IND Submission">IND Submission</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Draft Text (Clinical Protocol or IND Submission)
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste your draft clinical protocol or IND submission here..."
            rows={10}
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder-slate-500 resize-y"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? "Running Predictive Audit..." : "Run Predictive Audit"}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-200 mb-8">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-8">
          <div className="flex gap-4 items-center">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                result.riskSummary.red > 0 ? "bg-red-500/20 text-red-300" : "bg-slate-700 text-slate-400"
              }`}
            >
              RED: {result.riskSummary.red}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                result.riskSummary.yellow > 0 ? "bg-yellow-500/20 text-yellow-300" : "bg-slate-700 text-slate-400"
              }`}
            >
              YELLOW: {result.riskSummary.yellow}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                result.riskSummary.green > 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-400"
              }`}
            >
              GREEN: {result.riskSummary.green}
            </span>
            {result.guidanceContextUsed && (
              <span className="text-xs text-slate-500">Local FDA guidance applied</span>
            )}
          </div>

          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300 mb-2">Executive Summary</h2>
            <p className="text-slate-200 whitespace-pre-wrap">{result.executiveSummary}</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Findings by Angle</h2>
            <div className="space-y-4">
              {result.findings.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function DocumentAnalysisResults({ result }: { result: DocumentAnalysisResult }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  const analysisSummary = [
    result.regulatoryRiskSummary,
    result.potentialRisks?.length ? `Risks: ${result.potentialRisks.join("; ")}` : "",
    result.keyApprovalFactors?.length ? `Key factors: ${result.keyApprovalFactors.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAskLoading(true);
    setAnswer("");
    try {
      const a = await askDocumentQuestion(
        result.documentExcerpt ?? "",
        analysisSummary,
        question.trim()
      );
      setAnswer(a);
    } finally {
      setAskLoading(false);
    }
  }

  return (
    <section className="space-y-8 mb-12 p-6 rounded-xl bg-slate-800/30 border border-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-emerald-400">{result.fileName}</h3>
        <span className="text-xs text-slate-500">
          {result.extractedTextLength.toLocaleString()} chars • {result.precedentCount} precedents matched
        </span>
      </div>

      <div className="p-4 rounded-lg bg-red-950/20 border border-red-800/50">
        <h4 className="text-sm font-semibold text-red-300 mb-2">What Could Go Wrong</h4>
        <p className="text-slate-200 text-sm whitespace-pre-wrap mb-3">{result.regulatoryRiskSummary}</p>
        {result.potentialRisks?.length > 0 && (
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-300">
            {result.potentialRisks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-300 mb-4">
          Expected FDA Questions by Approval Stage
        </h4>
        <div className="space-y-4">
          {result.stageQuestions.map((stage) => (
            <StageCard key={stage.stage} stage={stage} />
          ))}
        </div>
      </div>

      <div className="p-4 rounded-lg bg-emerald-950/20 border border-emerald-800/50">
        <h4 className="text-sm font-semibold text-emerald-300 mb-3">
          Key Approval Factors (from recent precedents)
        </h4>
        <ul className="list-disc list-inside space-y-1 text-slate-200 text-sm">
          {result.keyApprovalFactors.map((factor, i) => (
            <li key={i}>{factor}</li>
          ))}
        </ul>
      </div>

      <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700">
        <h4 className="text-sm font-semibold text-slate-300 mb-2">Ask a follow-up question</h4>
        <p className="text-xs text-slate-500 mb-3">
          Ask anything about this document and its regulatory implications.
        </p>
        <form onSubmit={handleAsk} className="space-y-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., What CMC concerns might FDA raise? How should we address the safety database gap?"
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder-slate-500 resize-y"
            disabled={askLoading}
          />
          <button
            type="submit"
            disabled={askLoading || !question.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {askLoading ? "Thinking..." : "Ask"}
          </button>
        </form>
        {answer && (
          <div className="mt-4 p-3 rounded-lg bg-slate-800 border border-slate-600">
            <p className="text-sm text-slate-200 whitespace-pre-wrap">{answer}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function StageCard({ stage }: { stage: StageQuestions }) {
  const [expanded, setExpanded] = useState(false);
  const hasQuestions = stage.questions?.length > 0;
  return (
    <div className="p-4 rounded-lg border border-slate-700 bg-slate-800/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="font-medium text-slate-200">{stage.stageLabel}</span>
        <span className="text-xs text-slate-500">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && hasQuestions && (
        <ul className="mt-3 space-y-2 pl-4 border-l-2 border-emerald-800/50">
          {stage.questions.map((q, i) => (
            <li key={i} className="text-sm text-slate-300">{q}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: AuditFinding }) {
  const [expanded, setExpanded] = useState(false);
  const riskColors = {
    RED: "bg-red-500/20 text-red-300 border-red-700",
    YELLOW: "bg-yellow-500/20 text-yellow-300 border-yellow-700",
    GREEN: "bg-emerald-500/20 text-emerald-300 border-emerald-700",
  };

  return (
    <div
      className={`p-4 rounded-lg border ${
        finding.riskLevel === "RED"
          ? "border-red-700/50 bg-red-950/20"
          : finding.riskLevel === "YELLOW"
          ? "border-yellow-700/50 bg-yellow-950/10"
          : "border-slate-700 bg-slate-800/30"
      }`}
    >
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-400">Angle {finding.angle}</span>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium border ${riskColors[finding.riskLevel]}`}
          >
            {finding.riskLevel}
          </span>
          <span className="text-xs text-slate-500">
            {(finding.similarity * 100).toFixed(0)}% match
          </span>
        </div>
        {finding.drugClass && (
          <span className="text-xs text-slate-400">{finding.drugClass}</span>
        )}
      </div>
      <p className="text-sm text-slate-300 mb-2">{finding.angleLabel}</p>
      <p className="text-slate-200 text-sm">
        {expanded ? finding.content : finding.summary}
      </p>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-xs text-emerald-400 hover:underline"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
