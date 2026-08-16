/**
 * Sources module — runtime runner and script persistence.
 * Zustand sourceStore remains the UI projection / orchestration adapter.
 */
export {
  sourceRunner,
  createSourceRunner,
  SourceRunner,
} from "@/lib/sourceRunner";
export type { SourceRegistry } from "@/types/source";
export { loadSourceScripts, saveSourceScripts, loadSourceProbeResults, saveSourceProbeResults } from "./persist";
