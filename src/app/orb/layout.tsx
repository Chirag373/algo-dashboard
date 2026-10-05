import { OrbHeader, OrbNav } from "@/components/OrbNavigation";

export default function OrbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-orb-bg text-gray-100 font-sans flex flex-col">
      <OrbHeader />
      <OrbNav />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
