import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-8 text-foreground">Bible UI — boot OK</div>
  </StrictMode>
);
