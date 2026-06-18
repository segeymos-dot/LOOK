"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  getProviderLoginRedirect,
  getProviderMessageUrl,
  getProviderOfferLoginRedirect,
  getProviderOfferUrl,
} from "@/lib/profile/provider-links";
import { MessageCircle, PlusCircle } from "lucide-react";

interface ProviderContactBarProps {
  providerId: string;
  chatHref: string | null;
  isAuthenticated: boolean;
  isOwnProfile: boolean;
  variant?: "inline" | "sticky";
}

export function ProviderContactBar({
  providerId,
  chatHref,
  isAuthenticated,
  isOwnProfile,
  variant = "sticky",
}: ProviderContactBarProps) {
  if (isOwnProfile) return null;

  const messageHref = isAuthenticated
    ? getProviderMessageUrl(providerId, chatHref)
    : getProviderLoginRedirect(providerId);

  const offerHref = isAuthenticated
    ? getProviderOfferUrl(providerId)
    : getProviderOfferLoginRedirect(providerId);

  const showChatHint = isAuthenticated && !chatHref;

  const content = (
    <div className="space-y-2">
      {showChatHint && (
        <p className="text-center text-xs text-text-muted">
          Чат откроется после принятия отклика исполнителя
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={messageHref} className="flex-1">
          <Button className="w-full gap-2" size="lg">
            <MessageCircle className="h-5 w-5" />
            Написать
          </Button>
        </Link>
        <Link href={offerHref} className="flex-1">
          <Button variant="outline" className="w-full gap-2" size="lg">
            <PlusCircle className="h-5 w-5" />
            Предложить заказ
          </Button>
        </Link>
      </div>
    </div>
  );

  if (variant === "inline") {
    return <div className="pt-2">{content}</div>;
  }

  return (
    <>
      <div className="h-36 sm:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 pb-safe shadow-nav backdrop-blur-md sm:hidden">
        <div className="mx-auto max-w-lg">{content}</div>
      </div>
    </>
  );
}
