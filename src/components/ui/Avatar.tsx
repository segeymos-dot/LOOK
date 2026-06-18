import { cn, getInitials } from "@/lib/utils";
import Image from "next/image";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  ring?: boolean;
}

const sizes = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
  "2xl": "h-28 w-28 text-2xl",
};

const pixelSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
  "2xl": 112,
};

export function Avatar({ src, name, size = "md", className, ring }: AvatarProps) {
  const ringClass = ring ? "ring-2 ring-white ring-offset-2 ring-offset-surface-muted" : "";
  const useNativeImg =
    src?.startsWith("data:") || src?.startsWith("blob:");

  if (src) {
    if (useNativeImg) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className={cn(
            "rounded-full object-cover shadow-sm",
            sizes[size],
            ringClass,
            className
          )}
        />
      );
    }

    return (
      <Image
        src={src}
        alt={name}
        width={pixelSizes[size]}
        height={pixelSizes[size]}
        className={cn(
          "rounded-full object-cover shadow-sm",
          sizes[size],
          ringClass,
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white shadow-sm",
        sizes[size],
        ringClass,
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
