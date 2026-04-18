import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SidebarLeftHeader } from './sidebar-left-header';
import { SidebarLeftSessions } from './sidebar-left-sessions';
import { SidebarLeftFooter } from './sidebar-left-footer';
import { apiFetch } from '@/lib/api';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  email: string;
}

export function SidebarLeft({ collapsed, onToggle, email }: Props) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      navigate({ to: '/login' });
    }
  }

  return (
    <div className="flex h-full flex-col select-none overflow-hidden">
      <SidebarLeftHeader collapsed={collapsed} onToggle={onToggle} query={query} onQueryChange={setQuery} />
      <div className="flex-1 overflow-y-auto">
        <SidebarLeftSessions collapsed={collapsed} query={query} />
      </div>
      <SidebarLeftFooter collapsed={collapsed} email={email} onLogout={onLogout} />
    </div>
  );
}
