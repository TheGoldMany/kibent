"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function CopyButton({
  value,
  label = "Másolás",
  copiedLabel = "Másolva!",
  ...props
}: { value: string; label?: string; copiedLabel?: string } & Omit<ButtonProps, "onClick" | "value">) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Régi böngészők / nem biztonságos kontextus
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" onClick={copy} {...props}>
      {copied ? <Check /> : <Copy />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
