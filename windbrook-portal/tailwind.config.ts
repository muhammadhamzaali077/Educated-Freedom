import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    './src/views/**/*.{ts,tsx}',
    './src/routes/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Quiet Wealth — dashboard chrome only.
        // The SACS/TCC report renderings keep Andrew's existing palette and
        // are NOT served by these tokens.
        bg: {
          DEFAULT: 'var(--color-bg)',
          raised: 'var(--color-bg-raised)',
          sunken: 'var(--color-bg-sunken)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted: 'var(--color-ink-muted)',
          soft: 'var(--color-ink-soft)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          soft: 'var(--color-accent-soft)',
        },
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        rule: 'var(--color-rule)',
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Times New Roman', 'serif'],
        body: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        label: '0.06em',
        display: '-0.01em',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        page: '200ms',
        swap: '180ms',
      },
    },
  },
  plugins: [],
};

export default config;
