"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  ensureMicrophonePermission,
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  type SpeechDiagEvent,
  type SpeechSession,
} from "@/lib/admin/speech-recognition";
import { parseVoiceNavIntent } from "@/lib/admin/voice-intents";
import { resolveVoiceNavIntent } from "@/lib/admin/voice-nav";
import { cn } from "@/lib/utils";

type Phase =
  | "idle"
  | "starting"
  | "listening"
  | "processing"
  | "not_found"
  | "order_not_found"
  | "unknown"
  | "error"
  | "permission_denied"
  | "unavailable";

function isStagingVoiceDiag(): boolean {
  if (typeof window === "undefined") return false;
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercelEnv === "preview") return true;
  const host = window.location.hostname;
  return (
    host.includes("staging") ||
    host.endsWith(".vercel.app") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

function voiceDiag(event: SpeechDiagEvent, detail?: string) {
  if (!isStagingVoiceDiag()) return;
  // Safe staging diagnostics only — never log audio or secrets.
  console.info("[voice-nav]", event, detail ?? "");
}

/**
 * Compact platform-admin voice navigation control.
 * Mount only when isPlatformAdmin — no write/destructive intents.
 */
export function AdminVoiceNav() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const sessionRef = useRef<SpeechSession | null>(null);
  const gotResultRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const ok = isSpeechRecognitionSupported();
    setSupported(ok);
    voiceDiag("recognition_supported", ok ? "true" : "false");
    if (!ok) setPhase("unavailable");
  }, []);

  useEffect(() => {
    return () => {
      sessionRef.current?.abort();
      sessionRef.current = null;
    };
  }, []);

  const handleTranscript = useCallback(
    async (transcript: string) => {
      const text = transcript.trim();
      setHeard(text || null);
      setPhase("processing");

      if (!text) {
        setPhase("unknown");
        return;
      }

      // Brief pause so the user can read the recognized phrase
      await new Promise((r) => setTimeout(r, 700));

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
        setErrorDetail(null);
        setPhase("error");
        return;
      }
      setPhase("unknown");
    },
    [router]
  );

  const mapSpeechError = (code: string): Phase => {
    if (code === "not-allowed" || code === "service-not-allowed") {
      return "permission_denied";
    }
    if (code === "unsupported") {
      return "unavailable";
    }
    return "error";
  };

  const stopListening = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    gotResultRef.current = false;
    setPhase("idle");
  }, []);

  const startListening = async () => {
    // Support check synchronously in the tap handler (not only via useEffect).
    if (!isSpeechRecognitionSupported()) {
      setSupported(false);
      setPhase("unavailable");
      voiceDiag("recognition_supported", "false");
      return;
    }
    setSupported(true);

    // Toggle off while listening / starting
    if (phaseRef.current === "listening" || phaseRef.current === "starting") {
      stopListening();
      return;
    }

    if (phaseRef.current === "processing") return;

    setHeard(null);
    setErrorDetail(null);
    gotResultRef.current = false;
    setPhase("starting");

    const permission = await ensureMicrophonePermission(voiceDiag);
    if (permission === "denied") {
      setPhase("permission_denied");
      return;
    }

    // Still in the same user-gesture chain after getUserMedia on Chromium.
    sessionRef.current?.abort();
    sessionRef.current = startSpeechRecognition({
      lang: locale === "ru" ? "ru-RU" : "en-US",
      onDiag: voiceDiag,
      onStart: () => {
        setPhase("listening");
      },
      onResult: (transcript) => {
        gotResultRef.current = true;
        sessionRef.current = null;
        void handleTranscript(transcript);
      },
      onError: (code) => {
        sessionRef.current = null;
        if (gotResultRef.current) return;
        setErrorDetail(code);
        setPhase(mapSpeechError(code));
      },
      onEnd: () => {
        sessionRef.current = null;
        if (gotResultRef.current) return;
        // Ended without result (e.g. no-speech) — back to idle with chance to retry
        setPhase((prev) =>
          prev === "listening" || prev === "starting" ? "idle" : prev
        );
      },
    });
  };

  const statusText = (() => {
    switch (phase) {
      case "unavailable":
        return t("admin.voiceNav.unavailable");
      case "permission_denied":
        return t("admin.voiceNav.permissionDenied");
      case "starting":
        return t("admin.voiceNav.starting");
      case "listening":
        return t("admin.voiceNav.listening");
      case "processing":
        return heard
          ? t("admin.voiceNav.recognized", { text: heard })
          : t("admin.voiceNav.listening");
      case "not_found":
        return t("admin.voiceNav.notFound");
      case "order_not_found":
        return t("admin.voiceNav.orderNotFound");
      case "unknown":
        return t("admin.voiceNav.unknown");
      case "error":
        return errorDetail === "no-speech"
          ? t("admin.voiceNav.noSpeech")
          : t("admin.voiceNav.error");
      default:
        return t("admin.voiceNav.prompt");
    }
  })();

  const isActive = phase === "listening" || phase === "starting";
  const buttonDisabled = supported === false || phase === "processing";

  return (
    <div className="flex max-w-full items-center gap-3 pt-1">
      <button
        type="button"
        onClick={() => {
          void startListening();
        }}
        disabled={buttonDisabled}
        aria-label={t("admin.voiceNav.ariaLabel")}
        aria-pressed={isActive}
        className={cn(
          "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E8ECF1] bg-white text-[#0F172A] shadow-sm transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677F2] focus-visible:ring-offset-2",
          isActive && "animate-pulse border-[#1677F2] text-[#1677F2]",
          supported === false && "cursor-not-allowed opacity-50"
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
            phase === "error" ||
            phase === "permission_denied" ||
            phase === "unavailable") &&
            "text-[#64748B]"
        )}
      >
        {statusText}
      </p>
    </div>
  );
}
