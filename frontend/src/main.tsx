import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProviders } from './app/providers'
import { validateEnv } from './config/env'

const { warnings, criticalError } = validateEnv()

for (const warning of warnings) {
  console.warn('[studymate config]', warning)
}

const root = document.getElementById('root')!

if (criticalError) {
  console.error('[studymate config] startup blocked:', criticalError)
  root.innerHTML = `
    <div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:100vh;padding:2rem;font-family:system-ui,sans-serif;
      background:#0f172a;color:#f1f5f9;text-align:center;gap:1rem;
    ">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h1 style="font-size:1.5rem;font-weight:700;margin:0">Configuration error</h1>
      <p style="max-width:520px;line-height:1.6;color:#94a3b8;margin:0">${criticalError}</p>
      <p style="font-size:0.85rem;color:#475569;margin:0">
        Create a <code style="background:#1e293b;padding:2px 6px;border-radius:4px">.env.local</code>
        file in the <code style="background:#1e293b;padding:2px 6px;border-radius:4px">frontend/</code>
        directory and copy from <code style="background:#1e293b;padding:2px 6px;border-radius:4px">.env.example</code>.
      </p>
    </div>
  `
} else {
  createRoot(root).render(
    <StrictMode>
      <AppProviders><App /></AppProviders>
    </StrictMode>,
  )
}
