// Test shim: the harness runs in plain Chromium, not the Tauri webview, so the
// real `@/lib/http` (which needs the IPC bridge) is aliased to plain `fetch`.
export async function httpFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init)
}
