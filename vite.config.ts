import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/* A relative base lets the built app run from any folder, such as a GitHub Pages project address */
/* or a future desktop wrapper. */
/* test: Vitest runs the files in tests/ inside jsdom, a simulated browser page; */
/* tests/setup.ts runs first to fill in browser features jsdom does not have. Stylesheets are */
/* left out of tests, except accents.css, whose colours a test reads to check their contrast. */
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    css: { include: [/accents\.css/] }
  }
});
