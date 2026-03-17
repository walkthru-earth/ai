import localFont from 'next/font/local';

export const quicksand = localFont({
  src: './fonts/Quicksand-Variable.woff2',
  display: 'swap',
  variable: '--font-quicksand',
  weight: '300 700',
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'sans-serif',
  ],
});
