import { neteaseProvider } from "@/lib/recognition/neteaseProvider";
import type {
  RecognitionProvider,
  RecognitionProviderAdapter,
} from "@/lib/recognition/contracts";

export const recognitionProviders: Record<
  RecognitionProvider,
  RecognitionProviderAdapter
> = {
  netease: neteaseProvider,
};
