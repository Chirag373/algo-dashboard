import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Algo Trader",
  description: "Real-time Algo Trading Dashboard featuring NIFTY and BANKNIFTY live demo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
