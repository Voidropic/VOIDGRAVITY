import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project URL uses /<repository-name>/. Override with VITE_BASE for custom domains.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/VOIDGRAVITY/',
  build: { sourcemap: false, target: 'es2022' },
});
