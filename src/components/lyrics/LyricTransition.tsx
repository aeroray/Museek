import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const TRANSITION_MS = 240;
const SIZE_COLLAPSE_DELAY_MS = 80;

type LyricLayerPhase = "current" | "entering" | "outgoing" | "exiting";

interface LyricLayer {
  id: number;
  key: string;
  node: ReactNode;
  phase: LyricLayerPhase;
}

interface LyricTransitionProps {
  transitionKey: string;
  children: ReactNode;
  className?: string;
  animateSize?: boolean;
}

export function LyricTransition({
  transitionKey,
  children,
  className,
  animateSize = false,
}: LyricTransitionProps) {
  const latestChildrenRef = useRef(children);
  latestChildrenRef.current = children;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const layerElementsRef = useRef(new Map<number, HTMLDivElement>());
  const layerIdRef = useRef(0);
  const activeLayerRef = useRef<LyricLayer>({
    id: 0,
    key: transitionKey,
    node: children,
    phase: "current",
  });
  if (activeLayerRef.current.key === transitionKey) {
    activeLayerRef.current.node = children;
  }

  const [layers, setLayers] = useState<LyricLayer[]>(() => [
    activeLayerRef.current,
  ]);

  useLayoutEffect(() => {
    const previousLayer = activeLayerRef.current;
    if (previousLayer.key === transitionKey) return;

    const wrapper = wrapperRef.current;
    const sizeLockWrapper = animateSize && wrapper ? wrapper : null;
    const fromWidth = sizeLockWrapper
      ? sizeLockWrapper.getBoundingClientRect().width
      : 0;
    const sizeLockActive = Boolean(sizeLockWrapper && fromWidth > 0);
    if (sizeLockWrapper && fromWidth > 0) {
      sizeLockWrapper.style.width = `${fromWidth}px`;
    }

    const nextLayer: LyricLayer = {
      id: ++layerIdRef.current,
      key: transitionKey,
      node: latestChildrenRef.current,
      phase: "entering",
    };
    activeLayerRef.current = nextLayer;
    setLayers([{ ...previousLayer, phase: "outgoing" }, nextLayer]);

    let secondFrameId: number | undefined;
    let timerId: number | undefined;
    let sizeTargetFrameId: number | undefined;
    let sizeTargetTimerId: number | undefined;
    let sizeResetTimerId: number | undefined;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        const nextElement = layerElementsRef.current.get(nextLayer.id);
        const nextContent =
          nextElement?.firstElementChild as HTMLElement | null;
        const targetWidth = nextContent?.offsetWidth ?? 0;
        if (sizeLockWrapper && sizeLockActive && targetWidth > fromWidth) {
          sizeLockWrapper.style.width = `${targetWidth}px`;
        }

        if (sizeLockWrapper && sizeLockActive && targetWidth > 0) {
          if (targetWidth < fromWidth) {
            sizeTargetTimerId = window.setTimeout(() => {
              sizeTargetFrameId = window.requestAnimationFrame(() => {
                sizeLockWrapper.style.width = `${targetWidth}px`;
              });
            }, SIZE_COLLAPSE_DELAY_MS);
            sizeResetTimerId = window.setTimeout(() => {
              sizeLockWrapper.style.removeProperty("width");
            }, SIZE_COLLAPSE_DELAY_MS + TRANSITION_MS);
          } else {
            sizeResetTimerId = window.setTimeout(() => {
              sizeLockWrapper.style.removeProperty("width");
            }, TRANSITION_MS);
          }
        }

        setLayers((currentLayers) =>
          currentLayers.map((layer) =>
            layer.id === previousLayer.id
              ? { ...layer, phase: "exiting" }
              : layer.id === nextLayer.id
                ? { ...layer, phase: "current" }
                : layer,
          ),
        );
        timerId = window.setTimeout(() => {
          setLayers((currentLayers) =>
            currentLayers.filter((layer) => layer.id !== previousLayer.id),
          );
        }, TRANSITION_MS);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== undefined) {
        window.cancelAnimationFrame(secondFrameId);
      }
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
      if (sizeTargetFrameId !== undefined) {
        window.cancelAnimationFrame(sizeTargetFrameId);
      }
      if (sizeTargetTimerId !== undefined) {
        window.clearTimeout(sizeTargetTimerId);
      }
      if (sizeResetTimerId !== undefined) {
        window.clearTimeout(sizeResetTimerId);
      }
    };
  }, [animateSize, transitionKey]);

  const activeLayerId = activeLayerRef.current.id;
  const isPendingTransition = activeLayerRef.current.key !== transitionKey;

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "lyric-transition",
        animateSize && "lyric-transition--animate-size",
        className,
      )}
    >
      {layers.map((layer) => {
        const isActiveLayer = layer.id === activeLayerId;
        const isOutgoing =
          layer.phase === "outgoing" || layer.phase === "exiting";
        const node =
          isActiveLayer && !isPendingTransition ? children : layer.node;
        return (
          <div
            key={layer.id}
            ref={(element) => {
              if (element) layerElementsRef.current.set(layer.id, element);
              else layerElementsRef.current.delete(layer.id);
            }}
            className={cn(
              isOutgoing
                ? "lyric-transition__outgoing"
                : "lyric-transition__current",
            )}
            data-lyric-transition-state={
              layer.phase === "current" ? undefined : layer.phase
            }
            aria-hidden={isOutgoing ? "true" : undefined}
          >
            {node}
          </div>
        );
      })}
    </div>
  );
}
