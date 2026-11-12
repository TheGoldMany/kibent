import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kibent – Csapatnaptár", template: "%s · Kibent" },
  description: "Ki van bent az irodában? Hibrid és remote csapatnaptár szabadság- és betegszabadság-kezeléssel.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <body className="min-h-screen font-sans">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
