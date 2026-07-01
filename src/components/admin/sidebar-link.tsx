"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  href: string;
  icon: React.ReactNode;
  label: string;
};

export function SidebarLink({ href, icon, label }: Props) {
  const pathname = usePathname();
  const isActive =
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/55 hover:bg-white/5 hover:text-white",
      ].join(" ")}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      {label}
    </Link>
  );
}
