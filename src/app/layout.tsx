import type { Metadata, Viewport } from "next";
import { Archivo, Bodoni_Moda } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteUrl } from "@/lib/utils";
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

const description =
  "Csapatnaptár hibrid és remote csapatoknak: ki van az irodában, ki dolgozik otthonról, ki van szabadságon.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Kibent – ki van bent ma?", template: "%s · Kibent" },
  description,
  applicationName: "Kibent",
  appleWebApp: { title: "Kibent", capable: true, statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "hu_HU",
    siteName: "Kibent",
    title: "Kibent – ki van bent ma?",
    description,
  },
  twitter: { card: "summary_large_image", title: "Kibent – ki van bent ma?", description },
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
