import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Bound concurrent jsdom instances and Emotion style calculations.
    maxWorkers: 2,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    environment: 'jsdom',
    restoreMocks: true,
  },
});
