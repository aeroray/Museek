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
  Object.defineProperty(globalThis, "fetch", {
    value: () => Promise.reject(new Error(`fetch ${DISABLED}`)),
    configurable: true,
  })
  Object.defineProperty(globalThis, "XMLHttpRequest", {
    value: blocked("XMLHttpRequest"),
    configurable: true,
  })
  Object.defineProperty(globalThis, "WebSocket", {
    value: blocked("WebSocket"),
    configurable: true,
  })
  Object.defineProperty(globalThis, "importScripts", {
    value: blocked("importScripts"),
    configurable: true,
  })
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
post({ type: "ready" })
