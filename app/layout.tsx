
import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Providers from "@/components/Providers";
import MainLayout from "@/components/MainLayout";
import RoleSwitcher from "@/components/RoleSwitcher";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
        className={`${inter.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Sidebar />
          <MainLayout>
            {children}
          </MainLayout>
          <RoleSwitcher />
        </Providers>
      </body>
    </html>
  );
}
