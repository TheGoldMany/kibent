import "server-only";
import { withUser } from "@/lib/db";

/** Függő szabadságkérelmek (csoportok) száma a cégben – admin számára. */
export async function countPendingRequests(userId: string, companyId: string): Promise<number> {
  const row = await withUser(userId, (tx) =>
    tx.one<{ n: number }>(
      `select count(distinct coalesce(request_group_id::text, user_id::text))::int as n
         from schedules
        where company_id = $1 and approval_status = 'pending'`,
      [companyId],
    ),
  );
  return row?.n ?? 0;
}
