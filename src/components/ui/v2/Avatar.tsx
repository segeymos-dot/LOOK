import Image from "next/image";
import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  ring?: boolean;
}

const sizes = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
};

const pixelSizes = {
  sm: 36,
  md: 44,
  lg: 56,
  xl: 80,
};

export function Avatar({ src, name, size = "md", className, ring }: AvatarProps) {
  const ringClass = ring
    ? "ring-2 ring-white ring-offset-2 ring-offset-[#F8FBFF]"
    : "";

  if (src) {
    const useNativeImg = src.startsWith("data:") || src.startsWith("blob:");

    if (useNativeImg) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className={cn(
            "rounded-full object-cover shadow-[0_4px_16px_rgba(22,119,242,0.18)]",
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
          "rounded-full object-cover shadow-[0_4px_16px_rgba(22,119,242,0.18)]",
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
        "flex items-center justify-center rounded-full font-bold text-white",
        "bg-gradient-to-br from-[#33A1FF] to-[#1677F2]",
        "shadow-[0_6px_20px_rgba(22,119,242,0.28)]",
        sizes[size],
        ringClass,
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
