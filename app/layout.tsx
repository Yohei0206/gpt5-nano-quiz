import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { QuizProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "GPT-5 Nano Quiz",
  description: "React/Next.js クイズアプリ (gpt-5-nano)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLocal = process.env.NODE_ENV !== "production";
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <QuizProvider>
          <div className="max-w-3xl mx-auto px-4 py-6">
            <nav className="flex items-center justify-between mb-6 text-sm gap-4">
              <div className="flex items-center gap-4">
                <Link href="/" className="text-white/80 hover:text-white">
                  クイズ
                </Link>
                <Link
                  href="/play/buzzer"
                  className="text-white/80 hover:text-white"
                >
                  対戦
                </Link>
              </div>
              {isLocal && (
                <Link href="/admin" className="text-white/80 hover:text-white">
                  管理
                </Link>
              )}
            </nav>
            {children}
          </div>
        </QuizProvider>
      </body>
    </html>
  );
}
