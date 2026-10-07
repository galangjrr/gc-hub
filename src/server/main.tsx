import React from 'react'
import ReactDOM from 'react-dom/client'
import { ServerView } from './views/ServerView'
import { ErrorBoundary } from '../shared/ui/ErrorBoundary'
import '../shared/index.css'
import { applyTheme, getTheme } from '../shared/theme'

// set before first paint so the window never flashes the wrong theme
applyTheme(getTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Tampilan kasir bermasalah">
      <ServerView />
    </ErrorBoundary>
  </React.StrictMode>,
)
