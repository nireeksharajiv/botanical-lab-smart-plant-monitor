import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Load Inter font with latin subset
const inter = Inter({ 
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Botanical Lab - Smart Plant Watering",
  description: "Clean dashboard for Botanical Lab smart plant watering system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-[#F9FAFB] text-[#1F2937] antialiased">
        {children}
      </body>
    </html>
  );
}
