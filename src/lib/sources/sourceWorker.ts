import { createLxApi } from "../lxApi"
import type { LxRequestResult } from "../../types/source"
import type { HostToSourceWorker, SourceWorkerToHost } from "./sourceWorkerMessages"

const DISABLED = "is disabled in the source sandbox; use lx.request"

function looksLikeDomError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  return /window|document|DOMParser|HTMLElement|localStorage|sessionStorage|documentElement/i.test(
    msg,
  )
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  return String(err ?? "init failed")
}

function installNetworkStubs(): void {
  const blocked = (name: string) => () => {
    throw new Error(`${name} ${DISABLED}`)
  }
  // Non-configurable + non-writable: a script must not be able to delete or
  // replace these stubs to regain direct network access. All egress has to go
  // through lx.request, whose URLs the host re-validates hop by hop.
  const lock = (name: string, value: unknown): void => {
    try {
      Object.defineProperty(globalThis, name, {
        value,
        configurable: false,
        writable: false,
      })
    } catch {
      // Global already locked down (e.g. a second init) — leave it as is.
    }
  }
  lock("fetch", () => Promise.reject(new Error(`fetch ${DISABLED}`)))
  lock("XMLHttpRequest", blocked("XMLHttpRequest"))
  lock("WebSocket", blocked("WebSocket"))
  lock("importScripts", blocked("importScripts"))
  // A nested Worker would start with a fresh, unstubbed global scope.
  lock("Worker", blocked("Worker"))
  lock("SharedWorker", blocked("SharedWorker"))
  // These are also real worker globals and each one opens a network connection
  // without going through `lx.request`, which is the only intended egress path.
  // They were missed, so a script could reach loopback/LAN/metadata endpoints
  // that `assertAllowedSourceUrl` exists to block.
  lock("EventSource", blocked("EventSource"))
  lock("WebTransport", blocked("WebTransport"))
  lock("WebSocketStream", blocked("WebSocketStream"))
  lock("BroadcastChannel", blocked("BroadcastChannel"))
  // WebRTC can open a data channel to a peer without any HTTP egress.
  // `navigator` itself is left alone: source scripts legitimately read the user
  // agent, and stubbing it would break real scripts for no security gain (the
  // network-capable members above are already gone).
  lock("RTCPeerConnection", blocked("RTCPeerConnection"))
  lock("webkitRTCPeerConnection", blocked("webkitRTCPeerConnection"))
}

/**
 * Globals that must not remain reachable once the stubs are installed.
 *
 * Kept as an explicit list so the confinement has a readback assertion rather
 * than relying on the install list staying complete: a denylist will always lag
 * the platform, but a missing entry here means "someone removed a stub", which is
 * worth failing loudly instead of discovering later.
 */
const NETWORK_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "Worker",
  "SharedWorker",
  "EventSource",
  "WebTransport",
  "WebSocketStream",
  "BroadcastChannel",
  "RTCPeerConnection",
] as const

/**
 * Confirm each network global is present-but-inert, so a partial or failed
 * lockdown cannot silently leave direct egress available.
 */
function assertNetworkStubs(): string[] {
  const failures: string[] = []
  for (const name of NETWORK_GLOBALS) {
    const desc = Object.getOwnPropertyDescriptor(globalThis, name)
    if (!desc) {
      // Absent is fine (older WebView): there is nothing to reach.
      continue
    }
    if (desc.configurable || desc.writable) {
      failures.push(`${name} is writable/configurable`)
      continue
    }
    // `fetch` is stubbed with a rejecting function; the rest throw on construct.
    if (typeof desc.value !== "function") failures.push(`${name} is not a function stub`)
  }
  return failures
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return { ...headers }
}

type HttpOk = {
  status: number
  statusText: string
  headers: Record<string, string>
  text: string
}

const httpWaiters = new Map<
  string,
  { resolve: (v: HttpOk) => void; reject: (e: Error) => void }
>()
let httpSeq = 0
let requestHandler: ((payload: unknown) => Promise<LxRequestResult>) | null = null
let initFinished = false

function post(msg: SourceWorkerToHost): void {
  ;(self as unknown as { postMessage: (m: SourceWorkerToHost) => void }).postMessage(
    msg,
  )
}

function failInit(err: unknown): void {
  if (initFinished) return
  initFinished = true
  post({
    type: "initError",
    error: errorMessage(err),
    needsDom: looksLikeDomError(err),
  })
}

function rpcFetch(url: string, init: RequestInit): Promise<Response> {
  const id = String(++httpSeq)
  const method = (init.method || "GET").toUpperCase()
  const headers = headersToRecord(init.headers)
  const body = typeof init.body === "string" ? init.body : undefined

  return new Promise<HttpOk>((resolve, reject) => {
    let settled = false
    const settleReject = (err: Error) => {
      if (settled) return
      settled = true
      httpWaiters.delete(id)
      reject(err)
    }
    const settleResolve = (v: HttpOk) => {
      if (settled) return
      settled = true
      httpWaiters.delete(id)
      resolve(v)
    }

    httpWaiters.set(id, { resolve: settleResolve, reject: settleReject })

    const onAbort = () => {
      post({ type: "httpAbort", id })
      settleReject(new DOMException("The operation was aborted.", "AbortError"))
    }
    if (init.signal?.aborted) {
      onAbort()
      return
    }
    init.signal?.addEventListener("abort", onAbort, { once: true })

    post({ type: "http", id, url, method, headers, body })
  }).then(
    (v) =>
      new Response(v.text, {
        status: v.status,
        statusText: v.statusText,
        headers: v.headers,
      }),
  )
}

function runScript(msg: Extract<HostToSourceWorker, { type: "init" }>): void {
  const lx = createLxApi({
    scriptInfo: {
      name: msg.name,
      version: msg.version,
      author: msg.author,
      description: msg.description,
      rawScript: msg.rawScript,
    },
    requestFn: rpcFetch,
    onRequestRegister: (handler) => {
      requestHandler = handler
    },
    onInited: (data) => {
      if (initFinished) return
      initFinished = true
      const sources =
        data && typeof data === "object" && "sources" in data
          ? (data.sources as Record<string, unknown>)
          : undefined
      post({ type: "inited", sources, hasHandler: Boolean(requestHandler) })
    },
    onUpdateAlert: () => {},
  })

  ;(globalThis as unknown as { lx: unknown }).lx = lx

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(msg.rawScript)
    fn()
  } catch (err) {
    failInit(err)
  }
}

async function handleInvoke(callId: string, payload: unknown): Promise<void> {
  if (!requestHandler) {
    post({ type: "invokeResult", callId, ok: false, error: "no request handler" })
    return
  }
  try {
    const result = await requestHandler(payload)
    post({ type: "invokeResult", callId, ok: true, result })
  } catch (err) {
    post({ type: "invokeResult", callId, ok: false, error: errorMessage(err) })
  }
}

self.onmessage = (ev: MessageEvent<HostToSourceWorker>) => {
  const msg = ev.data
  if (!msg || typeof msg !== "object") return

  if (msg.type === "init") {
    runScript(msg)
    return
  }

  if (msg.type === "httpResult") {
    const waiter = httpWaiters.get(msg.id)
    if (!waiter) return
    if (msg.ok) {
      waiter.resolve({
        status: msg.status,
        statusText: msg.statusText,
        headers: msg.headers,
        text: msg.text,
      })
    } else {
      waiter.reject(new Error(msg.error))
    }
    return
  }

  if (msg.type === "invoke") {
    void handleInvoke(msg.callId, msg.payload)
  }
}

self.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
  ev.preventDefault()
  if (!initFinished) failInit(ev.reason)
})

installNetworkStubs()
{
  const failures = assertNetworkStubs()
  if (failures.length) {
    // Do not report ready with a half-closed sandbox: the host should refuse to
    // run any script rather than execute one with egress still open.
    post({
      type: "initError",
      error: `source sandbox lockdown incomplete: ${failures.join(", ")}`,
      needsDom: false,
    })
    throw new Error(`source sandbox lockdown incomplete: ${failures.join(", ")}`)
  }
}
post({ type: "ready" })
