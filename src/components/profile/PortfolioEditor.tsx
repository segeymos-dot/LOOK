"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { readFileAsDataUrl, uploadPortfolioImage } from "@/lib/storage/upload";
import type { PortfolioItem } from "@/types";
import { Plus, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";

interface PortfolioEditorProps {
  userId: string;
  items: PortfolioItem[];
  onChange: (items: PortfolioItem[]) => void;
}

function newItem(): PortfolioItem {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    image_url: null,
    link: null,
  };
}

export function PortfolioEditor({ userId, items, onChange }: PortfolioEditorProps) {
  const updateItem = (id: string, patch: Partial<PortfolioItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-primary">Портфолио</label>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, newItem()])}>
          <Plus className="h-4 w-4" />
          Добавить проект
        </Button>
      </div>

      {items.length === 0 && (
        <Card padding="md" className="text-center text-sm text-text-muted">
          Добавьте проекты с фото, описанием и ссылками
        </Card>
      )}

      {items.map((item, index) => (
        <PortfolioItemEditor
          key={item.id}
          userId={userId}
          index={index}
          item={item}
          onUpdate={(patch) => updateItem(item.id, patch)}
          onRemove={() => removeItem(item.id)}
        />
      ))}
    </div>
  );
}

function PortfolioItemEditor({
  userId,
  index,
  item,
  onUpdate,
  onRemove,
}: {
  userId: string;
  index: number;
  item: PortfolioItem;
  onUpdate: (patch: Partial<PortfolioItem>) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImage = async (file: File) => {
    try {
      if (isDemoMode()) {
        onUpdate({ image_url: await readFileAsDataUrl(file) });
        return;
      }
      const supabase = createClient();
      const url = await uploadPortfolioImage(supabase, userId, item.id, file);
      onUpdate({ image_url: url });
    } catch {
      // ignore upload errors in UI for now
    }
  };

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Проект №{index + 1}</p>
        <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {item.image_url ? (
        <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-100">
          <Image
            src={item.image_url}
            alt={item.title || "Проект"}
            fill
            className="object-cover"
            unoptimized={item.image_url.startsWith("data:") || item.image_url.startsWith("blob:")}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-sm text-text-muted hover:border-brand-300 hover:bg-brand-50/50"
        >
          <Upload className="h-6 w-6" />
          Загрузить фото проекта
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImage(file);
          e.target.value = "";
        }}
      />

      <Input
        id={`portfolio-title-${item.id}`}
        label="Название"
        placeholder="Ремонт кухни"
        value={item.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
      />
      <Textarea
        id={`portfolio-desc-${item.id}`}
        label="Описание"
        rows={3}
        placeholder="Кратко опишите выполненную работу"
        value={item.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
      />
      <Input
        id={`portfolio-link-${item.id}`}
        label="Ссылка (необязательно)"
        placeholder="https://..."
        value={item.link ?? ""}
        onChange={(e) => onUpdate({ link: e.target.value || null })}
      />
      {item.image_url && (
        <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
          Заменить фото
        </Button>
      )}
    </Card>
  );
}
