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
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p>Nincs jóváhagyásra váró kérelem. Szép munka! 🎉</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((g) => (
          <Card key={g.groupId} className="border-amber-200">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <RequestSummary group={g} personName={names[g.userId] ?? "Ismeretlen"} />
              <div className="flex shrink-0 gap-2">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => decide(g.groupId, "approved")}>
                  <Check /> Elfogad
                </Button>
                <Button size="sm" variant="outline" className="text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => decide(g.groupId, "rejected")}>
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
