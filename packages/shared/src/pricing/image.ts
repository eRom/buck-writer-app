export const GPT_IMAGE_2_MODEL = 'gpt-image-2';

export type ImageQuality = 'low' | 'medium' | 'high';
export type ImageOrientation = 'square' | 'landscape' | 'portrait';

export const GPT_IMAGE_2_PRICING: Record<ImageQuality, Record<ImageOrientation, number>> = {
  low: { square: 0.006, landscape: 0.005, portrait: 0.005 },
  medium: { square: 0.053, landscape: 0.041, portrait: 0.041 },
  high: { square: 0.211, landscape: 0.165, portrait: 0.165 },
};

export function imageOrientation(size: string): ImageOrientation {
  if (size === 'auto') return 'square';
  const parts = size.split('x');
  if (parts.length !== 2) return 'square';
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'square';
  if (w === h) return 'square';
  return w > h ? 'landscape' : 'portrait';
}

export function imageCost(quality: ImageQuality, size: string): number {
  return GPT_IMAGE_2_PRICING[quality][imageOrientation(size)];
}
