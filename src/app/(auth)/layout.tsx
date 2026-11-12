// Session-függő oldalak: mindig kérésidőben renderelődnek (Neon Auth).
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
