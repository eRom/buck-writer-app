import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EntityCard } from '@/components/entities/entity-card';
import type { Character } from '@/types/entities';

describe('EntityCard', () => {
  it('renders name, type badge and description', () => {
    const character: Character = {
      id: 'a',
      name: 'Aragorn',
      description: 'Roi du Gondor',
      traits: null,
      background: null,
      notes: null,
      created_at: 0,
      updated_at: 0,
    };
    render(<EntityCard entity={character} type="character" onClick={() => {}} />);
    expect(screen.getByText('Aragorn')).toBeInTheDocument();
    expect(screen.getByText('character')).toBeInTheDocument();
    expect(screen.getByText('Roi du Gondor')).toBeInTheDocument();
  });
});
