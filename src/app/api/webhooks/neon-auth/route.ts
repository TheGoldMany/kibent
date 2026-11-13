import { NextResponse, type NextRequest } from "next/server";
import { isEmailConfigured, magicLinkEmail, otpEmail, sendEmail } from "@/lib/email";
import { verifyNeonWebhook } from "@/lib/neon-webhook";

export const dynamic = "force-dynamic";

type NeonEvent = {
  event_id: string;
  event_type: string;
  user?: { email?: string };
  event_data?: {
    otp_code?: string;
    otp_type?: string;
    expires_at?: string;
    link_url?: string;
    link_type?: string;
  };
};

// Ismételt kézbesítésnél (azonos event_id) ne menjen ki kétszer a levél.
const handled = new Map<string, number>();
function alreadyHandled(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of handled) if (now - t > 15 * 60 * 1000) handled.delete(k);
  if (handled.has(id)) return true;
  handled.set(id, now);
  return false;
}

/**
 * Neon Auth webhook: a send.otp és send.magic_link eseményeknél a Neon a saját
 * levele helyett ezt hívja, és mi küldjük ki a Kibent-dizájnú emailt (Resend).
 * Beállítás: README → „Márkás auth emailek”.
 */
export async function POST(request: NextRequest) {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const rawBody = await request.text();
  let event: NeonEvent;
  try {
    event = (await verifyNeonWebhook(rawBody, request.headers, async () => {
      const res = await fetch(`${base.replace(/\/$/, "")}/.well-known/jwks.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`JWKS ${res.status}`);
      return res.json();
    })) as NeonEvent;
  } catch (error) {
    console.warn("[neon-webhook] elutasítva:", (error as Error).message);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (event.event_type !== "send.otp" && event.event_type !== "send.magic_link") {
    return NextResponse.json({ allowed: true });
  }
  const to = event.user?.email;
  if (!to) return NextResponse.json({ error: "missing email" }, { status: 400 });
  if (!isEmailConfigured()) {
    console.error("[neon-webhook] RESEND_API_KEY / EMAIL_FROM hiányzik – az auth email nem ment ki");
    return NextResponse.json({ error: "email not configured" }, { status: 500 });
  }
  if (alreadyHandled(event.event_id)) return NextResponse.json({ allowed: true, duplicate: true });

  const content =
    event.event_type === "send.otp"
      ? otpEmail({ code: event.event_data?.otp_code ?? "", type: event.event_data?.otp_type ?? "sign-in", expiresAt: event.event_data?.expires_at })
      : magicLinkEmail({ url: event.event_data?.link_url ?? "", type: event.event_data?.link_type });

  const result = await sendEmail({ to, ...content });
  if (!result.sent) {
    handled.delete(event.event_id); // hadd próbálja újra a Neon
    return NextResponse.json({ error: "send failed" }, { status: 502 });
  }
  return NextResponse.json({ allowed: true });
}
