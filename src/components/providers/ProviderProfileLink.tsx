"use client";

import Link from "next/link";
import type { ReactNode, MouseEventHandler } from "react";

interface ProviderProfileLinkProps {
  providerId: string | null | undefined;
  children: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

/** Safe link to public provider profile. Renders children plain if id missing. */
export function ProviderProfileLink({
  providerId,
  children,
  className,
  onClick,
}: ProviderProfileLinkProps) {
  if (!providerId) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link
      href={`/providers/${providerId}`}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
