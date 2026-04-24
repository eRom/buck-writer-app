import { describe, it, expect } from 'vitest';
import {
  GPT_IMAGE_2_MODEL,
  GPT_IMAGE_2_PRICING,
  imageCost,
  imageOrientation,
} from './image.js';

describe('Image pricing (gpt-image-2)', () => {
  it('GPT_IMAGE_2_MODEL constant', () => {
    expect(GPT_IMAGE_2_MODEL).toBe('gpt-image-2');
  });

  it('grid matches OpenAI published rates', () => {
    expect(GPT_IMAGE_2_PRICING.low).toEqual({ square: 0.006, landscape: 0.005, portrait: 0.005 });
    expect(GPT_IMAGE_2_PRICING.medium).toEqual({ square: 0.053, landscape: 0.041, portrait: 0.041 });
    expect(GPT_IMAGE_2_PRICING.high).toEqual({ square: 0.211, landscape: 0.165, portrait: 0.165 });
  });

  describe('imageOrientation', () => {
    it('1024x1024 → square', () => {
      expect(imageOrientation('1024x1024')).toBe('square');
    });
    it('1536x1024 → landscape', () => {
      expect(imageOrientation('1536x1024')).toBe('landscape');
    });
    it('1024x1536 → portrait', () => {
      expect(imageOrientation('1024x1536')).toBe('portrait');
    });
    it('auto → square (fallback for flat pricing)', () => {
      expect(imageOrientation('auto')).toBe('square');
    });
    it('invalid string → square (fallback)', () => {
      expect(imageOrientation('not-a-size')).toBe('square');
      expect(imageOrientation('')).toBe('square');
      expect(imageOrientation('0x0')).toBe('square');
    });
  });

  describe('imageCost', () => {
    it('low × all orientations', () => {
      expect(imageCost('low', '1024x1024')).toBe(0.006);
      expect(imageCost('low', '1536x1024')).toBe(0.005);
      expect(imageCost('low', '1024x1536')).toBe(0.005);
    });
    it('medium × all orientations', () => {
      expect(imageCost('medium', '1024x1024')).toBe(0.053);
      expect(imageCost('medium', '1536x1024')).toBe(0.041);
      expect(imageCost('medium', '1024x1536')).toBe(0.041);
    });
    it('high × all orientations', () => {
      expect(imageCost('high', '1024x1024')).toBe(0.211);
      expect(imageCost('high', '1536x1024')).toBe(0.165);
      expect(imageCost('high', '1024x1536')).toBe(0.165);
    });
    it('auto size bills as square', () => {
      expect(imageCost('medium', 'auto')).toBe(0.053);
      expect(imageCost('high', 'auto')).toBe(0.211);
    });
  });
});
