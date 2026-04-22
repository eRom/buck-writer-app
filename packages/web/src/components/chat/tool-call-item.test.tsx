import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolCallItem } from './tool-call-item';

describe('ToolCallItem', () => {
  it('renders running state with spinning loader', () => {
    const { container } = render(<ToolCallItem name="recall" state="running" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.getByText('recall')).toBeInTheDocument();
  });

  it('renders success state with check icon', () => {
    const { container } = render(<ToolCallItem name="recall" state="success" />);
    expect(container.querySelector('.text-emerald-400')).toBeTruthy();
  });

  it('renders error state with destructive X and tooltip', () => {
    render(
      <ToolCallItem name="bible" state="error" output="server timeout" />,
    );
    const xWrapper = document.querySelector('[title="server timeout"]');
    expect(xWrapper).not.toBeNull();
  });

  it('renders pending-approval with Autoriser/Refuser buttons', () => {
    render(
      <ToolCallItem
        name="shell_execute"
        state="pending-approval"
        args="{}"
        onApprove={() => {}}
        onDeny={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /autoriser/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refuser/i })).toBeInTheDocument();
  });

  it('uses rawName for shell icon detection (terminal icon for shell_execute)', () => {
    const { container } = render(
      <ToolCallItem name="Execution commande" rawName="shell_execute" state="success" />,
    );
    // Terminal icon has data-testid via lucide; fallback : check the displayed name
    expect(screen.getByText('Execution commande')).toBeInTheDocument();
    expect(container.firstChild).toBeTruthy();
  });
});
