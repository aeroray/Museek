import { useState } from "react";
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

async function openExternal(url: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank");
  }
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
    apiKey,
    apiSecret,
    username,
    sessionKey,
    enabled,
    scrobbleEnabled,
    nowPlayingEnabled,
    connecting,
    authUrl,
    error,
    pending,
    setCredentials,
    startConnect,
    cancelConnect,
    disconnect,
    setEnabled,
    setScrobbleEnabled,
    setNowPlayingEnabled,
    flush,
  } = useLastfmStore();

  // Local drafts so typing does not write the store (and the file) per keystroke.
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [secretDraft, setSecretDraft] = useState(apiSecret);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const configured = isConfigured(keyDraft, secretDraft);
  const connected = Boolean(sessionKey);
  const dirty = keyDraft.trim() !== apiKey || secretDraft.trim() !== apiSecret;

  const commit = () => {
    void setCredentials(keyDraft, secretDraft);
  };

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

          <SettingRow
            title={t("lastfm.apiKey")}
            desc={t("lastfm.credentialsHint")}
          >
            <div className="space-y-2">
              <Input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onBlur={commit}
                placeholder={t("lastfm.apiKeyPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className="h-9 font-mono text-xs"
              />
              <Input
                value={secretDraft}
                onChange={(e) => setSecretDraft(e.target.value)}
                onBlur={commit}
                type="password"
                placeholder={t("lastfm.apiSecretPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                className="h-9 font-mono text-xs"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void openExternal(LASTFM_API_ACCOUNTS)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  <ExternalLink size={12} />
                  {t("lastfm.createApiLink")}
                </button>
                {dirty && (
                  <Button size="sm" variant="secondary" onClick={commit}>
                    {t("common.save")}
                  </Button>
                )}              </div>
            </div>
          </SettingRow>

          {/* Connection row. While waiting, the authorize URL is offered again
              because the browser tab is easy to lose and the token stays valid. */}
          <SettingRow
            title={
              connected
                ? t("lastfm.connectedAs", { name: username })
                : t("lastfm.connect")
            }
            desc={connecting ? t("lastfm.connectingHint") : undefined}
          >
            <div className="flex flex-wrap items-center gap-2">
              {connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Link2Off size={14} className="mr-2" />
                  {t("lastfm.disconnect")}
                </Button>
              ) : connecting ? (
                <>
                  <Button variant="secondary" size="sm" disabled>
                    <RefreshCw size={14} className="mr-2 animate-spin" />
                    {t("lastfm.connecting")}
                  </Button>
                  {authUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void openExternal(authUrl)}
                    >
                      <ExternalLink size={14} className="mr-2" />
                      {t("lastfm.reopenAuth")}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={cancelConnect}>
                    {t("lastfm.cancelConnect")}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={!configured}
                  onClick={() => void startConnect()}
                >
                  <Link2 size={14} className="mr-2" />
                  {t("lastfm.connect")}
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

        {error && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

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
