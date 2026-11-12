import "server-only";

/**
 * Tranzakciós email küldése a Resend API-val (https://resend.com).
 * Beállítás: RESEND_API_KEY és EMAIL_FROM (pl. „Kibent <meghivo@lundasoftware.hu>”,
 * a feladó domainjét a Resendben hitelesíteni kell).
 * Ha nincs beállítva, nem küld semmit – a meghívó link ilyenkor kézzel másolható.
 */
export type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendInvitationEmail(input: {
  to: string;
  companyName: string;
  inviterName: string;
  url: string;
  expiresInDays: number;
}): Promise<EmailResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "not_configured" };

  const company = escapeHtml(input.companyName);
  const inviter = escapeHtml(input.inviterName);
  const url = escapeHtml(input.url);

  const html = `<!doctype html>
<html lang="hu">
  <body style="margin:0;padding:32px 16px;background:#FCFAFF;font-family:Arial,Helvetica,sans-serif;color:#000">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto">
      <tr><td style="padding-bottom:20px">
        <span style="display:inline-block;padding:6px 16px;border:2px solid #000;border-radius:999px;background:#FFE27A;font-family:Georgia,serif;font-style:italic;font-weight:bold;font-size:20px">Kibent</span>
      </td></tr>
      <tr><td style="border:2px solid #000;border-radius:18px;background:#fff;padding:28px;box-shadow:6px 6px 0 #000">
        <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:28px;line-height:1.15">Meghívtak a(z) ${company} csapatnaptárába</h1>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.5">${inviter} meghívott a Kibentbe, ahol a csapat látja, ki dolgozik az irodában, ki otthonról, és ki van szabadságon.</p>
        <a href="${url}" style="display:inline-block;padding:14px 26px;border:2px solid #000;border-radius:999px;background:#FFE27A;color:#000;font-weight:bold;font-size:16px;text-decoration:none">Csatlakozom a csapathoz</a>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#555">Regisztrálj vagy lépj be ezzel az email címmel, és automatikusan bekerülsz a csapatba. A meghívó ${input.expiresInDays} napig érvényes.</p>
        <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#777;word-break:break-all">Ha a gomb nem működik, másold be ezt a címet a böngésződbe: ${url}</p>
      </td></tr>
      <tr><td style="padding-top:16px;font-size:12px;color:#777">Ha nem számítottál erre a levélre, nyugodtan hagyd figyelmen kívül.</td></tr>
    </table>
  </body>
</html>`;

  const text = `${input.inviterName} meghívott a(z) ${input.companyName} csapatnaptárába a Kibentben.

Csatlakozás: ${input.url}

Regisztrálj vagy lépj be ezzel az email címmel, és automatikusan bekerülsz a csapatba. A meghívó ${input.expiresInDays} napig érvényes.`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: `Meghívó: ${input.companyName} csapatnaptára`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend hiba", res.status, await res.text().catch(() => ""));
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (error) {
    console.error("[email] küldési hiba", error);
    return { sent: false, reason: "failed" };
  }
}
