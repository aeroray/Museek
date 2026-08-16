export type SourceWorkerHttpRequest = {
  type: "http"
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export type SourceWorkerToHost =
  | { type: "ready" }
  | { type: "inited"; sources?: Record<string, unknown>; hasHandler: boolean }
  | { type: "initError"; error: string; needsDom?: boolean }
  | SourceWorkerHttpRequest
  | { type: "httpAbort"; id: string }
  | { type: "invokeResult"; callId: string; ok: true; result: unknown }
  | { type: "invokeResult"; callId: string; ok: false; error: string }

export type HostToSourceWorker =
  | { type: "init"; scriptId: string; rawScript: string; name: string; version: string; author: string; description: string }
  | {
      type: "httpResult"
      id: string
      ok: true
      status: number
      statusText: string
      headers: Record<string, string>
      text: string
    }
  | { type: "httpResult"; id: string; ok: false; error: string }
  | { type: "invoke"; callId: string; payload: unknown }
