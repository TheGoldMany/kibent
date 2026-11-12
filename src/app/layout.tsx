import type { Metadata, Viewport } from "next";
import { Archivo, Bodoni_Moda } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-sans",
  display: "swap",
});

const display = Bodoni_Moda({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Kibent – ki van bent ma?", template: "%s · Kibent" },
  description:
    "Csapatnaptár hibrid és remote csapatoknak: ki van az irodában, ki dolgozik otthonról, ki van szabadságon.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFE27A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
