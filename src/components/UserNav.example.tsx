// Example usage of UserNav component in a layout or header

import { UserNav } from "@/components/UserNav"

export function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Your App
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Other header items can go here */}
          <UserNav />
        </div>
      </div>
    </header>
  )
}

// Or in a Next.js app layout:
// app/layout.tsx
/*
import { UserNav } from "@/components/UserNav"
import { SessionProvider } from "next-auth/react"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <div className="min-h-screen">
            <header className="border-b">
              <div className="container flex h-16 items-center justify-between">
                <div>Logo</div>
                <UserNav />
              </div>
            </header>
            <main>{children}</main>
          </div>
        </SessionProvider>
      </body>
    </html>
  )
}
*/