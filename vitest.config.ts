import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/issueInput.ts',
        'src/jiraCredentials.ts',
        'src/jiraClient.ts',
        'src/remoteLinks.ts',
        'src/testModeData.ts',
        'src/webviewMessages.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
