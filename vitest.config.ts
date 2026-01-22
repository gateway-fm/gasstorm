import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['dashboard/src/**/*.test.ts'],
    exclude: ['bridge-ui/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'dashboard/src'),
    },
  },
})
