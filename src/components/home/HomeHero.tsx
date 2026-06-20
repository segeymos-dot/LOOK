"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { PlusCircle, Search, Sparkles } from "lucide-react";

export function HomeHero() {
  const { user, isProvider, isCustomer, displayProfile, profile } = useAuth();
  const name = (displayProfile ?? profile)?.full_name?.split(" ")[0];
  const createHref = user ? "/requests/new" : "/login?redirect=/requests/new";
  const showCreateOrder = !user || isCustomer || (!isProvider && !displayProfile?.role);

  if (isProvider && !isCustomer) {
    return (
      <Card padding="lg" className="gradient-brand overflow-hidden text-white">
        <div className="relative">
          <Sparkles className="absolute -right-2 -top-2 h-16 w-16 text-white/10" />
          <p className="text-sm font-medium text-white/80">
            {name ? `Привет, ${name}!` : "Добро пожаловать"}
          </p>
          <h1 className="mb-2 mt-1 text-2xl font-extrabold tracking-tight">Найди заказы</h1>
          <p className="mb-5 text-sm leading-relaxed text-white/80">
            Смотрите открытые запросы и отправляйте отклики с ценой и сообщением
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/search" className="flex-1">
              <Button variant="secondary" className="w-full gap-2 bg-white text-brand-700 hover:bg-white/90">
                <Search className="h-5 w-5" />
                Смотреть заказы
              </Button>
            </Link>
            <Link href="/my/offers" className="flex-1">
              <Button variant="ghost" className="w-full text-white hover:bg-white/15">
                Мои предложения
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="gradient-brand overflow-hidden text-white">
      <div className="relative">
        <Sparkles className="absolute -right-2 -top-2 h-16 w-16 text-white/10" />
        <p className="text-sm font-medium text-white/80">
          {name ? `Привет, ${name}!` : "Добро пожаловать в LOOK"}
        </p>
        <h1 className="mb-2 mt-1 text-2xl font-extrabold tracking-tight">
          {isProvider ? "Заказы и исполнители" : "Найди исполнителя"}
        </h1>
        <p className="mb-5 text-sm leading-relaxed text-white/80">
          {isProvider
            ? "Публикуйте запросы или откликайтесь на заказы других пользователей"
            : "Опубликуй запрос и получи предложения от профессионалов"}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {showCreateOrder && (
            <Link href={createHref} className="flex-1">
              <Button variant="secondary" className="w-full gap-2 bg-white text-brand-700 hover:bg-white/90">
                <PlusCircle className="h-5 w-5" />
                Создать заказ
              </Button>
            </Link>
          )}
          {isCustomer && user && (
            <Link href="/my/requests" className="flex-1">
              <Button variant="ghost" className="w-full text-white hover:bg-white/15">
                Мои заказы
              </Button>
            </Link>
          )}
          {isProvider && (
            <Link href="/search" className="flex-1">
              <Button
                variant={showCreateOrder ? "ghost" : "secondary"}
                className={`w-full gap-2 ${showCreateOrder ? "text-white hover:bg-white/15" : "bg-white text-brand-700 hover:bg-white/90"}`}
              >
                <Search className="h-5 w-5" />
                Найти заказы
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
