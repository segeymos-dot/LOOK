"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import { readFileAsDataUrl, uploadAvatar } from "@/lib/storage/upload";
import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

interface AvatarUploadProps {
  userId: string;
  name: string;
  value: string | null;
  onChange: (url: string) => void;
}

export function AvatarUpload({ userId, name, value, onChange }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);

    try {
      if (isDemoMode()) {
        const dataUrl = await readFileAsDataUrl(file);
        onChange(dataUrl);
        return;
      }

      const supabase = createClient();
      const url = await uploadAvatar(supabase, userId, file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar src={value} name={name} size="xl" ring />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full gradient-brand text-white shadow-elevated disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {value ? "Изменить фото" : "Загрузить фото"}
      </Button>
      <p className="text-center text-xs text-text-muted">JPEG, PNG, WebP до 5 МБ</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
