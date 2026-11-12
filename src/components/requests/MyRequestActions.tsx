"use client";

import { useActionState, useState, useTransition } from "react";
import { Paperclip, Undo2 } from "lucide-react";
import { cancelRequestAction, uploadMedicalDocAction } from "@/app/(dashboard)/requests/actions";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";

export function CancelRequestButton({ groupId, label }: { groupId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Biztosan visszavonod: ${label}?`)) return;
          startTransition(async () => {
            const res = await cancelRequestAction(groupId);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        <Undo2 /> Visszavonás
      </Button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

export function UploadDocForm({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(uploadMedicalDocAction, null);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setOpen(true)}>
        <Paperclip /> Igazolás feltöltése
      </Button>
    );
  }
  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="groupId" value={groupId} />
      <FileDropzone />
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Mégse
        </Button>
        <SubmitButton size="sm" pendingText="Feltöltés…">
          Feltöltés
        </SubmitButton>
      </div>
    </form>
  );
}
