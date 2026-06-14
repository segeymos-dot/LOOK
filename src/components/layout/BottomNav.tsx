import Link from "next/link";
import { Home, Search, PlusCircle, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "Главная" },
  { href: "/search", icon: Search, label: "Поиск" },
  { href: "/requests/new", icon: PlusCircle, label: "Создать" },
  { href: "/chat", icon: MessageCircle, label: "Чаты" },
  { href: "/profile", icon: User, label: "Профиль" },
];

interface BottomNavProps {
  activePath: string;
}

export function BottomNav({ activePath }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = activePath === href || (href !== "/" && activePath.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition-colors",
                isActive ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Icon className={cn("h-6 w-6", isActive && "stroke-[2.5]")} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
