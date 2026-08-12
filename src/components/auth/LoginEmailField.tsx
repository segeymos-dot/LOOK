"use client";

import { Input } from "@/components/ui/Input";
import {
  filterRecentLoginEmails,
  MAX_RECENT_LOGIN_EMAILS,
} from "@/lib/auth/recent-login-emails";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

type LoginEmailFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "autoComplete" | "name"
> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function LoginEmailField({
  label,
  value,
  onChange,
  error,
  id,
  ...props
}: LoginEmailFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-suggestions`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const refreshSuggestions = useCallback((query: string) => {
    // Show after the user types at least one character (mobile-friendly).
    if (!query.trim()) {
      setSuggestions([]);
      return [];
    }
    const next = filterRecentLoginEmails(query, MAX_RECENT_LOGIN_EMAILS).filter(
      (email) => email !== query.trim().toLowerCase()
    );
    setSuggestions(next);
    return next;
  }, []);

  useEffect(() => {
    refreshSuggestions(value);
  }, [value, refreshSuggestions]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!rootRef.current || !target) return;
      if (!rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  const showList = open && suggestions.length > 0;

  const selectEmail = (email: string) => {
    onChange(email);
    setOpen(false);
    // Keep focus in the form; password is the natural next step.
    window.requestAnimationFrame(() => {
      const password = document.getElementById("password") as HTMLInputElement | null;
      if (password) {
        password.focus();
        return;
      }
      inputRef.current?.focus();
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        ref={inputRef}
        id={inputId}
        label={label}
        type="email"
        name="email"
        // username helps password managers pair email + password credentials.
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        error={error}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        aria-expanded={showList}
        onFocus={() => {
          const next = refreshSuggestions(value);
          setOpen(next.length > 0);
        }}
        onChange={(e) => {
          const nextValue = e.target.value;
          onChange(nextValue);
          const next = refreshSuggestions(nextValue);
          setOpen(next.length > 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        {...props}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 z-20 mt-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface shadow-elevated",
            // Keep short so it stays under the email field and above the keyboard.
            "max-h-44"
          )}
        >
          {suggestions.map((email) => (
            <li key={email} role="option">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center px-4 py-3.5 text-left text-base text-text-primary",
                  "hover:bg-brand-50 active:bg-brand-50",
                  "focus:bg-brand-50 focus:outline-none"
                )}
                onMouseDown={(e) => {
                  // Prevent input blur before click registers.
                  e.preventDefault();
                }}
                onClick={() => selectEmail(email)}
              >
                {email}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
