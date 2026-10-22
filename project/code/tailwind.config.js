/** Nutrea — design tokens */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        petrol: { 900: '#0F3B40', 700: '#1E5A5F', 500: '#2F7A7D', 100: '#E6EFEC' },
        sage: { 500: '#7FA08A', 400: '#A9C6B1', 100: '#E3EFE6', 50: '#EEF3EE' },
        success: { 700: '#2E6B47' },
        amber: { 700: '#8A5418', 100: '#FAEEDD' },
        ink: { DEFAULT: '#18211F', muted: '#5E6866', subtle: '#8A928F' },
        line: '#E4E2DC',
        canvas: '#F5F4F0',
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { tag: '6px', ctl: '10px', card: '16px' },
      fontSize: { label: ['11px', { letterSpacing: '.06em' }] },
    },
  },
};
