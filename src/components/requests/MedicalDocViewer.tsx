"use client";

import { useState, useTransition } from "react";
import { Eye, FileText, Loader2, Trash2 } from "lucide-react";
import { deleteMedicalDocAction, getMedicalDocUrlAction } from "@/app/(dashboard)/requests/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DocItem = { id: string; file_name: string; mime_type: string; uploaded_at: string };

/** Privát orvosi igazolás megtekintése 60 mp-ig érvényes signed URL-lel. */
export function MedicalDocViewer({ docs, canDelete }: { docs: DocItem[]; canDelete: boolean }) {
  const [preview, setPreview] = useState<{ url: string; mimeType: string; fileName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (docs.length === 0) return null;

  function open(id: string) {
    setError(null);
    setLoadingId(id);
    startTransition(async () => {
      const res = await getMedicalDocUrlAction(id);
      setLoadingId(null);
      if (res.ok) setPreview(res);
      else setError(res.error);
    });
  }

  function remove(id: string) {
    if (!confirm("Biztosan törlöd ezt az igazolást?")) return;
    setLoadingId(id);
    startTransition(async () => {
      const res = await deleteMedicalDocAction(id);
      setLoadingId(null);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="min-w-0 flex-1 truncate" title={d.file_name}>
              {d.file_name}
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => open(d.id)} disabled={loadingId === d.id}>
              {loadingId === d.id ? <Loader2 className="animate-spin" /> : <Eye />}
              Megtekintés
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-muted-foreground hover:text-rose-700"
                onClick={() => remove(d.id)}
                disabled={loadingId === d.id}
                aria-label="Igazolás törlése"
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-rose-700">{error}</p>}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.fileName}</DialogTitle>
            <DialogDescription>
              Bizalmas dokumentum. A megnyitó link 60 másodpercig érvényes.{" "}
              {preview && (
                <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Megnyitás új lapon
                </a>
              )}
            </DialogDescription>
          </DialogHeader>
          {preview &&
            (preview.mimeType === "application/pdf" ? (
              <iframe src={preview.url} title={preview.fileName} className="h-[70vh] w-full rounded-md border" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.fileName} className="max-h-[70vh] w-full rounded-md border object-contain" />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
