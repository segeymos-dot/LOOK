"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useTranslation } from "@/components/providers/LocaleProvider";
import {
  deleteUserPasskey,
  isPasskeySupported,
  listUserPasskeys,
  passkeyErrorCode,
  registerUserPasskey,
  renameUserPasskey,
  type PasskeyListItem,
} from "@/lib/auth/passkeys";
import { formatRelativeTimeT } from "@/lib/i18n/client-messages";
import { useCallback, useEffect, useState } from "react";

export function PasskeyManageCard() {
  const { t, locale } = useTranslation();
  const [supported, setSupported] = useState(false);
  const [items, setItems] = useState<PasskeyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const localeTag = locale === "en" ? "en-US" : "ru-RU";

  const mapError = useCallback(
    (err: unknown) => {
      const code = passkeyErrorCode(err);
      if (code === "unsupported") return t("settings.security.passkeys.unsupported");
      if (code === "cancelled") return t("settings.security.passkeys.cancelled");
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message ?? "")
          : "";
      return msg || t("settings.security.passkeys.failed");
    },
    [t]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isPasskeySupported()) {
        setSupported(false);
        setItems([]);
        return;
      }
      setSupported(true);
      const { data, error: listError } = await listUserPasskeys();
      if (listError) {
        setError(mapError(listError));
        setItems([]);
        return;
      }
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(mapError(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [mapError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: regError } = await registerUserPasskey();
      if (regError || !data) {
        setError(mapError(regError ?? new Error("register failed")));
        return;
      }
      if (data.id) {
        const defaultName = t("settings.security.passkeys.defaultName");
        await renameUserPasskey(data.id, defaultName);
      }
      setMessage(t("settings.security.passkeys.registered"));
      await refresh();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    if (!renameId) return;
    const name = renameValue.trim();
    if (!name) {
      setError(t("settings.security.passkeys.nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updateError } = await renameUserPasskey(renameId, name);
      if (updateError) {
        setError(mapError(updateError));
        return;
      }
      setRenameId(null);
      setRenameValue("");
      setMessage(t("settings.security.passkeys.renamed"));
      await refresh();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { error: delError } = await deleteUserPasskey(deleteId);
      if (delError) {
        setError(mapError(delError));
        return;
      }
      setDeleteId(null);
      setMessage(t("settings.security.passkeys.deleted"));
      await refresh();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="md" className="space-y-3">
      <h2 className="font-semibold text-text-primary">
        {t("settings.security.passkeys.title")}
      </h2>
      <p className="text-sm text-text-muted">
        {t("settings.security.passkeys.hint")}
      </p>

      {!supported && !loading ? (
        <p className="text-sm text-text-muted">
          {t("settings.security.passkeys.unsupported")}
        </p>
      ) : (
        <Button
          className="w-full"
          loading={busy}
          disabled={!supported || loading}
          onClick={() => void register()}
        >
          {t("settings.security.passkeys.setup")}
        </Button>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">{t("settings.security.passkeys.loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">{t("settings.security.passkeys.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border-subtle px-3 py-3 text-sm"
            >
              {renameId === item.id ? (
                <div className="space-y-2">
                  <Input
                    id={`passkey-name-${item.id}`}
                    label={t("settings.security.passkeys.nameLabel")}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() => void saveRename()}
                    >
                      {t("settings.security.passkeys.saveName")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setRenameId(null);
                        setRenameValue("");
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium text-text-primary">
                    {item.friendly_name?.trim() ||
                      t("settings.security.passkeys.unnamed")}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {t("settings.security.passkeys.created")}{" "}
                    {formatRelativeTimeT(item.created_at, t, localeTag)}
                    {item.last_used_at
                      ? ` · ${t("settings.security.passkeys.lastUsed")} ${formatRelativeTimeT(item.last_used_at, t, localeTag)}`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setRenameId(item.id);
                        setRenameValue(item.friendly_name ?? "");
                      }}
                    >
                      {t("settings.security.passkeys.rename")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setDeleteId(item.id)}
                    >
                      {t("settings.security.passkeys.delete")}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t("settings.security.passkeys.deleteTitle")}
        body={t("settings.security.passkeys.deleteBody")}
        danger
        loading={busy}
        confirmLabel={t("settings.security.passkeys.delete")}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  );
}
