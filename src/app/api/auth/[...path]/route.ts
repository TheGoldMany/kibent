import { authHandler } from "@/lib/auth/server";

// A Better Auth végpontjai (/api/auth/*).
export async function GET(request: Request) {
  return authHandler().GET(request);
}

export async function POST(request: Request) {
  return authHandler().POST(request);
}
