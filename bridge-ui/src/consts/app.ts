import { Inter } from 'next/font/google';

export const MAIN_FONT = Inter({
  subsets: ['latin'],
  variable: '--font-main',
  preload: true,
  fallback: ['system-ui', 'sans-serif'],
});

export const APP_NAME = 'Gateway Bridge';
export const APP_DESCRIPTION = 'Cross-chain token transfers powered by Hyperlane';
export const APP_URL = 'bridge.gateway.fm';
export const BRAND_COLOR = '#8950FA';
export const BACKGROUND_COLOR = '#F1F5F9';
export const BACKGROUND_IMAGE = 'url(/backgrounds/gateway-bg.svg)';
