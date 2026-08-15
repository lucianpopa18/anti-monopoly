import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages servește sub /anti-monopoly/
export default defineConfig({
  base: '/anti-monopoly/',
  plugins: [react()],
});
