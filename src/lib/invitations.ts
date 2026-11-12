import "server-only";
import { withSystem } from "@/lib/db";
import { hasV2Schema } from "@/lib/schema";
import { uuidSchema } from "@/lib/validations";

export type InvitePreview = {
  email: string;
  companyId: string;
  companyName: string;
  expired: boolean;
  accepted: boolean;
  /** Van-e már Kibent profil ezzel az email címmel (→ belépés, különben regisztráció). */
  hasAccount: boolean;
};

/**
 * Meghívó adatai token alapján (bejelentkezés előtt is). Tulajdonosi kapcsolat:
 * a token titkos, csak a meghívott kapja meg emailben.
 */
export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  if (!uuidSchema.safeParse(token).success) return null;
  if (!(await hasV2Schema())) return null;
  const row = await withSystem((db) =>
    db.one<{
      email: string;
      company_id: string;
      company_name: string;
      expired: boolean;
      accepted: boolean;
      has_account: boolean;
    }>(
      `select i.email, i.company_id, c.name as company_name,
              (i.accepted_at is null and i.expires_at < now()) as expired,
              (i.accepted_at is not null) as accepted,
              exists (select 1 from profiles p where lower(p.email) = i.email) as has_account
         from company_invitations i
         join companies c on c.id = i.company_id
        where i.token = $1`,
      [token],
    ),
  );
  if (!row) return null;
  return {
    email: row.email,
    companyId: row.company_id,
    companyName: row.company_name,
    expired: row.expired,
    accepted: row.accepted,
    hasAccount: row.has_account,
  };
}

/** „/invite/<uuid>” → uuid, egyébként null. */
export function inviteTokenFromPath(path: string): string | null {
  const m = /^\/invite\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path);
  return m ? m[1]! : null;
}
