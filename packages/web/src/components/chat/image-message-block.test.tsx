import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageMessageBlock, type ImageBlockData } from './image-message-block';

const B64 = 'iVBORw0KGgoTEST';

describe('ImageMessageBlock', () => {
  it('renders loading state when partial and no b64 yet', () => {
    const data: ImageBlockData = { callId: 'ig_1', status: 'partial' };
    render(<ImageMessageBlock data={data} />);
    expect(screen.getByText(/Buck peint une image/i)).toBeInTheDocument();
  });

  it('renders image with "Aperçu…" overlay in partial state', () => {
    const data: ImageBlockData = {
      callId: 'ig_1',
      status: 'partial',
      b64: B64,
      size: '1024x1024',
    };
    render(<ImageMessageBlock data={data} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', `data:image/png;base64,${B64}`);
    expect(screen.getByText(/Aperçu/i)).toBeInTheDocument();
    // no action buttons in partial
    expect(screen.queryByTitle('Télécharger')).toBeNull();
  });

  it('renders image + 3 action buttons when done', () => {
    const data: ImageBlockData = {
      callId: 'ig_1',
      status: 'done',
      b64: B64,
      size: '1024x1024',
    };
    const onSave = vi.fn();
    const onZoom = vi.fn();
    render(<ImageMessageBlock data={data} onSave={onSave} onZoom={onZoom} />);
    expect(screen.getByTitle(/Sauver/i)).toBeInTheDocument();
    expect(screen.getByTitle('Télécharger')).toBeInTheDocument();
    expect(screen.getByTitle('Agrandir')).toBeInTheDocument();
    // no "Aperçu..." overlay in done state
    expect(screen.queryByText(/Aperçu/i)).toBeNull();
  });

  it('invokes onSave with callId and b64 on save click', () => {
    const data: ImageBlockData = {
      callId: 'ig_xyz',
      status: 'done',
      b64: B64,
      size: '1024x1024',
    };
    const onSave = vi.fn();
    render(<ImageMessageBlock data={data} onSave={onSave} />);
    fireEvent.click(screen.getByTitle(/Sauver/i));
    expect(onSave).toHaveBeenCalledWith('ig_xyz', B64);
  });

  it('disables save button when savedToWorkspace is set', () => {
    const data: ImageBlockData = {
      callId: 'ig_1',
      status: 'done',
      b64: B64,
      size: '1024x1024',
      savedToWorkspace: 'research/covers/v1.png',
    };
    const onSave = vi.fn();
    render(<ImageMessageBlock data={data} onSave={onSave} />);
    const saveBtn = screen.getByTitle(/Sauvegardé/i);
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText(/research\/covers\/v1\.png/)).toBeInTheDocument();
  });

  it('toggles revised prompt visibility', () => {
    const data: ImageBlockData = {
      callId: 'ig_1',
      status: 'done',
      b64: B64,
      size: '1024x1024',
      revisedPrompt: 'A cinematic portrait of a fox',
    };
    render(<ImageMessageBlock data={data} />);
    expect(screen.queryByText('A cinematic portrait of a fox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Voir le prompt révisé/i }));
    expect(screen.getByText('A cinematic portrait of a fox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Masquer le prompt/i }));
    expect(screen.queryByText('A cinematic portrait of a fox')).toBeNull();
  });

  it('renders moderation error message when status=failed + code=moderation_blocked', () => {
    const data: ImageBlockData = {
      callId: 'ig_1',
      status: 'failed',
      errorCode: 'moderation_blocked',
    };
    render(<ImageMessageBlock data={data} />);
    expect(screen.getByText(/refusé ce prompt pour raisons de modération/i)).toBeInTheDocument();
  });

  it('renders generic error message for other failures', () => {
    const data: ImageBlockData = {
      callId: 'ig_1',
      status: 'failed',
      errorMessage: 'Network glitch',
    };
    render(<ImageMessageBlock data={data} />);
    expect(screen.getByText('Network glitch')).toBeInTheDocument();
  });
});
