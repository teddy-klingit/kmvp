import type { Metadata } from "next";
import { Albert_Sans, Azeret_Mono } from "next/font/google";
import "./globals.css";

// Klingit brand fonts, app-wide: Albert Sans (stand-in for the licensed PolySans) for text, Azeret Mono for eyebrows, buttons and small labels.
const albertSans = Albert_Sans({ variable: "--font-albert", subsets: ["latin"], weight: ["300", "400", "600"] });
const azeretMono = Azeret_Mono({ variable: "--font-azeret", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "Klingit",
  description: "AI-run creative production, from brief to delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${albertSans.variable} ${azeretMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
