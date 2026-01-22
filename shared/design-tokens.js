/**
 * Gateway Design Tokens
 * Canonical color, font, and spacing definitions for Dashboard and Bridge-UI
 */
module.exports = {
  colors: {
    primary: {
      50: '#F5F3FF',
      100: '#EDE9FE',
      200: '#C4A8FD',
      300: '#A478FC',
      400: '#8950FA',
      500: '#8950FA',
      600: '#6B3DD4',
      700: '#5B32B0',
      800: '#4C2889',
      900: '#3D1F6D',
    },
    neutral: {
      50: '#FFFFFF',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      500: '#6B7280',
      700: '#374151',
      800: '#1A1A1A',
      900: '#0F0F0F',
    },
    status: {
      success: '#22C55E',
      successLight: '#DCFCE7',
      warning: '#EAB308',
      warningLight: '#FEF9C3',
      error: '#EF4444',
      errorLight: '#FEE2E2',
    },
  },
  fonts: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace'],
  },
  borderRadius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
  },
  shadows: {
    card: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
    primary: '0 0 20px rgba(137,80,250,0.3)',
  },
};
