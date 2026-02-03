import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Separate Vite config for Storybook (without react-router plugin)
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
});
