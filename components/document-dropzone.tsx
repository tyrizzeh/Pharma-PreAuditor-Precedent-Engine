"use client";

import { useCallback, useState } from "react";
import { isSupportedFile } from "@/lib/file-types";

interface DocumentDropzoneProps {
  onFileSelect: (file: File) => void;
  onCommentChange?: (comment: string) => void;
  disabled?: boolean;
  comment?: string;
}

export function DocumentDropzone({
  onFileSelect,
  onCommentChange,
  disabled = false,
  comment = "",
}: DocumentDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setError("");
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!isSupportedFile(file)) {
        setError("Unsupported format. Use PDF, Word (.docx, .doc), or text (.txt).");
        return;
      }
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError("");
      const file = e.target.files?.[0];
      if (!file) return;
      if (!isSupportedFile(file)) {
        setError("Unsupported format. Use PDF, Word (.docx, .doc), or text (.txt).");
        return;
      }
      onFileSelect(file);
      e.target.value = "";
    },
    [onFileSelect]
  );

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative rounded-xl border-2 border-dashed p-8 text-center transition
          ${isDragging ? "border-emerald-500 bg-emerald-500/10" : "border-slate-500/50 bg-slate-800/30"}
          ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-emerald-500/70"}
        `}
      >
        <input
          type="file"
          accept=".pdf,.txt,.docx,.doc,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={handleInputChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        <p className="text-emerald-400 font-medium">
          Drop any drug molecule document here or click to browse
        </p>
        <p className="text-sm text-slate-500 mt-1">
          PDF, Word, or text • INDs, protocols, CMC, PK/PD, safety data, clinical results, MOAs
        </p>
      </div>

      {onCommentChange && (
        <div>
          <label htmlFor="comment" className="block text-sm text-slate-400 mb-1">
            Context or question (optional)
          </label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="e.g., What are the main approval risks for this mechanism?"
            disabled={disabled}
            rows={2}
            className="w-full rounded-lg border border-slate-600 bg-slate-800/50 px-4 py-2 text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
