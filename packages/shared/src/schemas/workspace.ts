import { z } from 'zod';

// ---------- Workspace tree ----------

export const FileEntryType = z.enum(['file', 'directory']);

export const FileEntry: z.ZodType<{
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mimeType?: string;
  children?: FileEntry[];
}> = z.object({
  name: z.string(),
  path: z.string(),
  type: FileEntryType,
  size: z.number().optional(),
  mimeType: z.string().optional(),
  children: z.lazy(() => z.array(FileEntry)).optional(),
});
export type FileEntry = z.infer<typeof FileEntry>;

export const WorkspaceTreeResponse = z.object({
  tree: z.array(FileEntry),
});
export type WorkspaceTreeResponse = z.infer<typeof WorkspaceTreeResponse>;

// ---------- Workspace file ops ----------

export const CreateDirectoryInput = z.object({
  path: z.string().min(1).max(500),
});

export const RenameInput = z.object({
  newName: z.string().min(1).max(255),
});

// ---------- Attachments ----------

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const AttachmentResponse = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  path: z.string(),
});
export type AttachmentResponse = z.infer<typeof AttachmentResponse>;

export const AttachmentsUploadResponse = z.object({
  attachments: z.array(AttachmentResponse),
});

// ---------- Chat extensions ----------

export const ChatReference = z.object({
  path: z.string(),
  content: z.string(),
});
export type ChatReference = z.infer<typeof ChatReference>;

// ---------- Tool approval ----------

export const ToolApprovalChunk = z.object({
  type: z.literal('tool_approval'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
});
export type ToolApprovalChunk = z.infer<typeof ToolApprovalChunk>;

export const ToolApprovalDecision = z.object({
  toolCallId: z.string(),
  approved: z.boolean(),
});
export type ToolApprovalDecision = z.infer<typeof ToolApprovalDecision>;

// ---------- Tool meta (persisted on messages) ----------

export const ToolMeta = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  status: z.enum(['approved', 'denied', 'auto', 'blocked']),
  result: z.object({
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    killed: z.boolean().optional(),
    truncated: z.boolean().optional(),
    content: z.string().optional(),
    error: z.string().optional(),
    ok: z.boolean().optional(),
  }).optional(),
});
export type ToolMeta = z.infer<typeof ToolMeta>;

// ---------- Tool approval request (in POST /api/chat body) ----------

export const ToolApprovalRequest = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  approved: z.boolean(),
});
export type ToolApprovalRequest = z.infer<typeof ToolApprovalRequest>;

// ---------- Skills ----------

export const SkillMeta = z.object({
  name: z.string(),
  description: z.string(),
});
export type SkillMeta = z.infer<typeof SkillMeta>;
