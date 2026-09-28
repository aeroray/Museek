import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Link2Off, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsCard, SettingRow } from "@/components/settings/SettingsCard";
import { useLastfmStore, isConfigured } from "@/stores/lastfmStore";
import { useT } from "@/lib/i18n";

/** Where a user registers their own Last.fm API application. */
const LASTFM_API_ACCOUNTS = "https://www.last.fm/api/account/create";

export async function openExternal(url: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank");
  }
}

/**
 * The API-credential dialog.
 *
 * Credentials live in a dialog rather than inline on the settings page because
 * they are set once and then never looked at again — leaving two long opaque
 * strings on the page pushed the controls a user actually revisits (the toggles)
 * below the fold. The dialog also owns the "save then connect" sequence, so
 * entering the pair and authorizing is a single uninterrupted action instead of
 * two steps separated by a page.
 */
export function LastfmCredentialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const apiKey = useLastfmStore((s) => s.apiKey);
  const apiSecret = useLastfmStore((s) => s.apiSecret);
  const sessionKey = useLastfmStore((s) => s.sessionKey);
  const connecting = useLastfmStore((s) => s.connecting);
  const authUrl = useLastfmStore((s) => s.authUrl);
  const error = useLastfmStore((s) => s.error);
  const setCredentials = useLastfmStore((s) => s.setCredentials);
  const startConnect = useLastfmStore((s) => s.startConnect);
  const cancelConnect = useLastfmStore((s) => s.cancelConnect);

  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [secretDraft, setSecretDraft] = useState(apiSecret);
  /**
   * The session key stored when this dialog opened.
   *
   * Auto-close must fire only for a connect THIS dialog performed. Testing
   * `sessionKey` alone closed the dialog the instant it opened for an
   * already-connected user — which is exactly the "reconnect" case, where the
   * user opens the dialog to replace the credentials and would never see it.
   *
   * A ref rather than state, because both effects below run in the SAME commit:
   * state written by the open effect is not visible to the close effect until the
   * next render, so the close effect compared against the initial "" and shut the
   * dialog immediately — leaving it in the DOM at opacity 0, invisible.
   */
  const sessionAtOpenRef = useRef("");

  // Re-seed whenever the dialog opens, so it always reflects what is stored —
  // a cancelled edit must not linger into the next open.
  useEffect(() => {
    if (!open) return;
    setKeyDraft(apiKey);
    setSecretDraft(apiSecret);
    sessionAtOpenRef.current = sessionKey;
    // Deliberately not depending on apiKey/apiSecret/sessionKey: this must run on
    // OPEN only. Re-running on every store change would clobber the user's typing
    // the moment the connect flow writes anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close once a connect started here succeeds: the session key changed.
  useEffect(() => {
    if (open && sessionKey && sessionKey !== sessionAtOpenRef.current) {
      onOpenChange(false);
    }
  }, [open, sessionKey, onOpenChange]);

  const configured = isConfigured(keyDraft, secretDraft);

  const handleConnect = async () => {
    // Save first: the connect flow reads the stored credentials, so an unsaved
    // edit would connect with the previous pair (or fail as unconfigured).
    await setCredentials(keyDraft, secretDraft);
    await startConnect();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("lastfm.connect")}</DialogTitle>
          <DialogDescription>{t("lastfm.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">{t("lastfm.apiKey")}</span>
            <Input
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={t("lastfm.apiKeyPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              // No `font-mono`: it was the only monospace text in the app, and
              // the default mono stack clashes with the UI's serif face. These
              // values are plain hex, which the UI font reads perfectly well.
              className="h-9 text-xs tracking-tight"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium">{t("lastfm.apiSecret")}</span>
            <Input
              value={secretDraft}
              onChange={(e) => setSecretDraft(e.target.value)}
              type="password"
              placeholder={t("lastfm.apiSecretPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              className="h-9 text-xs tracking-tight"
            />
          </label>

          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => void openExternal(LASTFM_API_ACCOUNTS)}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              <ExternalLink size={12} />
              {t("lastfm.createApiLink")}
            </button>
            <span className="text-right text-[11px] leading-relaxed text-muted-foreground">
              {t("lastfm.credentialsHint")}
            </span>
          </div>

          {connecting && (
            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin" />
                {t("lastfm.connecting")}
              </p>
              <p className="mt-1.5 leading-relaxed">
                {t("lastfm.connectingHint")}
              </p>
              {authUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 px-2"
                  onClick={() => void openExternal(authUrl)}
                >
                  <ExternalLink size={12} className="mr-1.5" />
                  {t("lastfm.reopenAuth")}
                </Button>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          {connecting ? (
            <Button
              variant="outline"
              onClick={() => {
                cancelConnect();
                onOpenChange(false);
              }}
            >
              {t("lastfm.cancelConnect")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
          )}
          <Button
            disabled={!configured || connecting}
            onClick={() => void handleConnect()}
          >
            <Link2 size={14} className="mr-2" />
            {t("lastfm.connect")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Last.fm settings.
 *
 * The app ships no bundled API credentials on purpose: the signature scheme
 * needs the shared secret in the client, so a shared secret would be extractable
 * from every install. Each user registers their own free Last.fm API
 * application, which is also what keeps their scrobbles attributed correctly.
 */
export function LastfmSettings() {
  const t = useT();
  const {
    username,
    sessionKey,
    enabled,
    scrobbleEnabled,
    nowPlayingEnabled,
    pending,
    disconnect,
    setEnabled,
    setScrobbleEnabled,
    setNowPlayingEnabled,
    flush,
  } = useLastfmStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const connected = Boolean(sessionKey);

  return (
    <ScrollArea className="h-full">
      <div className="pr-3 pb-4">
        <SettingsCard>
          <SettingRow
            title={t("lastfm.enable")}
            desc={t("lastfm.enableDesc")}
            control={
              <Switch
                checked={enabled}
                onCheckedChange={(v) => void setEnabled(v)}
              />
            }
          />

          {/* One row for the account: it shows the state and is the single entry
              point to the credential dialog, whether connecting or reconnecting. */}
          <SettingRow
            title={
              connected
                ? t("lastfm.connectedAs", { name: username })
                : t("lastfm.connect")
            }
            desc={connected ? undefined : t("lastfm.credentialsHint")}
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* `secondary`, not the default `primary`: a filled high-contrast
                  pill next to the outlined Disconnect button read as noticeably
                  larger even though both measure the same 36px. Matching their
                  visual weight is what the eye actually compares. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                <Link2 size={14} className="mr-2" />
                {connected ? t("lastfm.reconnect") : t("lastfm.connect")}
              </Button>
              {connected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Link2Off size={14} className="mr-2" />
                  {t("lastfm.disconnect")}
                </Button>
              )}
            </div>
          </SettingRow>

          {/* Scrobbling options only make sense once there is a session. */}
          {connected && (
            <>
              <SettingRow
                title={t("lastfm.scrobble")}
                desc={t("lastfm.scrobbleDesc")}
                control={
                  <Switch
                    checked={scrobbleEnabled}
                    onCheckedChange={(v) => void setScrobbleEnabled(v)}
                  />
                }
              />
              <SettingRow
                title={t("lastfm.nowPlaying")}
                desc={t("lastfm.nowPlayingDesc")}
                control={
                  <Switch
                    checked={nowPlayingEnabled}
                    onCheckedChange={(v) => void setNowPlayingEnabled(v)}
                  />
                }
              />
            </>
          )}

          {/* The queue is shown only when it is non-empty: a permanent "0 waiting"
              row is noise. */}
          {pending.length > 0 && (
            <SettingRow
              title={t("lastfm.pending", { count: pending.length })}
              desc={t("lastfm.pendingHint")}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  // Forced: the user pressed a button labelled "retry now", so it
                  // must not silently wait out a backoff.
                  await flush({ force: true });
                  setRetrying(false);
                }}
              >
                <RefreshCw
                  size={14}
                  className={`mr-2 ${retrying ? "animate-spin" : ""}`}
                />
                {t("lastfm.retryNow")}
              </Button>
            </SettingRow>
          )}
        </SettingsCard>
      </div>

      <LastfmCredentialsDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("lastfm.disconnectConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("lastfm.disconnectConfirmDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void disconnect();
                setConfirmOpen(false);
              }}
            >
              {t("lastfm.disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
