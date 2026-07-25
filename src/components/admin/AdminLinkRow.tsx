"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function AdminLinkRow({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={`${link.href}-${link.label}`} href={link.href}>
          <Button variant="outline" size="sm">
            {link.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}
