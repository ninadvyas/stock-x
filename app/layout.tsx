import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Shell } from "./shared";
import "./globals.css";

export const metadata: Metadata = { title: "Stock" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.variable} bg-white font-sans tracking-tight text-zinc-900 antialiased`}>
        <main className="mx-auto w-full max-w-[500px] px-4 pt-10 pb-24 sm:pt-20">
          <Shell>{children}</Shell>
        </main>
      </body>
    </html>
  );
}
