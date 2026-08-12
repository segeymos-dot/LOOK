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
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

type LoginEmailFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "autoComplete" | "name" | "id"
> & {
  label: string;
  error?: string;
  /** Stable login username id for password managers (default: username). */
  id?: string;
};

/**
 * Uncontrolled email/username field for login.
 * Keeps DOM value owned by the browser (Safari AutoFill) while still offering
 * our local recent-email dropdown.
 */
export function LoginEmailField({
  label,
  error,
  id = "username",
  ...props
}: LoginEmailFieldProps) {
  const listId = `${id}-suggestions`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const refreshSuggestions = useCallback((nextQuery: string) => {
    if (!nextQuery.trim()) {
      setSuggestions([]);
      return [];
    }
    const next = filterRecentLoginEmails(nextQuery, MAX_RECENT_LOGIN_EMAILS).filter(
      (email) => email !== nextQuery.trim().toLowerCase()
    );
    setSuggestions(next);
    return next;
  }, []);

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
    const input = inputRef.current;
    if (input) {
      // Write into the live DOM without remounting / wiping password.
      input.value = email;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setQuery(email);
    setOpen(false);
    window.requestAnimationFrame(() => {
      const password = document.getElementById(
        "current-password"
      ) as HTMLInputElement | null;
      password?.focus();
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        label={label}
        type="email"
        name="username"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        // Uncontrolled: Safari/Chrome own the value for Password AutoFill.
        defaultValue=""
        error={error}
        aria-autocomplete={showList ? "list" : undefined}
        aria-controls={showList ? listId : undefined}
        aria-expanded={showList || undefined}
        onFocus={() => {
          const current = inputRef.current?.value ?? query;
          const next = refreshSuggestions(current);
          setOpen(next.length > 0);
        }}
        onInput={(e) => {
          const nextValue = e.currentTarget.value;
          setQuery(nextValue);
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
            "max-h-44"
          )}
        >
          {suggestions.map((email) => (
            <li key={email} role="option" aria-selected={false}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center px-4 py-3.5 text-left text-base text-text-primary",
                  "hover:bg-brand-50 active:bg-brand-50",
                  "focus:bg-brand-50 focus:outline-none"
                )}
                onMouseDown={(e) => {
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
