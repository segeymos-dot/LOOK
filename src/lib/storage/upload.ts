import type { SupabaseClient } from "@supabase/supabase-js";

const AVATAR_BUCKET = "avatars";
const PORTFOLIO_BUCKET = "portfolio";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MAX_PORTFOLIO_SIZE = 10 * 1024 * 1024;

function validateImageFile(file: File, maxSize: number) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Допустимы только JPEG, PNG, WebP или GIF");
  }
  if (file.size > maxSize) {
    throw new Error(`Файл слишком большой (макс. ${Math.round(maxSize / 1024 / 1024)} МБ)`);
  }
}

function getExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp", "gif"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<string> {
  validateImageFile(file, MAX_AVATAR_SIZE);
  const ext = getExtension(file);
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function uploadPortfolioImage(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  file: File
): Promise<string> {
  validateImageFile(file, MAX_PORTFOLIO_SIZE);
  const ext = getExtension(file);
  const path = `${userId}/${itemId}.${ext}`;

  const { error } = await supabase.storage.from(PORTFOLIO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
