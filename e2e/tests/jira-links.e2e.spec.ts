import { test, expect } from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openJiraOpsView,
} from './support/jiraOpsHarness';

test.describe('JiraOps links workflow', () => {
  test('User can view remote web links for a Jira issue key', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
      await expect(frame.getByRole('status')).toContainText('Connected to Example Jira.');
      await frame.getByLabel('Jira issue URL or key').fill('OPS-123');
      await clickWithFallback(frame.getByRole('button', { name: 'Fetch' }));

      await expect(frame.getByRole('status')).toContainText('3 web links found.');
      await expect(frame.getByRole('link', { name: 'Design Review' })).toBeVisible();
      await expect(frame.getByRole('link', { name: 'Service Runbook' })).toBeVisible();
      await expect(frame.getByRole('link', { name: 'Release Note' })).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can paste a Jira browse URL and view remote web links', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toBeVisible();
      await frame
        .getByLabel('Jira issue URL or key')
        .fill('https://example.atlassian.net/browse/OPS-123?focusedCommentId=12');
      await clickWithFallback(frame.getByRole('button', { name: 'Fetch' }));

      await expect(frame.getByRole('status')).toContainText('3 web links found.');
      await expect(frame.getByRole('link', { name: 'Service Runbook' })).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User receives a neutral validation message for unsupported input', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
      await frame.getByLabel('Jira issue URL or key').fill('not a jira issue');
      await clickWithFallback(frame.getByRole('button', { name: 'Fetch' }));

      await expect(frame.getByRole('status')).toContainText(
        'Enter a Jira issue key or browse URL.'
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can connect and disconnect Jira without exposing tokens', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await expect(frame.getByText('Jira is not connected', { exact: true })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Fetch' })).toBeDisabled();
      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));

      await expect(frame.getByRole('status')).toContainText('Connected to Example Jira.');
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Fetch' })).toBeEnabled();

      await clickWithFallback(frame.getByRole('button', { name: 'Disconnect' }));

      await expect(frame.getByText('Jira is not connected', { exact: true })).toBeVisible();
      await expect(frame.getByRole('status')).toContainText('Jira disconnected.');
      await expect(frame.getByRole('button', { name: 'Connect Jira' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Fetch' })).toBeDisabled();
      await expect(frame.getByText('sample-access-value')).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can retry Jira connection after a connection error', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await frame.evaluate(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'jiraOps.connectionLoading' },
          })
        );
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'jiraOps.linksError',
              message: 'Jira connection could not be completed.',
            },
          })
        );
      });

      await expect(frame.getByText('Not connected', { exact: true })).toBeVisible();
      await expect(frame.getByRole('status')).toContainText(
        'Jira connection could not be completed.'
      );
      await expect(frame.getByRole('button', { name: 'Connect Jira' })).toBeEnabled();
      await expect(frame.getByRole('button', { name: 'Fetch' })).toBeDisabled();

      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
      await expect(frame.getByRole('status')).toContainText('Connected to Example Jira.');
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});
