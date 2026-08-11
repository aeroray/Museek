import { AlertTriangle, Fingerprint, LoaderCircle } from "lucide-react";
import { TrackRow } from "@/components/common/TrackRow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { supportsSystemCapture } from "@/lib/recognition/capture";
import { usePlayerStore } from "@/stores/playerStore";
import {
  useRecognitionStore,
  type RecognitionStatus,
} from "@/stores/recognitionStore";

function isBusy(status: RecognitionStatus): boolean {
  return status === "capturing" || status === "recognizing";
}

export function Recognize() {
  const t = useT();
  const systemSupported = supportsSystemCapture();
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const {
    captureMode,
    status,
    error,
    result,
    matches,
    setCaptureMode,
    recognize,
  } = useRecognitionStore();
  const busy = isBusy(status);
  const startRecognition = () => {
    if (isPlaying) togglePlay();
    void recognize();
  };
  const statusText =
    status === "capturing"
      ? t("recognize.capturing")
      : status === "recognizing"
        ? t("recognize.processing")
        : status === "success"
          ? t("recognize.resultTitle")
          : status === "no-match"
            ? t("recognize.noMatch")
            : status === "error"
              ? t("recognize.error", { msg: error ?? "" })
              : t("recognize.ready");
  const recognizeButton = (
    <Button
      variant="default"
      size="sm"
      className="h-8"
      disabled={busy}
      onClick={startRecognition}
    >
      {busy ? (
        <LoaderCircle size={14} className="mr-1.5 animate-spin" />
      ) : (
        <Fingerprint size={14} className="mr-1.5" />
      )}
      {status === "capturing"
        ? t("recognize.listening")
        : status === "recognizing"
          ? t("recognize.processing")
          : result
            ? t("recognize.listenAgain")
            : t("recognize.listen")}
    </Button>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="p-4 border-b border-border flex items-center gap-3">
        <Fingerprint size={20} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold leading-tight text-balance">
            <span>{t("recognize.title")}</span>
            <Badge
              variant="secondary"
              className="shrink-0 border-0 px-1.5 py-0 text-[10px] font-semibold leading-4"
            >
              {t("recognize.beta")}
            </Badge>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            {t("recognize.subtitle")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {recognizeButton}
          <div
            className="inline-flex items-center gap-1 rounded-full bg-muted/70 p-1"
            role="group"
            aria-label={t("recognize.captureTitle")}
          >
            {(["system", "microphone"] as const).map((item) => {
              const active = captureMode === item;
              const supported = item === "microphone" || systemSupported;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  disabled={!supported || busy}
                  title={
                    !supported ? t("recognize.systemUnsupported") : undefined
                  }
                  onClick={() => setCaptureMode(item)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(
                    item === "microphone"
                      ? "recognize.captureMicrophone"
                      : "recognize.captureSystem",
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl p-4">
          {status === "idle" && (
            <div className="flex min-h-[18rem] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/70 text-muted-foreground">
                <Fingerprint size={28} strokeWidth={1.6} />
              </div>
              <p className="mt-4 text-sm font-medium">{t("recognize.ready")}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground text-pretty">
                {t("recognize.captureTitle")} ·{" "}
                {t(
                  captureMode === "microphone"
                    ? "recognize.captureMicrophone"
                    : "recognize.captureSystem",
                )}
              </p>
            </div>
          )}

          {busy && (
            <div className="flex min-h-[18rem] flex-col items-center justify-center px-4 text-center">
              <LoaderCircle size={30} className="animate-spin text-primary" />
              <p className="mt-4 text-sm font-medium">{statusText}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  captureMode === "microphone"
                    ? "recognize.captureMicrophone"
                    : "recognize.captureSystem",
                )}
              </p>
            </div>
          )}

          {(status === "success" || status === "no-match") && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">
                  {t("recognize.resultTitle")}
                </h3>
                <p className="shrink-0 text-right text-xs text-muted-foreground">
                  {t("recognize.providerNetease")}
                  {result
                    ? ` · ${t("recognize.elapsed", { ms: Math.round(result.elapsedMs) })}`
                    : ""}
                </p>
              </div>
              {status === "no-match" ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 py-10 text-center">
                  <Fingerprint size={28} className="text-muted-foreground/60" />
                  <p className="mt-3 text-sm font-medium">
                    {t("recognize.noMatch")}
                  </p>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground text-pretty">
                    {t("recognize.noMatchHint")}
                  </p>
                </div>
              ) : matches.length > 0 ? (
                <div>
                  {matches.map((match) =>
                    match.song ? (
                      <TrackRow
                        key={match.candidate.id}
                        song={match.song}
                        className="rounded-md px-4"
                      />
                    ) : (
                      <div
                        key={match.candidate.id}
                        className="flex items-center gap-3 rounded-md border border-border/70 px-4 py-2"
                      >
                        <MusicFallbackIcon />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {match.candidate.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {match.candidate.artist}
                            {match.candidate.album
                              ? ` · ${match.candidate.album}`
                              : ""}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {t("recognize.noPlayable")}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                  {t("recognize.noPlayable")}
                </p>
              )}
            </section>
          )}

          {error && status === "error" && (
            <div
              className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
              role="alert"
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span className="text-pretty">
                {error.toLowerCase().includes("microphone")
                  ? t("recognize.permissionError")
                  : t("recognize.error", { msg: error })}
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MusicFallbackIcon() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Fingerprint size={17} />
    </span>
  );
}
