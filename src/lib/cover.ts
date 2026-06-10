import type { Source } from "@/types/music"

// Upgrade a cover thumbnail to a higher resolution for large displays. The list
// rows and player bar use small thumbnails, but the lyrics page shows the cover
// at ~240px (×DPR), where a small source looks soft. These are per-platform URL
// tweaks; unknown patterns fall back to the original URL unchanged.
export function hiResCover(url: string | null | undefined, source?: Source): string | null {
  if (!url) return null
  switch (source) {
    case "wy": // NetEase image service resizes via ?param=WxH
      return /[?&]param=/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}param=600y600`
    case "tx": // QQ bakes the size into the path as R{W}x{H}
      return url.replace(/R\d+x\d+/, "R800x800")
    case "kg": // KuGou: we resolve the {size} path segment to 240 on import
      return url.replace("/240/", "/480/")
    default:
      return url
  }
}
