/**
 * Minimal browser Web Speech API wrapper.
 * Chrome/Edge (incl. Android): SpeechRecognition / webkitSpeechRecognition.
 */

export type SpeechRecognitionResultHandler = (transcript: string) => void;
export type SpeechRecognitionErrorHandler = (code: string) => void;

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onaudiostart: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onresult: ((event: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isSecureMicrophoneContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

export type SpeechDiagEvent =
  | "recognition_supported"
  | "secure_context"
  | "mic_permission_state"
  | "mic_start"
  | "mic_onstart"
  | "mic_onaudiostart"
  | "mic_onspeechstart"
  | "mic_result"
  | "mic_error"
  | "mic_end"
  | "mic_permission_prompt"
  | "mic_permission_ok"
  | "mic_permission_denied";

export type StartListeningOptions = {
  lang: string;
  onStart?: () => void;
  onResult: SpeechRecognitionResultHandler;
  onError: SpeechRecognitionErrorHandler;
  onEnd?: () => void;
  /** Staging-only safe diagnostics (no audio / secrets). */
  onDiag?: (event: SpeechDiagEvent, detail?: string) => void;
};

export type SpeechSession = {
  stop: () => void;
  abort: () => void;
};

/**
 * Starts a one-shot recognition session.
 * Call from a real user click/touch handler (sync or same gesture chain).
 */
export function startSpeechRecognition(
  options: StartListeningOptions
): SpeechSession {
  const noopSession: SpeechSession = {
    stop: () => undefined,
    abort: () => undefined,
  };

  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    options.onDiag?.("recognition_supported", "false");
    options.onError("unsupported");
    return noopSession;
  }

  options.onDiag?.("recognition_supported", "true");

  const recognition = new Ctor();
  recognition.lang = options.lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let settled = false;

  recognition.onstart = () => {
    options.onDiag?.("mic_onstart");
    options.onStart?.();
  };

  recognition.onaudiostart = () => {
    options.onDiag?.("mic_onaudiostart");
  };

  recognition.onspeechstart = () => {
    options.onDiag?.("mic_onspeechstart");
  };

  recognition.onresult = (event) => {
    const first = event.results?.[0]?.[0];
    const transcript = String(first?.transcript ?? "").trim();
    options.onDiag?.(
      "mic_result",
      transcript ? `len=${transcript.length}` : "empty"
    );
    if (!settled) {
      settled = true;
      options.onResult(transcript);
    }
  };

  recognition.onerror = (event) => {
    const code = String(event.error ?? "error");
    options.onDiag?.("mic_error", code);
    if (settled) return;
    settled = true;
    options.onError(code);
  };

  recognition.onend = () => {
    options.onDiag?.("mic_end");
    options.onEnd?.();
  };

  try {
    options.onDiag?.("mic_start");
    recognition.start();
  } catch (err) {
    const code =
      err instanceof DOMException && err.name === "InvalidStateError"
        ? "invalid_state"
        : "start_failed";
    options.onDiag?.("mic_error", code);
    settled = true;
    options.onError(code);
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    },
  };
}

export type MicrophonePermissionState = "granted" | "denied" | "prompt" | "unknown";

/** Read Permissions API state without prompting (when supported). */
export async function queryMicrophonePermissionState(): Promise<MicrophonePermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export type MicPermissionResult =
  | { status: "granted" }
  | { status: "denied" }
  | { status: "insecure" }
  | { status: "unsupported" }
  | { status: "not_found" }
  | { status: "error"; code: string };

/**
 * Request mic access from a user gesture.
 * Shows the browser prompt when state is prompt/unknown.
 * Returns denied ONLY for real NotAllowed / previously blocked.
 */
export async function ensureMicrophonePermission(
  onDiag?: (event: SpeechDiagEvent, detail?: string) => void
): Promise<MicPermissionResult> {
  if (typeof window !== "undefined") {
    const secure = isSecureMicrophoneContext();
    onDiag?.("secure_context", secure ? "true" : "false");
    if (!secure) {
      return { status: "insecure" };
    }
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    onDiag?.("mic_permission_denied", "no_media_devices");
    return { status: "unsupported" };
  }

  const prior = await queryMicrophonePermissionState();
  onDiag?.("mic_permission_state", prior);

  // Already blocked in browser settings — prompt will not appear.
  if (prior === "denied") {
    onDiag?.("mic_permission_denied", "permissions_api_denied");
    return { status: "denied" };
  }

  onDiag?.("mic_permission_prompt");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    onDiag?.("mic_permission_ok");
    return { status: "granted" };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "error";
    onDiag?.("mic_permission_denied", name);

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return { status: "denied" };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { status: "not_found" };
    }
    // Do not treat AbortError / NotReadableError as "denied in settings".
    return { status: "error", code: name };
  }
}
