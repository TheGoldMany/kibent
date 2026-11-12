"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Check, CheckCircle2, X } from "lucide-react";
import { reviewRequestAction } from "@/app/(dashboard)/requests/actions";
import { RequestSummary } from "@/components/requests/RequestCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LeaveRequestGroup } from "@/lib/requests";

export function ApprovalQueue({ groups, names }: { groups: LeaveRequestGroup[]; names: Record<string, string> }) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [visible, removeOptimistic] = useOptimistic(groups, (state, groupId: string) =>
    state.filter((g) => g.groupId !== groupId),
  );

  function decide(groupId: string, decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      removeOptimistic(groupId);
      const res = await reviewRequestAction(groupId, decision);
      if (!res.ok) setError(res.error);
    });
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink bg-white p-8 text-center">
        <CheckCircle2 className="h-8 w-8" />
        <p>Nincs jóváhagyásra váró kérelem.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl border-2 border-ink bg-bubblegum px-3.5 py-2.5 text-sm font-medium">{error}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        {visible.map((g) => (
          <Card key={g.groupId} className="bg-amber-50">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <RequestSummary group={g} personName={names[g.userId] ?? "Ismeretlen"} />
              <div className="flex shrink-0 gap-2">
                <Button size="sm" className="bg-emerald-300 hover:bg-emerald-400" onClick={() => decide(g.groupId, "approved")}>
                  <Check /> Elfogad
                </Button>
                <Button size="sm" variant="destructive" onClick={() => decide(g.groupId, "rejected")}>
                  <X /> Elutasít
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
