import { httpFetch } from "@/lib/http"
import { t } from "@/lib/i18n"
import { parseScriptMeta } from "@/lib/lxApi"
import { assertAllowedSourceUrl } from "@/lib/sources/urlPolicy"
import type { LxRequestResult, SourceScript } from "@/types/source"
import type { HostToSourceWorker, SourceWorkerToHost } from "./sourceWorkerMessages"

const INIT_MS = 10_000

function headersFromResponse(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  const headers = res.headers
  if (!headers) return out
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  return out
}

function mapInitError(error: string, needsDom?: boolean): Error {
  if (needsDom) return new Error(t("sources.err.needsDom"))
  if (/window|document|localStorage|sessionStorage/i.test(error)) {
    return new Error(t("sources.err.needsDom"))
  }
  return new Error(error)
}

export class SourceWorkerHost {
  private worker: Worker | null = null
  private scriptId = ""
  private callSeq = 0
  private httpAborts = new Map<string, AbortController>()
  private invokeWaiters = new Map<
    string,
    { resolve: (v: LxRequestResult) => void; reject: (e: Error) => void }
  >()
  private initWaiter: {
    resolve: (sources: Record<string, unknown> | undefined) => void
    reject: (e: Error) => void
  } | null = null
  private readyWaiter: { resolve: () => void; reject: (e: Error) => void } | null =
    null
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  private initTimer: ReturnType<typeof setTimeout> | null = null

  async start(script: SourceScript): Promise<Record<string, unknown> | undefined> {
    this.scriptId = script.id
    const meta = parseScriptMeta(script.rawScript)
    const worker = new Worker(new URL("./sourceWorker.ts", import.meta.url), {
      type: "module",
    })
    this.worker = worker
    worker.onmessage = (ev: MessageEvent<SourceWorkerToHost>) => {
      this.onMessage(ev.data)
    }
    worker.onerror = (ev) => {
      const err = new Error(ev.message || t("sources.err.workerCrash"))
      if (this.initWaiter || this.readyWaiter) {
        this.failInit(err)
        return
      }
      for (const waiter of this.invokeWaiters.values()) waiter.reject(err)
      this.invokeWaiters.clear()
      this.worker = null
    }

    await this.waitReady()
    const inited = this.waitInited()
    this.post({
      type: "init",
      scriptId: script.id,
      rawScript: script.rawScript,
      name: meta.name,
      version: meta.version,
      author: meta.author,
      description: meta.description,
    })
    return inited
  }

  invoke(payload: unknown): Promise<LxRequestResult> {
    const worker = this.worker
    if (!worker) return Promise.reject(new Error("source worker is not running"))
    const callId = String(++this.callSeq)
    return new Promise((resolve, reject) => {
      this.invokeWaiters.set(callId, { resolve, reject })
      this.post({ type: "invoke", callId, payload })
    })
  }

  terminate(): void {
    this.clearTimers()
    for (const ac of this.httpAborts.values()) ac.abort()
    this.httpAborts.clear()
    const closed = new Error("source worker terminated")
    this.readyWaiter?.reject(closed)
    this.readyWaiter = null
    this.initWaiter?.reject(closed)
    this.initWaiter = null
    for (const waiter of this.invokeWaiters.values()) waiter.reject(closed)
    this.invokeWaiters.clear()
    this.worker?.terminate()
    this.worker = null
  }

  private clearTimers(): void {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer)
      this.readyTimer = null
    }
    if (this.initTimer) {
      clearTimeout(this.initTimer)
      this.initTimer = null
    }
  }

  private post(msg: HostToSourceWorker): void {
    this.worker?.postMessage(msg)
  }

  private waitReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.readyWaiter = { resolve, reject }
      this.readyTimer = setTimeout(() => {
        this.readyTimer = null
        this.failInit(new Error(t("sources.err.workerCrash")))
      }, INIT_MS)
    })
  }

  private waitInited(): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve, reject) => {
      this.initWaiter = { resolve, reject }
      this.initTimer = setTimeout(() => {
        this.initTimer = null
        this.failInit(
          new Error(
            "Script did not call lx.send('inited') within 10s (init API may be blocked)",
          ),
        )
      }, INIT_MS)
    })
  }

  private failInit(err: Error): void {
    this.clearTimers()
    this.readyWaiter?.reject(err)
    this.readyWaiter = null
    this.initWaiter?.reject(err)
    this.initWaiter = null
  }

  private onMessage(msg: SourceWorkerToHost): void {
    if (!msg || typeof msg !== "object") return

    if (msg.type === "ready") {
      if (this.readyTimer) {
        clearTimeout(this.readyTimer)
        this.readyTimer = null
      }
      this.readyWaiter?.resolve()
      this.readyWaiter = null
      return
    }

    if (msg.type === "initError") {
      this.failInit(mapInitError(msg.error, msg.needsDom))
      return
    }

    if (msg.type === "inited") {
      if (this.initTimer) {
        clearTimeout(this.initTimer)
        this.initTimer = null
      }
      if (!msg.hasHandler) {
        this.failInit(new Error("Script did not register a request handler"))
        return
      }
      this.initWaiter?.resolve(msg.sources)
      this.initWaiter = null
      return
    }

    if (msg.type === "http") {
      void this.handleHttp(msg)
      return
    }

    if (msg.type === "httpAbort") {
      this.httpAborts.get(msg.id)?.abort()
      this.httpAborts.delete(msg.id)
      return
    }

    if (msg.type === "invokeResult") {
      const waiter = this.invokeWaiters.get(msg.callId)
      if (!waiter) return
      this.invokeWaiters.delete(msg.callId)
      if (msg.ok) waiter.resolve(msg.result as LxRequestResult)
      else waiter.reject(new Error(msg.error))
    }
  }

  private async handleHttp(msg: {
    id: string
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }): Promise<void> {
    const ac = new AbortController()
    this.httpAborts.set(msg.id, ac)
    try {
      assertAllowedSourceUrl(msg.url, this.scriptId)
      const res = await httpFetch(msg.url, {
        method: msg.method,
        headers: msg.headers,
        body: msg.body,
        signal: ac.signal,
      })
      const text = await res.text()
      this.post({
        type: "httpResult",
        id: msg.id,
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers: headersFromResponse(res),
        text,
      })
    } catch (err) {
      this.post({
        type: "httpResult",
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.httpAborts.delete(msg.id)
    }
  }
}
