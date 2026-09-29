import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brand, cs } from "@repo/copy";
import "./globals.css";

// latin-ext je nutný pro české znaky (ě, š, č, ř, ž, ý, á, í, é, ů, ú, ď, ť, ň)
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: `${brand.name} – ${cs.home.tagline}`,
  description: cs.home.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
