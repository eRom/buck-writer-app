import { useEffect, useState } from 'react';

const LS_LEFT = 'buck.sidebarCollapsed';
const LS_RIGHT = 'buck.panelRightCollapsed';

function read(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(key) === '1';
}

export function usePanelsState() {
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => read(LS_LEFT));
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => read(LS_RIGHT));

  useEffect(() => {
    window.localStorage.setItem(LS_LEFT, leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(LS_RIGHT, rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setLeftCollapsed((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setRightCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed };
}
