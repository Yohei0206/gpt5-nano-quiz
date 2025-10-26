import "./globals.css";
import type { Metadata } from "next";
import { QuizProvider } from "@/lib/store";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GPT-5 Nano Quiz",
  description: "React/Next.js クイズアプリ (gpt-5-nano)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <QuizProvider>
          <div className="max-w-3xl mx-auto px-4 py-6">
            <nav className="flex items-center justify-between mb-6 text-sm">
              <Link href="/" className="text-white/80 hover:text-white">クイズ</Link>
              <Link href="/admin" className="text-white/80 hover:text-white">管理</Link>
            </nav>
            {children}
          </div>
        </QuizProvider>
      </body>
    </html>
  );
}
