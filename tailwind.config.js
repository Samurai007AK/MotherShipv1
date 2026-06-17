/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mothership: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
        },
        agent: {
          claude: '#c977a0',
          codex: '#4a9eff',
          gemini: '#4285f4',
          opencode: '#4ade80',
        },
        status: {
          running: '#22c55e',
          idle: '#a3a3a3',
          error: '#ef4444',
        },
        // Theme colors mapped to CSS variables (support opacity via RGB)
        'c-bg': 'rgb(var(--color-bg-rgb) / <alpha-value>)',
        'c-card': 'rgb(var(--color-card-rgb) / <alpha-value>)',
        'c-surface': 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        'c-surface-hover': 'rgb(var(--color-surface-hover-rgb) / <alpha-value>)',
        'c-border': 'rgb(var(--color-border-rgb) / <alpha-value>)',
        'c-border-strong': 'rgb(var(--color-border-strong-rgb) / <alpha-value>)',
        // Text colors (hex, no opacity needed)
        'c-text': 'var(--color-text)',
        'c-text-dim': 'var(--color-text-dim)',
        'c-muted': 'var(--color-muted)',
        'c-muted-light': 'var(--color-muted-light)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
