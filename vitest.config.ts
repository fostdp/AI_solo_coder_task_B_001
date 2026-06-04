import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'build'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['api/modules/**/*.ts', 'src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.d.ts', '**/*.config.*'],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
})
