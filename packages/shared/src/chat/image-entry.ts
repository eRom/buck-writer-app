export interface ImageEntry {
  callId: string;
  b64: string;
  size: string;
  revisedPrompt?: string;
  savedToWorkspace?: string;
  createdAt: number;
}
