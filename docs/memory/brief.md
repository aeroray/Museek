# Museek Project Brief

Museek is a cross-platform desktop music aggregator built with Tauri 2, React 19, TypeScript, Vite, and Zustand. It discovers songs, playlists, charts, and lyrics through public platform APIs for NetEase, KuWo, KuGou, QQ Music, and Migu.

Playback and download URLs come from user-imported lx-music-compatible source scripts; Museek does not ship, host, or distribute music content. The frontend lives in `src/`, the native Rust/Tauri layer in `src-tauri/`, and the project uses pnpm. `pnpm tauri dev` starts desktop development; `pnpm build` type-checks and builds the frontend.
