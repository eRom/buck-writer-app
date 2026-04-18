import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

let pipelineInstance: FeatureExtractionPipeline | null = null;

/**
 * Charge le modele d'embedding une seule fois (singleton).
 * Premier appel telecharge ~200MB depuis HuggingFace.
 */
export async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (pipelineInstance) {
    return pipelineInstance;
  }

  console.error("[embeddings] Chargement du modele Xenova/multilingual-e5-base...");
  console.error("[embeddings] Premier lancement : telechargement du modele (~200MB)...");

  // @ts-expect-error — HuggingFace Transformers pipeline() union type too complex for TS
  pipelineInstance = await pipeline("feature-extraction", "Xenova/multilingual-e5-base", {
    dtype: "fp32",
  });

  console.error("[embeddings] Modele charge avec succes");

  return pipelineInstance;
}
