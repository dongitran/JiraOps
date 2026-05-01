import { test, expect, type Frame } from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openJiraOpsView,
} from './support/jiraOpsHarness';

test.describe('Jira Ops links workflow', () => {
  test('User can view remote web links for a Jira issue key', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await expectHomeShell(frame);
      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
      await expect(frame.getByRole('status')).toContainText('Connected to Example Jira.');
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
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
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
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

  test('User can open settings from the header and return to links', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await expectHomeShell(frame);
      await openSettings(frame);

      await expect(frame.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Back to links' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Connect Jira' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Fetch' })).toHaveCount(0);
      await expect(frame.getByLabel('Jira issue URL or key')).toHaveCount(0);
      await expect(frame.getByRole('status')).toContainText(
        'Connect Jira to fetch remote web links.'
      );

      await returnToLinks(frame);
      await expectHomeShell(frame);
      await expect(frame.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
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
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
      await expect(frame.getByRole('button', { name: 'Fetch' })).toBeEnabled();
      await frame.getByLabel('Jira issue URL or key').fill('OPS-123');
      await clickWithFallback(frame.getByRole('button', { name: 'Fetch' }));
      await expect(frame.getByRole('link', { name: 'Design Review' })).toBeVisible();

      await openSettings(frame);
      await clickWithFallback(frame.getByRole('button', { name: 'Disconnect' }));

      await expect(frame.getByText('Jira is not connected', { exact: true })).toBeVisible();
      await expect(frame.getByRole('status')).toContainText('Jira disconnected.');
      await expect(frame.getByRole('button', { name: 'Connect Jira' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
      await expect(frame.getByText('sample-access-value')).toHaveCount(0);

      await returnToLinks(frame);
      await expect(frame.getByRole('button', { name: 'Fetch' })).toBeDisabled();
      await expect(frame.getByRole('link', { name: 'Design Review' })).toHaveCount(0);
      await expect(frame.getByText('No web links', { exact: true })).toBeVisible();
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
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);

      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
      await expect(frame.getByRole('status')).toContainText('Connected to Example Jira.');
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});

async function expectHomeShell(frame: Frame): Promise<void> {
  await expect(frame.getByRole('heading', { name: 'Jira Ops' })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Open Settings' })).toBeVisible();
  await expect(frame.getByLabel('Jira issue URL or key')).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Fetch' })).toBeVisible();
}

async function openSettings(frame: Frame): Promise<void> {
  await clickWithFallback(frame.getByRole('button', { name: 'Open Settings' }));
  await expect(frame.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function returnToLinks(frame: Frame): Promise<void> {
  await clickWithFallback(frame.getByRole('button', { name: 'Back to links' }));
  await expect(frame.getByLabel('Jira issue URL or key')).toBeVisible();
}
