import { Space_Grotesk as SpaceGrotesk } from 'next/font/google';

export const MAIN_FONT = SpaceGrotesk({
  subsets: ['latin'],
  variable: '--font-main',
  preload: true,
  fallback: ['Segoe UI', 'sans-serif'],
});

export const APP_NAME = 'Gateway Bridge';
export const APP_DESCRIPTION = 'Cross-chain token transfers powered by Hyperlane';
export const APP_URL = 'bridge.gateway.fm';
export const BRAND_COLOR = '#06b6d4';
export const BACKGROUND_COLOR = '#020617';
export const BACKGROUND_IMAGE =
  'radial-gradient(circle at 12% 8%, rgba(34, 211, 238, 0.22), transparent 40%), radial-gradient(circle at 85% 10%, rgba(249, 115, 22, 0.24), transparent 36%), radial-gradient(circle at 50% 100%, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.98)), url(/backgrounds/gateway-bg.svg)';
