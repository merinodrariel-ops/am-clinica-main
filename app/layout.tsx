
import type { Metadata } from "next";
import { Inter, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Providers from "@/components/Providers";
import MainLayout from "@/components/MainLayout";
import CategoriaSwitcher from "@/components/CategoriaSwitcher";
import { getOperationalNow } from '@/lib/local-date';

// Re-triggering Vercel deployment due to previous infrastructure delay

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AM Clínica – Operativa 360",
  description: "Sistema de gestión integral para clínica dental",
};

export default function RootLayout({
  children,
}: Readonly<{
    children: React.ReactNode;
}>) {
  const serverNow = getOperationalNow().getTime();
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${cormorant.variable} ${geistMono.variable} antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__AM_OPERATING_CLOCK_OFFSET_MS__ = ${serverNow} - Date.now();`,
          }}
        />
        <Providers>
          <Sidebar />
          <MainLayout>
            {children}
          </MainLayout>
          <CategoriaSwitcher />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
