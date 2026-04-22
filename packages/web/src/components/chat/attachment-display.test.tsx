import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AttachmentMeta } from '@/hooks/use-attachment-meta';

type HookReturn = {
  data?: AttachmentMeta;
  isLoading: boolean;
  isError: boolean;
};

let mockReturn: HookReturn = { isLoading: true, isError: false };

vi.mock('@/hooks/use-attachment-meta', () => ({
  useAttachmentMeta: () => mockReturn,
}));

import { AttachmentDisplay } from './attachment-display';

const baseMeta: AttachmentMeta = {
  id: 'a1',
  filename: 'doc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1234,
  extractionStatus: 'ok',
  extractionSource: 'markitdown',
  extractionError: null,
  extractedChars: 1356,
  extractedAt: 1_700_000_000,
};

const baseAttachment = {
  id: 'a1',
  filename: 'doc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1234,
};

describe('AttachmentDisplay / ExtractionBadge', () => {
  beforeEach(() => {
    mockReturn = { isLoading: true, isError: false };
  });

  it('renders nothing when attachments is empty', () => {
    const { container } = render(<AttachmentDisplay attachments={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading badge while meta loads', () => {
    render(<AttachmentDisplay attachments={[baseAttachment]} />);
    expect(screen.getByText(/extraction…/i)).toBeInTheDocument();
  });

  it('renders ok badge with chars count and source', () => {
    mockReturn = { isLoading: false, isError: false, data: baseMeta };
    render(<AttachmentDisplay attachments={[baseAttachment]} />);
    expect(screen.getByText(/extrait/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s?356\s?car\./i)).toBeInTheDocument();
    expect(screen.getByText(/MarkItDown/i)).toBeInTheDocument();
  });

  it('renders skipped badge when status is skipped', () => {
    mockReturn = {
      isLoading: false,
      isError: false,
      data: { ...baseMeta, extractionStatus: 'skipped', extractionSource: null, extractedChars: null },
    };
    render(<AttachmentDisplay attachments={[baseAttachment]} />);
    expect(screen.getByText(/non extrait/i)).toBeInTheDocument();
  });

  it('renders failed badge with error tooltip', () => {
    mockReturn = {
      isLoading: false,
      isError: false,
      data: {
        ...baseMeta,
        extractionStatus: 'failed',
        extractionSource: null,
        extractedChars: null,
        extractionError: 'markitdown timeout',
      },
    };
    render(<AttachmentDisplay attachments={[baseAttachment]} />);
    const badge = screen.getByText(/extraction échouée/i);
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[title]')?.getAttribute('title')).toBe('markitdown timeout');
  });

  it('hides badge when showExtractionBadge=false', () => {
    mockReturn = { isLoading: false, isError: false, data: baseMeta };
    render(<AttachmentDisplay attachments={[baseAttachment]} showExtractionBadge={false} />);
    expect(screen.queryByText(/extrait/i)).not.toBeInTheDocument();
  });
});
