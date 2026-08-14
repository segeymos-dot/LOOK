/**
 * Minimal browser Web Speech API wrapper.
 * Chrome/Edge: SpeechRecognition / webkitSpeechRecognition.
 * Unsupported browsers: isSpeechRecognitionSupported() === false.
 */

export type SpeechRecognitionResultHandler = (transcript: string) => void;
export type SpeechRecognitionErrorHandler = (message: string) => void;

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
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

export type StartListeningOptions = {
  lang: string;
  onResult: SpeechRecognitionResultHandler;
  onError: SpeechRecognitionErrorHandler;
  onEnd?: () => void;
};

/** Starts a one-shot recognition session. Returns a stop function. */
export function startSpeechRecognition(options: StartListeningOptions): () => void {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    options.onError("unsupported");
    return () => undefined;
  }

  const recognition = new Ctor();
  recognition.lang = options.lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let settled = false;

  recognition.onresult = (event) => {
    const first = event.results?.[0]?.[0];
    const transcript = String(first?.transcript ?? "").trim();
    if (!settled) {
      settled = true;
      options.onResult(transcript);
    }
  };

  recognition.onerror = (event) => {
    if (settled) return;
    settled = true;
    options.onError(String(event.error ?? "error"));
  };

  recognition.onend = () => {
    options.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    settled = true;
    options.onError("start_failed");
  }

  return () => {
    try {
      recognition.abort();
    } catch {
      // ignore
    }
  };
}
