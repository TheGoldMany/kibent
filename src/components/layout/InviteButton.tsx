"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { InviteForm } from "@/components/invites/InviteForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Fejléc gomb: kollégák meghívása email címmel. */
export function InviteButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Kollégák meghívása">
          <UserPlus />
          <span className="hidden md:inline">Kollégák meghívása</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kollégák meghívása</DialogTitle>
          <DialogDescription>
            Írd be a kollégáid email címét. A levélben kapott gombbal elfogadják a meghívót (ha még nincs fiókjuk,
            előtte egy perc alatt regisztrálnak), és már bent is vannak.
          </DialogDescription>
        </DialogHeader>
        {open && <InviteForm />}
      </DialogContent>
    </Dialog>
  );
}
