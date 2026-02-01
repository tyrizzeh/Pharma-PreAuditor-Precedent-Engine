"use client";

import { useState, useCallback } from "react";

interface DocumentDropzoneProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
}

export function DocumentDropzone({ onFileSelect, isLoading }: DocumentDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    []
  );

  const ACCEPTED_TYPES = [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];
  const ACCEPTED_EXT = [".pdf", ".txt", ".docx", ".doc"];

  const isValidFile = (file: File) =>
    ACCEPTED_TYPES.includes(file.type) ||
    ACCEPTED_EXT.some((ext) => file.name.toLowerCase().endsWith(ext));

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isLoading) return;
      const file = e.dataTransfer.files[0];
      if (file && isValidFile(file)) {
        onFileSelect(file);
      }
    },
    [onFileSelect, isLoading]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && isValidFile(file)) {
        onFileSelect(file);
      }
      e.target.value = "";
    },
    [onFileSelect]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl p-12 text-center transition-colors
        ${isDragOver ? "border-emerald-500 bg-emerald-950/30" : "border-slate-600 hover:border-slate-500"}
        ${isLoading ? "opacity-60 pointer-events-none" : "cursor-pointer"}
      `}
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />
      {isLoading ? (
        <div className="space-y-2">
          <div className="animate-pulse text-emerald-400 font-medium">
            Analyzing document...
          </div>
          <p className="text-sm text-slate-500">
            Extracting text, searching precedents, generating feedback
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-emerald-400 font-medium">
            Drop any compound-related document here or click to browse
          </p>
          <p className="text-sm text-slate-500">
            PDF, Word, or text • INDs, protocols, CMC, PK/PD, safety data, clinical results
          </p>
        </div>
      )}
    </div>
  );
}
