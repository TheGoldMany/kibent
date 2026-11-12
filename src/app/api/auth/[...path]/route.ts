import { getAuth } from "@/lib/auth/server";

// A Neon Auth kéréseinek proxyja (/api/auth/*).
export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return getAuth().handler().GET(request, ctx);
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return getAuth().handler().POST(request, ctx);
}
