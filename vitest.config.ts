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
        'src/cachedIssueDetailBundle.ts',
        'src/dashboardItems.ts',
        'src/jiraAdfRenderer.ts',
        'src/jiraIssueDetails.ts',
        'src/jiraCredentials.ts',
        'src/jiraClient.ts',
        'src/jiraNotifications.ts',
        'src/jiraOpsSettings.ts',
        'src/notificationPoller.ts',
        'src/remoteLinks.ts',
        'src/testModeData.ts',
        'src/ttlCache.ts',
        'src/webviewMessages.ts',
        'src/whatsNew.ts',
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
