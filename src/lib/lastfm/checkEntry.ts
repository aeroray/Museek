/**
 * Re-export barrel used only by `scripts/check-lastfm.mjs`.
 *
 * The check bundles this with esbuild so the `@` alias resolves; importing the
 * two modules directly from the script would work too, but a single entry keeps
 * the bundler invocation to one build.
 */
export * from "./api";
export * from "./scrobble";
