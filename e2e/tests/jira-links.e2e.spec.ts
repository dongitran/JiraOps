import { test, expect, type Frame, type Page } from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  launchExtensionHost,
  openJiraOpsView,
  resolveIssueDetailFrame,
} from './support/jiraOpsHarness';

test.describe('Jira Ops assigned ticket workflow', () => {
  test('User can view assigned Jira issues with merge requests first', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await expectHomeShell(frame);
      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));

      await expect(frame.getByRole('status')).toContainText(
        '3 assigned tickets loaded with 3 GitLab merge requests.'
      );
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);

      const firstIssue = frame.getByLabel('OPS-123 assigned ticket');
      await expect(firstIssue).toBeVisible();
      await expect(
        firstIssue.getByRole('link', { name: /Handle delayed payment settlements/u })
      ).toBeVisible();
      await expect(
        firstIssue.getByRole('link', { name: /Tighten reconciliation alert thresholds/u })
      ).toBeVisible();

      await expect(frame.getByText('Payment incident runbook')).toHaveCount(0);
      await expect(frame.getByText('No merge requests', { exact: true })).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can open issue details in a wide editor tab', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);

      await clickWithFallback(
        frame.getByLabel('OPS-123 assigned ticket').getByRole('button', {
          name: 'Details',
        })
      );

      const detailFrame = await resolveIssueDetailFrame(session.window, 'OPS-123');
      await expect(detailFrame.getByText('OPS-123', { exact: true })).toBeVisible();
      await expect(
        detailFrame.getByRole('heading', {
          name: 'Stabilize payment reconciliation alerts',
        })
      ).toBeVisible();
      const mergeRequestSection = detailFrame.getByLabel('GitLab merge requests');
      await expect(
        mergeRequestSection.getByRole('link', {
          name: /Handle delayed payment settlements/u,
        })
      ).toBeVisible();
      await expect(
        detailFrame.getByRole('link', { name: /Payment incident runbook/u })
      ).toBeVisible();
      await expect(
        detailFrame.getByRole('link', { name: /Alert tuning design note/u })
      ).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can review an assigned issue that has no merge requests', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      const issue = frame.getByLabel('OPS-789 assigned ticket');

      await issue.scrollIntoViewIfNeeded();
      await expect(issue.getByText('No merge requests', { exact: true })).toBeVisible();
      await expect(frame.getByRole('link', { name: /Webhook retry policy/u })).toHaveCount(0);
      await clickWithFallback(issue.getByRole('button', { name: 'Details' }));

      const detailFrame = await resolveIssueDetailFrame(session.window, 'OPS-789');
      await expect(detailFrame.getByText('No GitLab merge requests')).toBeVisible();
      await expect(
        detailFrame.getByRole('link', { name: /Webhook retry policy/u })
      ).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can manage Jira connection from Settings', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);

      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
      await openSettings(frame);
      await expect(frame.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
      await expect(frame.getByText('sample-access-value')).toHaveCount(0);

      await clickWithFallback(frame.getByRole('button', { name: 'Disconnect' }));

      await expect(frame.getByText('Jira is not connected', { exact: true })).toBeVisible();
      await expect(frame.getByRole('status')).toContainText('Jira disconnected.');
      await expect(frame.getByRole('button', { name: 'Connect Jira' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
      await expect(frame.getByText('sample-access-value')).toHaveCount(0);

      await returnToDashboard(frame);
      await expect(frame.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      await expect(frame.getByText('Connect Jira first', { exact: true })).toBeVisible();
      await expect(frame.getByLabel('OPS-123 assigned ticket')).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can retry assigned ticket loading after an error', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);

      await frame.evaluate(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'jiraOps.dashboardLoading' },
          })
        );
        window.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'jiraOps.dashboardError',
              message: 'Assigned tickets could not be loaded.',
            },
          })
        );
      });

      await expect(frame.getByRole('status')).toContainText(
        'Assigned tickets could not be loaded.'
      );
      await expect(frame.getByLabel('OPS-123 assigned ticket')).toHaveCount(0);
      await clickWithFallback(frame.getByRole('button', { name: 'Refresh' }));

      await expect(frame.getByRole('status')).toContainText(
        '3 assigned tickets loaded with 3 GitLab merge requests.'
      );
      await expect(frame.getByLabel('OPS-123 assigned ticket')).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});

async function openLoadedDashboard(window: Page): Promise<Frame> {
  const frame = await openJiraOpsView(window);
  await expectHomeShell(frame);
  await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
  await expect(frame.getByRole('status')).toContainText(
    '3 assigned tickets loaded with 3 GitLab merge requests.'
  );
  return frame;
}

async function expectHomeShell(frame: Frame): Promise<void> {
  await expect(frame.getByRole('heading', { name: 'Jira Ops' })).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Open Settings' })).toBeVisible();
  await expect(frame.getByLabel('Assigned Jira tickets')).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Refresh' })).toBeVisible();
}

async function openSettings(frame: Frame): Promise<void> {
  await clickWithFallback(frame.getByRole('button', { name: 'Open Settings' }));
  await expect(frame.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function returnToDashboard(frame: Frame): Promise<void> {
  await clickWithFallback(frame.getByRole('button', { name: 'Back to dashboard' }));
  await expect(frame.getByLabel('Assigned Jira tickets')).toBeVisible();
}
