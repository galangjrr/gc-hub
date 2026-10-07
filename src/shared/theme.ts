// Light/dark theme switch. Colors live in the --gc-* vars (src/shared/index.css);
// this only flips <html data-theme> and remembers the choice per machine.
export type Theme = 'dark' | 'light'

const KEY = 'gchub_theme'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage blocked: theme still applies for this session
  }
}
