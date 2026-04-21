export interface TtsPostResponse {
  url: string;
  voice: string;
  durationSec: number | null;
  cached: boolean;
  costUsd: number;
}
