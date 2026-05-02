import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const baseSettings = {
  defaultModel: 'gpt-5.4-mini',
  defaultReasoningEffort: 'low',
  monthlyCostLimitUsd: 20,
  alertThresholds: [80, 100],
  hardStop: true,
  billingResetDay: 1,
  realtimeDefaultVoice: 'coral',
  realtimeTurnDetection: {
    mode: 'server_vad' as const,
    threshold: 0.5,
    prefix_padding_ms: 500,
    silence_duration_ms: 500,
    interrupt_response: true,
  },
  realtimeSilenceTimeoutSec: 30,
  realtimeTools: { bible: true, webSearch: true },
  chatTools: { webSearch: false, fileSearch: false, imageGen: false },
  vectorStoreId: null,
  vectorStoreLastSyncAt: null,
  ttsDefaultVoice: null,
  imageQuality: 'medium' as const,
  imageSize: '1024x1024' as const,
};

const { mockFetchSettings, mockUpdateSettings } = vi.hoisted(() => ({
  mockFetchSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({
  fetchSettings: mockFetchSettings,
  updateSettings: mockUpdateSettings,
}));

import { ImagesSection } from './images-section';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockFetchSettings.mockClear();
  mockUpdateSettings.mockClear();
  mockFetchSettings.mockResolvedValue(baseSettings);
  mockUpdateSettings.mockImplementation(async (patch: Record<string, unknown>) => ({
    ...baseSettings,
    ...patch,
  }));
});

describe('ImagesSection', () => {
  it('renders title and toggle OFF by default', async () => {
    renderWithClient(<ImagesSection />);
    expect(
      await screen.findByRole('heading', { name: /Images/i }),
    ).toBeInTheDocument();
    const toggle = await screen.findByLabelText<HTMLInputElement>(
      "Activer la génération d'images",
    );
    expect(toggle.checked).toBe(false);
  });

  it('hides quality/size controls when toggle is OFF', async () => {
    renderWithClient(<ImagesSection />);
    await screen.findByLabelText("Activer la génération d'images");
    expect(screen.queryByLabelText("Taille d'image par défaut")).toBeNull();
    expect(screen.queryByRole('radio', { name: /Moyenne/ })).toBeNull();
  });

  it('shows quality radios + size select when imageGen=true', async () => {
    mockFetchSettings.mockResolvedValue({
      ...baseSettings,
      chatTools: { ...baseSettings.chatTools, imageGen: true },
    });
    renderWithClient(<ImagesSection />);
    await screen.findByLabelText("Taille d'image par défaut");
    expect(screen.getByRole('radio', { name: /Basse/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Moyenne/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Haute/ })).toBeInTheDocument();
    const select = screen.getByLabelText<HTMLSelectElement>(
      "Taille d'image par défaut",
    );
    expect(select.options).toHaveLength(4);
    expect(select.value).toBe('1024x1024');
  });

  it('toggling ON mutates chatTools.imageGen via updateSettings', async () => {
    renderWithClient(<ImagesSection />);
    const toggle = await screen.findByLabelText<HTMLInputElement>(
      "Activer la génération d'images",
    );
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalled();
      expect(mockUpdateSettings.mock.calls[0]![0]).toEqual({
        chatTools: { webSearch: false, fileSearch: false, imageGen: true },
      });
    });
  });

  it('changing quality mutates imageQuality', async () => {
    mockFetchSettings.mockResolvedValue({
      ...baseSettings,
      chatTools: { ...baseSettings.chatTools, imageGen: true },
    });
    renderWithClient(<ImagesSection />);
    const highRadio = await screen.findByRole<HTMLInputElement>('radio', {
      name: /Haute/,
    });
    fireEvent.click(highRadio);
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalled();
      expect(mockUpdateSettings.mock.calls[0]![0]).toEqual({
        imageQuality: 'high',
      });
    });
  });

  it('changing size mutates imageSize', async () => {
    mockFetchSettings.mockResolvedValue({
      ...baseSettings,
      chatTools: { ...baseSettings.chatTools, imageGen: true },
    });
    renderWithClient(<ImagesSection />);
    const select = await screen.findByLabelText<HTMLSelectElement>(
      "Taille d'image par défaut",
    );
    fireEvent.change(select, { target: { value: '1536x1024' } });
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalled();
      expect(mockUpdateSettings.mock.calls[0]![0]).toEqual({
        imageSize: '1536x1024',
      });
    });
  });

  it('displays estimated cost reflecting quality × orientation', async () => {
    mockFetchSettings.mockResolvedValue({
      ...baseSettings,
      chatTools: { ...baseSettings.chatTools, imageGen: true },
      imageQuality: 'high',
      imageSize: '1536x1024',
    });
    renderWithClient(<ImagesSection />);
    // $0.165 landscape high
    await waitFor(() => {
      expect(screen.getByText(/0\.17|0\.165/)).toBeInTheDocument();
    });
  });
});
