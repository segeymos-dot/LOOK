"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
} from "@/lib/admin/speech-recognition";
import { parseVoiceNavIntent } from "@/lib/admin/voice-intents";
import { resolveVoiceNavIntent } from "@/lib/admin/voice-nav";
import { cn } from "@/lib/utils";

type Phase =
  | "idle"
  | "listening"
  | "heard"
  | "resolving"
  | "not_found"
  | "order_not_found"
  | "unknown"
  | "error"
  | "unavailable";

/**
 * Compact platform-admin voice navigation control.
 * Mount only when isPlatformAdmin — no write/destructive intents.
 */
export function AdminVoiceNav() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const gotResultRef = useRef(false);

  useEffect(() => {
    const ok = isSpeechRecognitionSupported();
    setSupported(ok);
    if (!ok) setPhase("unavailable");
  }, []);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, []);

  const handleTranscript = useCallback(
    async (transcript: string) => {
      const text = transcript.trim();
      setHeard(text || null);
      setPhase("heard");

      if (!text) {
        setPhase("unknown");
        return;
      }

      // Brief pause so the user can read the recognized phrase
      await new Promise((r) => setTimeout(r, 700));
      setPhase("resolving");

      const intent = parseVoiceNavIntent(text);
      const result = await resolveVoiceNavIntent(intent);

      if (result.status === "navigate") {
        router.push(result.href);
        setPhase("idle");
        return;
      }
      if (result.status === "not_found") {
        setPhase(intent.type === "find_order" ? "order_not_found" : "not_found");
        return;
      }
      if (result.status === "error") {
        setPhase("error");
        return;
      }
      setPhase("unknown");
    },
    [router]
  );

  const startListening = () => {
    if (!supported || phase === "listening" || phase === "resolving") return;

    setHeard(null);
    gotResultRef.current = false;
    setPhase("listening");
    stopRef.current?.();
    stopRef.current = startSpeechRecognition({
      lang: locale === "ru" ? "ru-RU" : "en-US",
      onResult: (transcript) => {
        gotResultRef.current = true;
        stopRef.current = null;
        void handleTranscript(transcript);
      },
      onError: () => {
        stopRef.current = null;
        if (!gotResultRef.current) {
          setPhase((prev) => (prev === "listening" ? "idle" : prev));
        }
      },
      onEnd: () => {
        stopRef.current = null;
        if (!gotResultRef.current) {
          setPhase((prev) => (prev === "listening" ? "idle" : prev));
        }
      },
    });
  };

  const statusText = (() => {
    switch (phase) {
      case "unavailable":
        return t("admin.voiceNav.unavailable");
      case "listening":
        return t("admin.voiceNav.listening");
      case "heard":
      case "resolving":
        return heard ? `«${heard}»` : t("admin.voiceNav.listening");
      case "not_found":
        return t("admin.voiceNav.notFound");
      case "order_not_found":
        return t("admin.voiceNav.orderNotFound");
      case "unknown":
        return t("admin.voiceNav.unknown");
      case "error":
        return t("admin.voiceNav.error");
      default:
        return t("admin.voiceNav.prompt");
    }
  })();

  const micDisabled = !supported || phase === "listening" || phase === "resolving";

  return (
    <div className="flex max-w-full items-center gap-3 pt-1">
      <button
        type="button"
        onClick={startListening}
        disabled={micDisabled}
        aria-label={t("admin.voiceNav.ariaLabel")}
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8ECF1] bg-white text-[#0F172A] shadow-sm transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677F2] focus-visible:ring-offset-2",
          phase === "listening" && "animate-pulse border-[#1677F2] text-[#1677F2]",
          micDisabled && phase !== "listening" && "opacity-60",
          !supported && "cursor-not-allowed opacity-50"
        )}
      >
        <Mic className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>
      <p
        className={cn(
          "min-w-0 text-[13px] font-medium leading-snug text-[#0F172A]",
          (phase === "not_found" ||
            phase === "order_not_found" ||
            phase === "unknown" ||
            phase === "error") &&
            "text-[#64748B]"
        )}
      >
        {statusText}
      </p>
    </div>
  );
}
