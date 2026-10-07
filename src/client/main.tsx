import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClientView } from './views/ClientView'
import { ErrorBoundary } from '../server/components/ErrorBoundary'
import '../shared/index.css'
import { applyTheme, getTheme } from '../shared/theme'

// set before first paint so the window never flashes the wrong theme
applyTheme(getTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Tampilan client bermasalah">
      <ClientView />
    </ErrorBoundary>
  </React.StrictMode>,
)
