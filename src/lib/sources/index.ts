/**
 * Sources module — runtime runner, registry seam, and script persistence.
 * Zustand sourceStore remains the UI projection / orchestration adapter.
 */
export {
  sourceRunner,
  bindSourceRegistry,
  type SourceRegistry,
} from "@/lib/sourceRunner"
export { loadSourceScripts, saveSourceScripts } from "./persist"
