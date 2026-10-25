import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Bound concurrent jsdom instances as the admin integration suite grows.
    maxWorkers: 4,
    environment: 'jsdom',
    restoreMocks: true,
  },
});
