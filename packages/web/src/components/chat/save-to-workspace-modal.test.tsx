import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const tree = [
  { name: 'covers', path: 'covers', type: 'directory' as const, children: [] },
  {
    name: 'research',
    path: 'research',
    type: 'directory' as const,
    children: [
      { name: 'bible', path: 'research/bible', type: 'directory' as const, children: [] },
    ],
  },
];

const { mockFetchTree, mockSave } = vi.hoisted(() => ({
  mockFetchTree: vi.fn(async () => ({ tree })),
  mockSave: vi.fn(),
}));

vi.mock('@/lib/workspace', () => ({ fetchWorkspaceTree: mockFetchTree }));
vi.mock('@/lib/images', () => ({ saveImageToWorkspace: mockSave }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SaveToWorkspaceModal } from './save-to-workspace-modal';
import { toast } from 'sonner';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockFetchTree.mockClear();
  mockSave.mockClear();
  mockFetchTree.mockResolvedValue({ tree });
  mockSave.mockResolvedValue({
    ok: true,
    path: 'covers/image.png',
    absPath: '/tmp/ws/covers/image.png',
    sizeBytes: 1234,
    savedAt: Date.now(),
  });
  (toast.success as ReturnType<typeof vi.fn>).mockClear();
  (toast.error as ReturnType<typeof vi.fn>).mockClear();
});

describe('SaveToWorkspaceModal', () => {
  it('renders title and default filename pattern when open', async () => {
    renderWithClient(
      <SaveToWorkspaceModal
        open
        onOpenChange={() => {}}
        messageId="msg_1"
        callId="ig_1"
      />,
    );
    expect(
      await screen.findByRole('heading', { name: /Sauver l'image/i }),
    ).toBeInTheDocument();
    const input = await screen.findByLabelText<HTMLInputElement>('Nom du fichier');
    expect(input.value).toMatch(/^image_\d{4}-\d{2}-\d{2}_\d{6}\.png$/);
  });

  it('lists root + workspace directories in select', async () => {
    renderWithClient(
      <SaveToWorkspaceModal
        open
        onOpenChange={() => {}}
        messageId="msg_1"
        callId="ig_1"
      />,
    );
    const select = await screen.findByLabelText<HTMLSelectElement>('Dossier');
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThanOrEqual(4);
    });
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('');
    expect(values).toContain('covers');
    expect(values).toContain('research');
    expect(values).toContain('research/bible');
  });

  it('submits to saveImageToWorkspace with joined path and calls onSaved', async () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderWithClient(
      <SaveToWorkspaceModal
        open
        onOpenChange={onOpenChange}
        messageId="msg_42"
        callId="ig_42"
        defaultFilename="fox.png"
        onSaved={onSaved}
      />,
    );
    const select = await screen.findByLabelText<HTMLSelectElement>('Dossier');
    await waitFor(() => {
      expect(select.options.length).toBeGreaterThanOrEqual(4);
    });
    fireEvent.change(select, { target: { value: 'covers' } });
    fireEvent.click(screen.getByRole('button', { name: /Sauver$/i }));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith({
        messageId: 'msg_42',
        callId: 'ig_42',
        path: 'covers/fox.png',
      });
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('appends .png extension when missing', async () => {
    renderWithClient(
      <SaveToWorkspaceModal
        open
        onOpenChange={() => {}}
        messageId="msg_1"
        callId="ig_1"
        defaultFilename="sans_ext"
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Sauver$/i }));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith({
        messageId: 'msg_1',
        callId: 'ig_1',
        path: 'sans_ext.png',
      });
    });
  });

  it('shows error toast when save fails', async () => {
    mockSave.mockRejectedValue(new Error('Boom'));
    renderWithClient(
      <SaveToWorkspaceModal
        open
        onOpenChange={() => {}}
        messageId="msg_1"
        callId="ig_1"
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Sauver$/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Boom'));
    });
  });
});
