/** @type {import('tailwindcss').Config} */
// Colors resolve to the --gc-* vars in src/shared/index.css, which switch per theme
// via <html data-theme="light">. Palettes are documented in DESIGN.md.
const v = (name) => `rgb(var(--gc-${name}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        'surface-1': v('surface-1'),
        'surface-2': v('surface-2'),
        'surface-3': v('surface-3'),
        'surface-carbon': v('surface-carbon'),
        primary: {
          DEFAULT: v('primary'),
          hover: v('primary-hover'),
          dark: v('primary-dark'),
        },
        'on-primary': v('on-primary'),
        hairline: {
          DEFAULT: v('hairline'),
          strong: v('hairline-strong'),
        },
        'text-primary': v('text-primary'),
        'text-secondary': v('text-secondary'),
        'text-muted': v('text-muted'),
        'text-disabled': v('text-disabled'),
        success: v('success'),
        warning: v('warning'),
        error: v('error'),
        info: v('info'),
      },
      borderRadius: {
        none: '0px',
        xs: '2px',
        sm: '4px',
        md: '6px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        modal: '0 12px 32px rgb(var(--gc-shadow) / 0.35)',
      }
    },
  },
  plugins: [],
}
