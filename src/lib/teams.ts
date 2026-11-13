import "server-only";
import { cookies } from "next/headers";
import { ACTIVE_TEAM_COOKIE } from "@/lib/auth";
import { dbErrorMessage, withUser } from "@/lib/db";

/** Az aktív csapat megjegyzése (egy évig). Csak server actionből / route handlerből hívható. */
export async function setActiveTeamCookie(companyId: string) {
  (await cookies()).set(ACTIVE_TEAM_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Meghívó beváltása; siker esetén az új csapat lesz az aktív. */
export async function acceptInvitation(userId: string, token: string): Promise<{ companyId: string } | { error: string }> {
  try {
    const row = await withUser(userId, (tx) =>
      tx.one<{ id: string }>("select public.accept_invitation($1) as id", [token]),
    );
    if (!row?.id) return { error: "Nem sikerült csatlakozni." };
    await setActiveTeamCookie(row.id);
    return { companyId: row.id };
  } catch (e) {
    return { error: dbErrorMessage(e) };
  }
}
