import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the app from /home-plan/; dev stays at /
  base: command === 'build' ? '/home-plan/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    // agent worktrees live under .claude/worktrees/ inside the repo; without
    // this exclude their copied test files run (and fail) in the parent suite
    exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**'],
  },
}))
