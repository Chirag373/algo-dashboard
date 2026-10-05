"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FinbabaHeader() {
  const pathname = usePathname();

  return (
    <header className="bg-fin-panel border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-wider text-white">
          The Algo <span className="text-gray-400 font-light tracking-normal">Trader</span>
        </h1>
      </div>

      <nav className="flex items-center gap-4">
        <Link
          href="/finbaba/dashboard"
          className={`px-4 py-2 rounded font-medium transition-colors ${
            pathname === "/finbaba/dashboard"
              ? "bg-green-500 text-black"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          Dashboard
        </Link>
        <Link
          href="/finbaba/analytics"
          className={`px-4 py-2 rounded font-medium transition-colors ${
            pathname === "/finbaba/analytics"
              ? "bg-green-500 text-black"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          Analytics
        </Link>
      </nav>
    </header>
  );
}

export default function FinbabaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-fin-bg text-gray-200 font-sans flex flex-col">
      <FinbabaHeader />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
