import {
  test,
  expect,
  type Frame,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

import {
  cleanupExtensionHost,
  clickWithFallback,
  closeActiveEditor,
  launchExtensionHost,
  openJiraOpsView,
  openSettingsFromViewTitle,
  resolveIssueDetailFrame,
  resolveLoadedIssueDetailFrame,
  resolveWhatsNewFrame,
} from './support/jiraOpsHarness';

test.describe('Jira Ops assigned ticket workflow', () => {
  test('User can review JiraOps release notes after an extension update', async () => {
    const session = await launchExtensionHost({
      env: {
        JIRA_OPS_FORCE_WHATS_NEW: '1',
        JIRA_OPS_SUPPRESS_WHATS_NEW: '0',
      },
    });

    try {
      await openJiraOpsView(session.window);
      const whatsNewFrame = await resolveWhatsNewFrame(session.window);
      await expect(
        whatsNewFrame.getByRole('heading', { name: 'What Is New' })
      ).toBeVisible();
      await expect(whatsNewFrame.getByLabel('Release highlights')).toContainText(
        'assigned issue'
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can view a compact assigned ticket dashboard without duplicate settings controls', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openJiraOpsView(session.window);

      await expectHomeShell(frame);
      await expect(frame.getByRole('button', { name: 'Open Settings' })).toHaveCount(0);
      await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));

      await expectLoadedDashboard(frame);
      await expect(frame.getByRole('status')).toHaveCount(0);
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
      await expect(frame.getByText('Jira Cloud')).toHaveCount(0);
      await expect(frame.getByText('Tickets and merge requests')).toHaveCount(0);
      await expect(frame.getByText(/assigned tickets loaded/u)).toHaveCount(0);
      await expect(frame.getByText('Payment incident runbook')).toHaveCount(0);

      await expect(frame.getByText('GitLab merge requests')).toHaveCount(0);
      await expect(frame.getByText('Clean stale inventory reservations')).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can keep long ticket titles and metadata within the sidebar width', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      const issue = frame.getByLabel('OPS-900 assigned ticket');

      await expect(issue.getByText(/^demo[A-Z]+\.\.\.$/u)).toBeVisible();
      await expectNoIssueOverflow(issue);
      await expectMetadataHidesAsCardNarrows(issue);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can use the assigned ticket dashboard without an internal connection banner', async () => {
    const session = await launchExtensionHost();
    const testInfo = test.info();

    try {
      const frame = await openLoadedDashboard(session.window);

      await captureDashboardScreenshot(session.window, testInfo, 'dashboard-density.png');
      await expect(session.window.getByText(/JiraOps:\s*Connected/i).first()).toBeVisible();
      await expect(frame.getByText('Connected', { exact: true })).toHaveCount(0);
      await expectCompactDashboardGeometry(frame);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can read issue content and clone merge requests in details', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);

      await clickWithFallback(
        frame.getByLabel('OPS-123 assigned ticket').getByRole('button', {
          name: 'Details',
        })
      );

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      const issueContent = detailFrame.getByLabel('Issue content');
      await expect(issueContent).toContainText(
        'Reconciliation alerts fire too late'
      );
      await expect(
        issueContent.getByRole('heading', { name: 'Alert behavior' })
      ).toBeVisible();
      await expect(
        issueContent.getByRole('listitem').filter({
          hasText: 'Tighten the delayed settlement threshold.',
        })
      ).toBeVisible();
      await expect(
        issueContent.getByRole('link', { name: 'payment incident runbook' })
      ).toBeVisible();
      await expect(detailFrame.getByText('Current User')).toBeVisible();
      await expect(
        detailFrame.getByRole('img', { name: 'reconciliation-alert-preview.png' })
      ).toBeVisible();
      await expect(
        detailFrame.getByLabel('GitLab merge requests').getByRole('link', {
          name: /Handle delayed payment settlements/u,
        })
      ).toBeVisible();
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByRole('link', {
          name: /Backport alert window tuning/u,
        })
      ).toBeVisible();
      await expect(detailFrame.getByText('https://')).toHaveCount(0);
      await expect(detailFrame.getByText('In Progress', { exact: true })).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can see issue details open with a centered loading state', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);

      await clickWithFallback(
        frame.getByLabel('OPS-123 assigned ticket').getByRole('button', {
          name: 'Details',
        })
      );

      const detailFrame = await resolveIssueDetailFrame(session.window, 'OPS-123');
      const loadingStatus = detailFrame.getByRole('status');
      await expect(loadingStatus).toContainText('OPS-123');
      await expectLoadingCentered(loadingStatus);
      await expect(detailFrame.getByLabel('Issue content')).toHaveCount(0);
      const loadedFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      await expect(loadedFrame.getByLabel('Issue content')).toContainText(
        'Reconciliation alerts fire too late'
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can reopen recently loaded issue details without a loading state', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      const detailsButton = frame
        .getByLabel('OPS-123 assigned ticket')
        .getByRole('button', { name: 'Details' });

      await clickWithFallback(detailsButton);
      await expect(
        (await resolveLoadedIssueDetailFrame(session.window, 'OPS-123')).getByLabel(
          'Issue content'
        )
      ).toBeVisible();
      await closeActiveEditor(session.window, 'OPS-123');

      await clickWithFallback(detailsButton);
      const reopenedFrame = await resolveIssueDetailFrame(session.window, 'OPS-123');
      await expect(reopenedFrame.getByLabel('Issue content')).toBeVisible({
        timeout: 700,
      });
      await expect(reopenedFrame.getByRole('status')).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can review an assigned issue that has clone-only merge requests', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      const issue = frame.getByLabel('OPS-321 assigned ticket');

      await expect(issue.getByText('GitLab merge requests')).toHaveCount(0);
      await expect(issue.getByText('Clean stale inventory reservations')).toHaveCount(0);
      await clickWithFallback(issue.getByRole('button', { name: 'Details' }));

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-321');
      await expect(detailFrame.getByLabel('GitLab merge requests')).toContainText(
        'No GitLab merge requests were found for this issue.'
      );
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByRole('link', {
          name: /Clean stale inventory reservations/u,
        })
      ).toBeVisible();
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByRole('link', {
          name: /Add reservation cleanup observability/u,
        })
      ).toBeVisible();
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByRole('link')
      ).toHaveCount(2);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can manage Jira connection from Settings', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);

      await expect(frame.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
      await openSettingsFromViewTitle(session.window);
      await expect(frame.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Disconnect' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
      await expect(frame.getByText('sample-access-value')).toHaveCount(0);
      await expect(frame.getByRole('spinbutton', { name: 'Poll interval' })).toHaveValue(
        '1'
      );
      await frame.getByRole('spinbutton', { name: 'Poll interval' }).fill('5');
      await clickWithFallback(frame.getByRole('button', { name: 'Save Polling' }));
      await expect(frame.getByRole('status')).toContainText(
        'Notification polling settings saved.'
      );

      await clickWithFallback(frame.getByRole('button', { name: 'Disconnect' }));

      await expect(frame.getByText('Jira disconnected.')).toBeVisible();
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

      await expect(frame.getByLabel('OPS-123 assigned ticket')).toBeVisible();
      await expect(frame.getByRole('status')).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can see assigned issue updates in notifications', async () => {
    const session = await launchExtensionHost({
      env: {
        JIRA_OPS_NOTIFICATION_POLL_INTERVAL_MS: '500',
        JIRA_OPS_TEST_MODE_NOTIFICATION_UPDATE: '1',
      },
    });

    try {
      const frame = await openLoadedDashboard(session.window);
      const notificationButton = frame.getByRole('button', {
        name: /Open notifications, 1 unread/u,
      });
      await expect(notificationButton).toBeVisible({ timeout: 8_000 });
      await clickWithFallback(notificationButton);

      await expect(frame.getByRole('heading', { name: 'Notifications' })).toBeVisible();
      await expect(frame.getByText('OPS-123 was updated')).toBeVisible();
      await clickWithFallback(frame.getByRole('button', { name: 'Clear' }));
      await returnToDashboard(frame);
      await expect(frame.getByRole('button', { name: 'Open notifications' })).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });
});

async function openLoadedDashboard(window: Page): Promise<Frame> {
  const frame = await openJiraOpsView(window);
  await expectHomeShell(frame);
  await clickWithFallback(frame.getByRole('button', { name: 'Connect Jira' }));
  await expectLoadedDashboard(frame);
  return frame;
}

async function expectHomeShell(frame: Frame): Promise<void> {
  await expect(frame.getByLabel('JiraOps workspace')).toBeVisible();
  await expect(frame.getByLabel('Assigned Jira tickets')).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Refresh' })).toBeVisible();
}

async function expectLoadedDashboard(frame: Frame): Promise<void> {
  await expect(frame.getByText('5 tickets', { exact: true })).toBeVisible();
  await expect(frame.getByText('GitLab merge requests')).toHaveCount(0);
  await expect(frame.getByLabel('OPS-123 assigned ticket')).toBeVisible();
  await expect(frame.getByLabel('OPS-900 assigned ticket')).toBeVisible();
}

async function returnToDashboard(frame: Frame): Promise<void> {
  await clickWithFallback(frame.getByRole('button', { name: 'Back to dashboard' }));
  await expect(frame.getByLabel('Assigned Jira tickets')).toBeVisible();
}

async function expectNoIssueOverflow(issue: Locator): Promise<void> {
  const overflowing = await issue.evaluate((node) => {
    return [node, ...node.querySelectorAll('*')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => {
        const text = element.textContent.trim();
        if (text.length > 0) {
          return text;
        }

        const classAttribute = element.getAttribute('class');
        return classAttribute !== null && classAttribute.length > 0
          ? classAttribute
          : element.tagName;
      });
  });

  expect(overflowing).toEqual([]);
}

async function expectMetadataHidesAsCardNarrows(issue: Locator): Promise<void> {
  const displayState = await issue.evaluate(async (node) => {
    const previousBodyStyle = document.body.getAttribute('style') ?? '';
    document.body.style.width = '200px';
    document.body.style.maxWidth = '200px';
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
    });
    const cardWidth = node.getBoundingClientRect().width;
    const updatedAt180 = window.getComputedStyle(
      node.querySelector('.issue-meta-updated') ?? node
    ).display;
    const priorityAt180 = window.getComputedStyle(
      node.querySelector('.issue-meta-priority') ?? node
    ).display;
    if (previousBodyStyle.length === 0) {
      document.body.removeAttribute('style');
    } else {
      document.body.setAttribute('style', previousBodyStyle);
    }

    return {
      priorityAt180,
      updatedAt180,
      cardWidth,
    };
  });
  expect(displayState.cardWidth).toBeLessThanOrEqual(260);
  expect({
    priorityAt180: displayState.priorityAt180,
    updatedAt180: displayState.updatedAt180,
  }).toEqual({
    priorityAt180: 'none',
    updatedAt180: 'none',
  });
}

async function expectLoadingCentered(status: Locator): Promise<void> {
  const centered = await status.evaluate((node) => {
    const bodyBox = document.body.getBoundingClientRect();
    const statusBox = node.getBoundingClientRect();
    return {
      x: Math.abs(statusBox.left + statusBox.width / 2 - bodyBox.width / 2) < 8,
      y: Math.abs(statusBox.top + statusBox.height / 2 - bodyBox.height / 2) < 24,
    };
  });

  expect(centered).toEqual({ x: true, y: true });
}

async function captureDashboardScreenshot(
  window: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  const screenshotPath = testInfo.outputPath(name);
  await window.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
}

async function expectCompactDashboardGeometry(frame: Frame): Promise<void> {
  const workspaceBox = await resolveBoundingBox(frame.getByLabel('JiraOps workspace'));
  const toolbarBox = await resolveBoundingBox(frame.getByLabel('Assigned ticket actions'));
  const issuesBox = await resolveBoundingBox(frame.getByLabel('Assigned Jira tickets'));
  const firstIssueBox = await resolveBoundingBox(frame.getByLabel('OPS-123 assigned ticket'));

  expect(toolbarBox.y - workspaceBox.y).toBeLessThanOrEqual(4);
  expect(issuesBox.x - workspaceBox.x).toBeLessThanOrEqual(0);
  expect(firstIssueBox.x - workspaceBox.x).toBeLessThanOrEqual(4);
  expect(workspaceBox.x + workspaceBox.width - (firstIssueBox.x + firstIssueBox.width)).toBeLessThanOrEqual(4);

  const bodyHorizontalPadding = await frame.evaluate(() => {
    const styles = window.getComputedStyle(document.body);
    return {
      paddingLeft: styles.paddingLeft,
      paddingRight: styles.paddingRight,
    };
  });
  expect(bodyHorizontalPadding).toEqual({
    paddingLeft: '0px',
    paddingRight: '0px',
  });
}

async function resolveBoundingBox(locator: Locator): Promise<NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error('Expected visible element to have a bounding box.');
  }
  return box;
}
