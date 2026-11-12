"use client";

import { useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function InviteButton({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(inviteUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <UserPlus />}
          <span className="hidden md:inline">{copied ? "Link másolva!" : "Kollégák meghívása"}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Meghívó link másolása – küldd el a kollégáidnak</TooltipContent>
    </Tooltip>
  );
}
