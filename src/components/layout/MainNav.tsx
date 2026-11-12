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

  return (
    <nav className="flex items-center gap-1">
      {items.map(({ href, label, icon: Icon, active, badge }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex items-center gap-2 rounded-full border-2 px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3.5",
            active ? "border-ink bg-butter shadow-brutal-xs" : "border-transparent hover:border-ink hover:bg-lilac-soft",
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
          {!!badge && badge > 0 && (
            <span
              className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-ink bg-amber-300 px-1 text-[11px] font-bold text-ink sm:static sm:h-5"
              aria-label={`${badge} függő kérelem`}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
