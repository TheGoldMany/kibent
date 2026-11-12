"use client";

import { useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { ALLOWED_MIME_TYPES, validateUpload } from "@/lib/validations";
import { cn } from "@/lib/utils";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Drag & drop fájlválasztó – a kiválasztott fájl egy rejtett `name` inputban kerül a formba. */
export function FileDropzone({ name = "file", disabled }: { name?: string; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function accept(f: File | undefined | null) {
    if (!f || !inputRef.current) return;
    const err = validateUpload(f);
    if (err) {
      setError(err);
      clear();
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(f);
    inputRef.current.files = dt.files;
    setError(null);
    setFile(f);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
  }

  return (
    <div className="space-y-1">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
          dragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50",
          disabled && "cursor-not-allowed opacity-50",
          file && "hidden",
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <span>
          <span className="font-medium text-primary">Kattints a tallózáshoz</span> vagy húzd ide a fájlt
        </span>
        <span className="text-xs text-muted-foreground">PDF, JPG vagy PNG · max. 10 MB</span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={ALLOWED_MIME_TYPES.join(",")}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </label>
      {file && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
          <button type="button" onClick={clear} aria-label="Fájl eltávolítása" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
