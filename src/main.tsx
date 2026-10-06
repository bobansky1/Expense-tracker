import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AccountGate from './AccountGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountGate />
  </StrictMode>,
)
