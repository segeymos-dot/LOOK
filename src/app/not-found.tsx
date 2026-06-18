import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserRound } from "lucide-react";

export default function NotFound() {
  return (
    <AppLayout hideNav title="LOOK">
      <div className="p-4">
        <EmptyState
          icon={UserRound}
          title="Страница не найдена"
          description="Проверьте адрес или вернитесь на главную"
          action={
            <Link href="/">
              <Button>На главную</Button>
            </Link>
          }
        />
      </div>
    </AppLayout>
  );
}
