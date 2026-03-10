
import type { Metadata } from "next";
import { Inter, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Providers from "@/components/Providers";
import MainLayout from "@/components/MainLayout";
import CategoriaSwitcher from "@/components/CategoriaSwitcher";

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
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${cormorant.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Sidebar />
          <MainLayout>
            {children}
          </MainLayout>
          <CategoriaSwitcher />
        </Providers>
      </body>
    </html>
  );
}
