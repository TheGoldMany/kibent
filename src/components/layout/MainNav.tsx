"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function MainNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Naptár", icon: CalendarDays, active: pathname === "/" },
    { href: "/requests", label: "Kérelmek", icon: Inbox, active: pathname.startsWith("/requests"), badge: pendingCount },
    { href: "/settings", label: "Beállítások", icon: Settings, active: pathname.startsWith("/settings") },
  ];

  const badgeEl = (badge: number | undefined, floating: boolean) =>
    !!badge && badge > 0 ? (
      <span
        className={cn(
          "grid h-5 min-w-5 place-items-center rounded-full border-2 border-ink bg-amber-300 px-1 text-[11px] font-bold text-ink",
          floating && "absolute right-[calc(50%-1.75rem)] top-1",
        )}
        aria-label={`${badge} függő kérelem`}
      >
        {badge > 99 ? "99+" : badge}
      </span>
    ) : null;

  return (
    <>
      {/* Asztali: a fejlécben */}
      <nav aria-label="Fő navigáció" className="hidden items-center gap-1 sm:flex">
        {items.map(({ href, label, icon: Icon, active, badge }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition-colors",
              active ? "border-ink bg-butter shadow-brutal-xs" : "border-transparent hover:border-ink hover:bg-lilac-soft",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {badgeEl(badge, false)}
          </Link>
        ))}
      </nav>

      {/* Mobil: alsó fülsáv, hüvelykujjal elérhető */}
      <nav
        aria-label="Fő navigáció"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t-2 border-ink bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {items.map(({ href, label, icon: Icon, active, badge }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-semibold",
              active ? "bg-butter" : "active:bg-lilac-soft",
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
            {label}
            {badgeEl(badge, true)}
          </Link>
        ))}
      </nav>
    </>
  );
}
