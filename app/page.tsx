"use client";

import { useState, useRef, useEffect } from "react";
import { isSupportedFile } from "@/lib/file-types";
import { extractDocumentText } from "@/app/actions/extract_document";

type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedDoc, setAttachedDoc] = useState<{ name: string; content: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !attachedDoc) return;
    if (isLoading) return;

    const docToSend = attachedDoc;
    const userContent = text || `[Attached: ${docToSend?.name}]`;
    setMessages((m) => [...m, { role: "user", content: userContent }]);
    setInput("");
    setAttachedDoc(null);
    setIsLoading(true);

    let assistantContent = "";
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    const messageIndex = messages.length + 1;

    try {
      const allMessages: Message[] = [
        ...messages,
        { role: "user", content: userContent },
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.map(({ role, content }) => ({ role, content })),
          documentContent: docToSend?.content ?? undefined,
          documentName: docToSend?.name,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Request failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        setMessages((m) => {
          const next = [...m];
          if (next[messageIndex]) {
            next[messageIndex] = { role: "assistant", content: assistantContent };
          } else {
            next.push({ role: "assistant", content: assistantContent });
          }
          return next;
        });
      }

      if (!assistantContent) {
        setMessages((m) => {
          const next = [...m];
          next[messageIndex] = { role: "assistant", content: "[No response generated. Check GEMINI_API_KEY or OPENAI_API_KEY in .env.local.]" };
          return next;
        });
      }
    } catch (err) {
      setMessages((m) => {
        const next = [...m];
        next[messageIndex] = {
          role: "assistant",
          content: `[Error: ${err instanceof Error ? err.message : "Unknown error"}]`,
        };
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function processFile(file: File) {
    setFileError("");
    if (!isSupportedFile(file)) {
      setFileError("Use PDF, Word (.docx, .doc), or text (.txt).");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    const { text, fileName, error } = await extractDocumentText(formData);
    if (error) {
      setFileError(error);
      return;
    }
    setAttachedDoc({ name: fileName, content: text });
    setFileError("");
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processFile(file);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function removeAttachment() {
    setAttachedDoc(null);
    setFileError("");
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 px-4 py-3">
        <h1 className="text-xl font-bold text-emerald-400">The FDA Whisperer</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your AI regulatory intelligence assistant — think critically, analyze documents, ask follow-ups in real time
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <p className="mb-2">Start a conversation. Ask about FDA approval trends, clinical development stages, or attach a document for analysis.</p>
              <p className="text-sm">e.g., &quot;What questions should we expect at pre-IND for an oncology small molecule?&quot;</p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`mb-6 ${m.role === "user" ? "flex justify-end" : ""}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  m.role === "user"
                    ? "bg-emerald-600/20 text-slate-100 border border-emerald-500/30"
                    : "bg-slate-800/50 text-slate-200 border border-slate-700"
                }`}
              >
                <p className="text-xs font-medium text-slate-500 mb-1">
                  {m.role === "user" ? "You" : "FDA Whisperer"}
                </p>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.content || "…"}
                </div>
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content && (
            <div className="flex justify-start mb-6">
              <div className="rounded-2xl px-4 py-3 bg-slate-800/50 border border-slate-700">
                <span className="inline-flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse delay-100" />
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse delay-200" />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`shrink-0 border-t border-slate-800 p-4 transition-colors ${dragActive ? "bg-emerald-950/30 border-emerald-800/50" : ""}`}
      >
        <div className="max-w-3xl mx-auto">
          {attachedDoc && (
            <div className="mb-2 flex items-center gap-2 text-sm text-emerald-400">
              <span>📎 {attachedDoc.name}</span>
              <button
                type="button"
                onClick={removeAttachment}
                className="text-slate-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>
          )}
          {fileError && <p className="mb-2 text-sm text-red-400">{fileError}</p>}
          {dragActive && (
            <p className="mb-2 text-sm text-emerald-400">Drop document here (PDF, Word, or text)</p>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx,.doc"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="shrink-0 px-3 py-2 rounded-lg border border-slate-600 text-slate-400 hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
              title="Attach document"
            >
              📎
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const canSend = input.trim() || attachedDoc;
                  if (canSend && !isLoading) {
                    formRef.current?.requestSubmit();
                  }
                }
              }}
              placeholder="Ask anything… or drag & drop / attach a document"
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 min-h-[44px] max-h-32"
            />
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !attachedDoc)}
              className="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
