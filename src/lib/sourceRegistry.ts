import type { SourceRegistry, SourceScript } from "@/types/source";

export function createSourceRegistry(): SourceRegistry {
  let scripts: SourceScript[] = [];
  return {
    getScripts: () => scripts,
    setScripts: (next) => {
      scripts = next;
    },
  };
}
