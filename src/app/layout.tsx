import type { Metadata } from "next";
import { Albert_Sans, Azeret_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Brand theme fonts (client Dashboard only for now). Not preloaded, so other pages don't fetch them.
const albertSans = Albert_Sans({ variable: "--font-albert", subsets: ["latin"], weight: ["300", "400", "600"], preload: false });
const azeretMono = Azeret_Mono({ variable: "--font-azeret", subsets: ["latin"], weight: ["400"], preload: false });

export const metadata: Metadata = {
  title: "Klingit",
  description: "AI-run creative production, from brief to delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${albertSans.variable} ${azeretMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
