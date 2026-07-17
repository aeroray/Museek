import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { copyFileSync, readFileSync } from "node:fs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// App version baked into the bundle from package.json — the single source of
// truth. The About page reads `__APP_VERSION__` (typed in src/globals.d.ts) so
// it can never drift from the real version. tauri.conf.json reads the same
// package.json, so bumping it alone updates the whole app's version.
const appVersion = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
).version as string;

const brandIconSrc = path.resolve(__dirname, "app-icon.svg");

/** Keep favicon + docs mark copies identical to root `app-icon.svg`. */
function syncBrandIcon(): Plugin {
  const sync = () => {
    copyFileSync(brandIconSrc, path.resolve(__dirname, "public/favicon.svg"));
    copyFileSync(brandIconSrc, path.resolve(__dirname, "docs/app-icon.svg"));
  };
  return {
    name: "museek-sync-brand-icon",
    buildStart() {
      sync();
    },
    configureServer(server) {
      sync();
      server.watcher.add(brandIconSrc);
      server.watcher.on("change", (file) => {
        if (path.resolve(file) === brandIconSrc) sync();
      });
    },
  };
}

// Dev-only CORS proxy: lets the browser preview (which has no Tauri IPC bridge)
// reach the music APIs by forwarding requests server-side. The client hits
// `/__proxy?target=<encoded url>`; forbidden headers arrive as `x-pxy-*`.
function devCorsProxy(): Plugin {
  return {
    name: "museek-dev-cors-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/__proxy")) return next();
        try {
          const target = new URL(req.url, "http://localhost").searchParams.get("target");
          if (!target) {
            res.statusCode = 400;
            res.end("missing target");
            return;
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;

          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v !== "string") continue;
            const lk = k.toLowerCase();
            if (lk.startsWith("x-pxy-")) headers[lk.slice(6)] = v;
            else if (!["host", "connection", "content-length", "origin", "referer"].includes(lk)) headers[lk] = v;
          }

          const upstream = await fetch(target, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
          });

          res.statusCode = upstream.status;
          upstream.headers.forEach((val, key) => {
            if (!["content-encoding", "content-length", "transfer-encoding"].includes(key)) res.setHeader(key, val);
          });
          res.setHeader("access-control-allow-origin", "*");
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.end(`proxy error: ${(err as Error).message}`);
        }
      });
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), syncBrandIcon(), devCorsProxy()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
