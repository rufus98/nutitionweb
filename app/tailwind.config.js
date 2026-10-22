/** Nutrea — design tokens (da project/code/tailwind.config.js).
 *  I colori puntano a variabili CSS in src/theme/tokens.css, così lo stesso
 *  nome vale sia nel tema chiaro sia nel tema scuro. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const names = ['canvas', 'surface', 'surface2', 'sunken', 'line', 'line2', 'ctl', 'ink', 'ink2', 'muted', 'label', 'subtle',
  'primary', 'primary-hover', 'accent', 'strong', 'side', 'side-ink', 'side-muted', 'side-av', 'sage-400', 'sage-500', 'sage-bar',
  'ok-bg', 'ok', 'tint', 'tint2', 'warn-bg', 'warn', 'warn-line', 'tag-bg', 'tag-ink', 'err-bg', 'err', 'err-line', 'avatar', 'orange', 'on-primary'];

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, v(n)])),
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { tag: '6px', ctl: '10px', card: '16px' },
      // Il fontSize "label" del bundle (11px mono, .06em) è nella classe .label di src/index.css:
      // come utility andrebbe in conflitto con il colore "label" (text-label).
    },
  },
  plugins: [],
};
