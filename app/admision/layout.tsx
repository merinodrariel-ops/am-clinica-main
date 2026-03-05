import type { Metadata } from "next";
import { Inter, Geist_Mono, Cormorant_Garamond } from "next/font/google";
import "../globals.css";

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
    title: "Admisión – AM Estética Dental",
    description: "Formulario de admisión de pacientes para AM Estética Dental",
};

export default function AdmisionLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body className={`${inter.variable} ${cormorant.variable} ${geistMono.variable} antialiased`}>
                {children}
            </body>
        </html>
    );
}
