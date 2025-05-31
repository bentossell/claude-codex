import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserNav } from "@/components/UserNav";
import Link from "next/link";
import "./globals.css";
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette } from 'lucide-react';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Claude Codex",
  description: "AI-powered code task management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const colors = ['green', 'blue', 'pink', 'orange', 'purple'];
  const [selectedColor, setSelectedColor] = useState('green');
  const session = await getServerSession(authOptions);
  
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-white`} suppressHydrationWarning>
        <div className="min-h-screen flex flex-col">
          {/* Clean header without background */}
          <header className="border-b border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-8">
                <Link href="/" className="text-xl font-semibold text-gray-900">Claude Codex</Link>
              </div>
              <div className="flex items-center gap-6">
                <nav className="flex items-center gap-6">
                  <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Environments
                  </a>
                  <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Docs
                  </a>
                  <Link href="/logs" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                    Logs
                  </Link>
                </nav>
                {session ? (
                  <UserNav />
                ) : (
                  <a
                    href="/auth/signin"
                    className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
                  >
                    Sign in
                  </a>
                )}
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 bg-gray-50">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}