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

type LocatorBoundingBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

interface DashboardDetailButtonState {
  readonly buttonWidth: number;
  readonly cardWidth: number;
  readonly headerHeight: number;
  readonly hoverMedia: boolean;
  readonly opacity: number;
  readonly pointerEvents: string;
}

test.describe('Jira Ops assigned ticket workflow', () => {
  test('User can review JiraOps 0.1.45 release notes', async () => {
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
      await expect(whatsNewFrame.getByText('JiraOps 0.1.45 Release')).toBeVisible();
      await expect(whatsNewFrame.getByLabel('Release highlights')).toContainText(
        'notification toast copy'
      );
      await expect(whatsNewFrame.getByText('0.1.43')).toHaveCount(0);
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
      await expect(frame.getByText('Assigned to me (5)')).toBeVisible();
      await expect(frame.getByText('5 tickets', { exact: true })).toHaveCount(0);
      await expect(frame.locator('.status-line')).toHaveCount(0);
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

  test('User can see total logged work on assigned ticket cards and details', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      await expectIssueCardWorklog(frame);

      await openIssueDetailFromCard(frame.getByLabel('OPS-123 assigned ticket'));
      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      await expect(
        detailFrame.getByLabel('OPS-123 details').getByText('3h 30m logged')
      ).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User sees the daily Work logged panel at about 35% height with a scrollable issue list', async () => {
    const session = await launchExtensionHost();
    const testInfo = test.info();

    try {
      const frame = await openLoadedDashboard(session.window);
      await captureDashboardScreenshot(session.window, testInfo, 'daily-worklog-panel.png');
      await expectDailyWorklogPanelLayout(frame);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can reveal dashboard Details controls on ticket hover', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      await expectDashboardDetailButtonHoverReveal(frame);
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

  test('User can read Jira tables and details without redundant section titles', async () => {
    const session = await launchExtensionHost();
    const testInfo = test.info();

    try {
      await session.window.setViewportSize({ width: 1600, height: 900 });
      const frame = await openLoadedDashboard(session.window);

      await openIssueDetailFromCard(frame.getByLabel('OPS-123 assigned ticket'));

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      const issueContent = detailFrame.getByLabel('Description and comments');
      await expect(issueContent).toContainText(
        'Reconciliation alerts fire too late'
      );
      await expect(detailFrame.getByText('Issue content')).toHaveCount(0);
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
      await expect(issueContent.getByRole('table')).toBeVisible();
      await expect(issueContent.getByRole('columnheader', { name: 'Signal' })).toBeVisible();
      await expect(issueContent.getByRole('cell', { name: '8 minutes' })).toBeVisible();
      await expectTableBordersAreVisible(issueContent.getByRole('table'));
      await expectIssueContentInlineImages(issueContent);
      await expect(issueContent.getByText('Current User', { exact: true })).toBeVisible();
      await expect(
        detailFrame.getByLabel('Activity').getByText('Current User moved the ticket')
      ).toBeVisible();
      await expect(detailFrame.getByLabel('Attachments').getByRole('img')).toHaveCount(0);
      await expect(detailFrame.getByLabel('Attachments')).toContainText(
        'reconciliation-alert-preview.png'
      );
      await expect(detailFrame.getByLabel('Attachments')).toContainText(
        'application/octet-stream'
      );
      await expect(
        detailFrame.getByLabel('GitLab merge requests').getByRole('link', {
          name: /Handle delayed payment settlements/u,
        })
      ).toBeVisible();
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByRole('link', {
          name: /Merge request - TOR-45/u,
        })
      ).toBeVisible();
      await expect(detailFrame.getByText(/Clone ticket OPS-111/u)).toBeVisible();
      await expect(detailFrame.getByText('https://')).toHaveCount(0);
      await expectDetailLinksUseWebviewOpenPath(detailFrame);
      await expect(detailFrame.getByRole('combobox', { name: 'Issue status' })).toHaveValue('');
      await expect(
        detailFrame.getByRole('combobox', { name: 'Issue status' }).getByRole('option').first()
      ).toHaveText('In Progress');
      await expectCompactDetailHeaderActions(detailFrame);
      await expectLongDetailTitleDoesNotOverlapStatus(detailFrame);
      await expectTechnicalNotesNearAttachments(detailFrame);
      await expectNoVisibleDetailMessages(detailFrame);
      await captureDashboardScreenshot(
        session.window,
        testInfo,
        'issue-detail-activity-order.png'
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can enlarge inline Jira images from issue details', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      await openIssueDetailFromCard(frame.getByLabel('OPS-123 assigned ticket'));

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      await expectImageLightbox(detailFrame);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can change status and log work from issue details', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      await openIssueDetailFromCard(frame.getByLabel('OPS-123 assigned ticket'));

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      await expect(detailFrame.getByLabel('Issue actions')).toBeVisible();
      await expectCompactDetailHeaderActions(detailFrame);
      await expect(detailFrame.getByRole('button', { name: 'Change Status' })).toHaveCount(0);
      await expect(detailFrame.getByRole('combobox', { name: 'Next status' })).toHaveCount(0);
      await detailFrame.getByRole('combobox', { name: 'Issue status' }).selectOption('31');
      await expect(
        detailFrame.getByRole('status').filter({ hasText: 'Status changed to Code Review.' })
      ).toBeVisible();
      await expect(detailFrame.getByRole('combobox', { name: 'Issue status' })).toHaveValue('');
      await expect(
        detailFrame.getByRole('combobox', { name: 'Issue status' }).getByRole('option').first()
      ).toHaveText('Code Review');
      await expectStatusOptions(detailFrame, [
        { text: 'Code Review', value: '' },
        { text: 'Done', value: '41' },
      ]);
      await expect(detailFrame.getByRole('combobox', { name: 'Issue status' })).toBeEnabled();
      await detailFrame.getByRole('combobox', { name: 'Issue status' }).selectOption('41');
      await expect(detailFrame.getByText('Status changed to Done.')).toBeVisible();
      await expectStatusOptions(detailFrame, [{ text: 'Done', value: '' }]);
      await expect(detailFrame.getByRole('combobox', { name: 'Issue status' })).toBeDisabled();

      const logWorkDialog = detailFrame.getByRole('dialog', { name: 'Log Work' });
      await expect(logWorkDialog).toBeHidden();
      await clickWithFallback(detailFrame.getByRole('button', { name: 'Log Work' }));
      await expect(logWorkDialog).toBeVisible();
      await logWorkDialog.getByRole('spinbutton', { name: 'Minutes' }).fill('45');
      await logWorkDialog.getByRole('textbox', { name: 'Note' }).fill('Reviewed retry budget.');
      await clickWithFallback(
        logWorkDialog.getByRole('button', { name: 'Log Work', exact: true })
      );
      await expect(logWorkDialog).toBeHidden();
      await expect(
        detailFrame.getByRole('status').filter({ hasText: 'Logged 45 minutes.' })
      ).toBeVisible();
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can open issue details in a narrow editor with status controls on the issue key row', async () => {
    const session = await launchExtensionHost();

    try {
      await session.window.setViewportSize({ width: 1200, height: 827 });
      const frame = await openLoadedDashboard(session.window);

      await openIssueDetailFromCard(frame.getByLabel('OPS-123 assigned ticket'));

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      await expectNarrowDetailHeaderActionsOnIssueKeyRow(detailFrame);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can see issue details open with a centered loading state', async () => {
    const session = await launchExtensionHost({
      env: {
        JIRA_OPS_DETAIL_TEST_DELAY_MS: '3000',
      },
    });

    try {
      const frame = await openLoadedDashboard(session.window);

      await openIssueDetailFromCard(frame.getByLabel('OPS-123 assigned ticket'));

      const detailFrame = await resolveIssueDetailFrame(session.window, 'OPS-123');
      const loadingStatus = detailFrame.getByRole('status');
      await expect(loadingStatus).toContainText('OPS-123');
      await expectLoadingCentered(loadingStatus);
      await expect(detailFrame.getByLabel('Description and comments')).toHaveCount(0);
      const loadedFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      await expect(loadedFrame.getByLabel('Description and comments')).toContainText(
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
      const issueCard = frame.getByLabel('OPS-123 assigned ticket');

      await openIssueDetailFromCard(issueCard);
      await expect(
        (await resolveLoadedIssueDetailFrame(session.window, 'OPS-123')).getByLabel(
          'Description and comments'
        )
      ).toBeVisible();
      await closeActiveEditor(session.window, 'OPS-123');

      await openIssueDetailFromCard(issueCard);
      const reopenedFrame = await resolveIssueDetailFrame(session.window, 'OPS-123');
      await expect(reopenedFrame.getByLabel('Description and comments')).toBeVisible({
        timeout: 700,
      });
      await expect(
        reopenedFrame.getByRole('status', { name: 'OPS-123 details' })
      ).toHaveCount(0);
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
      await openIssueDetailFromCard(issue);

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-321');
      await expect(detailFrame.getByLabel('GitLab merge requests')).toHaveCount(0);
      await expect(
        detailFrame.getByText('No GitLab merge requests were found for this issue.')
      ).toHaveCount(0);
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByRole('link', {
          name: /Clean stale inventory reservations/u,
        })
      ).toBeVisible();
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByText(/Clone ticket OPS-333/u)
      ).toHaveCount(2);
      await expect(
        detailFrame.getByLabel('Clone merge requests').getByText(/Clone ticket OPS-222/u)
      ).toHaveCount(0);
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

  test('User can review issue details without empty related link sections', async () => {
    const session = await launchExtensionHost();

    try {
      const frame = await openLoadedDashboard(session.window);
      await openIssueDetailFromCard(frame.getByLabel('OPS-900 assigned ticket'));

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-900');
      await expect(detailFrame.getByLabel('Description and comments')).toContainText(
        'No description was provided for this test issue.'
      );
      await expect(detailFrame.getByLabel('GitLab merge requests')).toHaveCount(0);
      await expect(detailFrame.getByLabel('Clone merge requests')).toHaveCount(0);
      await expect(detailFrame.getByLabel('All Jira web links')).toHaveCount(0);
      await expect(
        detailFrame.getByText('No GitLab merge requests were found for this issue.')
      ).toHaveCount(0);
      await expect(
        detailFrame.getByText('No GitLab merge requests were found on cloned Jira work items.')
      ).toHaveCount(0);
      await expect(
        detailFrame.getByText('No Jira remote web links were found for this issue.')
      ).toHaveCount(0);
      await expect(detailFrame.getByLabel('Attachments')).toContainText(
        'No attachments were found for this issue.'
      );
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can clone a clone-linked merge request from issue details', async () => {
    const session = await launchExtensionHost({
      env: {
        JIRA_OPS_TEST_GITPORT_CLONE_DELAY_MS: '700',
      },
    });

    try {
      const frame = await openLoadedDashboard(session.window);
      await openIssueDetailFromCard(frame.getByLabel('OPS-123 assigned ticket'));

      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      const cloneCard = detailFrame.getByLabel('Merge request - TOR-45 clone merge request');
      const cloneButton = cloneCard.getByRole('button', {
        name: 'Clone Merge request - TOR-45',
      });
      await expectCloneButtonHoverReveal(cloneCard, cloneButton);
      await clickWithFallback(cloneButton);

      const cloneDialog = detailFrame.getByRole('dialog', {
        name: 'Clone merge request',
      });
      await expect(cloneDialog).toBeVisible();
      await expect(cloneDialog.getByText('Merge request - TOR-45')).toBeVisible();
      await expect(
        cloneDialog.getByRole('textbox', { name: 'Destination group' })
      ).toHaveValue('');
      await expect(cloneDialog.getByRole('combobox', { name: 'Base branch' })).toHaveValue(
        'staging'
      );
      await expect(cloneDialog.getByRole('textbox', { name: 'Port branch' })).toHaveValue(
        'cherry-pick/OPS-123'
      );
      await expect(cloneDialog.getByRole('textbox', { name: 'Title' })).toHaveValue(
        '[Clone] TOR-45 OPS-123'
      );

      await cloneDialog.getByRole('textbox', { name: 'Destination group' }).fill('group-b');
      await clickWithFallback(cloneDialog.getByRole('button', { name: 'Clone MR' }));
      await expect(cloneDialog).toBeHidden();
      await expect(cloneButton).toBeDisabled();
      await expect(cloneCard.getByRole('status')).toContainText(
        'Cloning merge request...'
      );

      const clonedLink = cloneCard.getByRole('link', {
        name: 'Cloned merge request !777.',
      });
      await expect(clonedLink).toBeVisible();
      await expect(clonedLink).toHaveAttribute(
        'href',
        'https://gitlab.dongtran.com/group-b/folder/main/repository-1/-/merge_requests/777'
      );
      await expect(cloneButton).toHaveText('Cloned');
      await expect(cloneCard.getByText('Merge request could not be cloned.')).toHaveCount(0);
      await expect(cloneDialog.getByText('Complete every clone field.')).toHaveCount(0);
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
      await expectSettingsDisconnectInset(frame);
      await expect(frame.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
      await expect(frame.getByText('sample-access-value')).toHaveCount(0);
      await expect(frame.getByRole('spinbutton', { name: 'Poll interval' })).toHaveValue(
        '1'
      );
      await frame.getByRole('spinbutton', { name: 'Poll interval' }).fill('5');
      await expect(frame.getByText('Connection', { exact: true })).toBeVisible();
      await expect(frame.getByText('Connected', { exact: true })).toBeVisible();
      await expect(frame.getByText('Minutes, 1 to 60')).toBeVisible();
      await clickWithFallback(frame.getByRole('button', { name: 'Save Settings' }));
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

      await expect(frame.locator('.status-line')).toContainText(
        'Assigned tickets could not be loaded.'
      );
      await expect(frame.getByLabel('OPS-123 assigned ticket')).toHaveCount(0);
      await clickWithFallback(frame.getByRole('button', { name: 'Refresh' }));

      await expect(frame.getByLabel('OPS-123 assigned ticket')).toBeVisible();
      await expect(frame.locator('.status-line')).toHaveCount(0);
    } finally {
      await cleanupExtensionHost(session);
    }
  });

  test('User can load saved notifications when opening Notifications', async () => {
    const session = await launchExtensionHost({
      env: {
        JIRA_OPS_NOTIFICATION_POLL_INTERVAL_MS: '60000',
        JIRA_OPS_TEST_NOTIFICATION_RELOAD_DELAY_MS: '700',
        JIRA_OPS_TEST_MODE_NOTIFICATION_UPDATE: '1',
      },
    });

    try {
      const frame = await openLoadedDashboard(session.window);
      const notificationButton = frame.getByRole('button', {
        name: 'Open notifications',
      });
      await expect(notificationButton).toBeVisible();
      await clickWithFallback(notificationButton);

      await expect(frame.getByRole('heading', { name: 'Notifications' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Reload notifications' })).toBeVisible();
      await expectReloadButtonAtHeaderEdge(frame);
      await expect(frame.getByText('Checked assigned issue updates just now.')).toHaveCount(0);
      await expect(frame.getByText('OPS-456 Issue assigned issue activity')).toBeVisible();
      await expect(frame.getByText('Review checkout service release readiness')).toBeVisible();
      await expectNotificationReadState(frame, 'OPS-456 Issue assigned issue activity', false);
      await expect(frame.getByText('Current User updated Bug OPS-123')).toBeVisible({ timeout: 8_000 });
      await expect(frame.getByText('Logged work · Stabilize payment reconciliation alerts')).toBeVisible();
      await expectClearButtonUsesCompactWidth(frame);
      await clickWithFallback(frame.getByRole('button', { name: 'Clear' }));
      await expect(frame.getByText('0 unread')).toBeVisible();
      await expect(frame.getByText('Current User updated Bug OPS-123')).toBeVisible();
      await expectNotificationReadState(frame, 'Current User updated Bug OPS-123', false);
      await clickWithFallback(frame.getByRole('button', { name: 'Reload notifications' }));
      await expect(frame.getByRole('button', { name: 'Reloading notifications' })).toBeDisabled();
      await expect(frame.getByRole('status')).toContainText('Reloading latest Jira activity');
      await expect(frame.getByText('Current User updated Bug OPS-123')).toBeVisible();
      await expect(frame.getByText('OPS-456 Issue assigned issue activity')).toHaveCount(0);
      await expect(frame.getByText('Release Manager commented on Bug OPS-123')).toBeVisible({
        timeout: 8_000,
      });
      await expect(frame.getByText('Commented · Stabilize payment reconciliation alerts')).toBeVisible();
      await expect(frame.getByText('Observer updated Task OPS-777')).toBeVisible();
      await expect(frame.getByText('Current User updated Bug OPS-123')).toBeVisible();
      await expectNotificationReadState(frame, 'Current User updated Bug OPS-123', false);
      await expectNoVisibleAlerts(frame);
      await returnToDashboard(frame);
      await expect(frame.getByRole('button', { name: 'Open notifications' })).toBeVisible();
      await clickWithFallback(frame.getByRole('button', { name: 'Open notifications' }));
      await expect(frame.getByRole('heading', { name: 'Notifications' })).toBeVisible();
      await expect(frame.getByText('0 unread')).toBeVisible();
      await expect(frame.getByText('Release Manager commented on Bug OPS-123')).toBeVisible();
      await expect(frame.getByText('Current User updated Bug OPS-123')).toBeVisible();
      await expectNotificationReadState(frame, 'Current User updated Bug OPS-123', false);
      await expectNotificationDetailButtonAlwaysVisible(
        frame,
        'Current User updated Bug OPS-123'
      );
      await expectNotificationDetailButtonAlwaysVisible(
        frame,
        'Release Manager commented on Bug OPS-123'
      );
      await clickWithFallback(
        frame
          .getByLabel('Release Manager commented on Bug OPS-123')
          .getByRole('button', { name: 'Details' })
      );
      await expect(frame.getByRole('heading', { name: 'Notifications' })).toBeVisible();
      await expect(frame.getByLabel('JiraOps notifications')).toBeVisible();
      await expect(frame.getByLabel('Assigned Jira tickets')).toHaveCount(0);
      const detailFrame = await resolveLoadedIssueDetailFrame(session.window, 'OPS-123');
      await expect(detailFrame.getByLabel('Description and comments')).toContainText(
        'Reconciliation alerts fire too late'
      );
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

async function openIssueDetailFromCard(issueCard: Locator): Promise<void> {
  await expect(issueCard).toBeVisible();
  await issueCard.hover();
  await clickWithFallback(issueCard.getByRole('button', { name: 'Details' }));
}

async function expectHomeShell(frame: Frame): Promise<void> {
  await expect(frame.getByLabel('JiraOps workspace')).toBeVisible();
  await expect(frame.getByLabel('Assigned Jira tickets')).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Refresh' })).toBeVisible();
  const refreshInset = await frame.evaluate(() => {
    const toolbar = document.querySelector('.dashboard-toolbar');
    const refresh = document.querySelector('.refresh-button');
    if (!(toolbar instanceof HTMLElement) || !(refresh instanceof HTMLElement)) {
      return null;
    }

    return {
      marginRight: window.getComputedStyle(refresh).marginRight,
      rightGap: Math.round(toolbar.getBoundingClientRect().right - refresh.getBoundingClientRect().right),
    };
  });
  expect(refreshInset?.marginRight).toBe('3px');
  expect(refreshInset?.rightGap).toBe(5);
}

async function expectLoadedDashboard(frame: Frame): Promise<void> {
  await expect(frame.getByText('Assigned to me (5)', { exact: true })).toBeVisible();
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
    const readAtWidth = async (
      width: number
    ): Promise<{ cardWidth: number; priority: string; updated: string }> => {
      document.body.style.width = `${String(width)}px`;
      document.body.style.maxWidth = `${String(width)}px`;
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
      });
      return {
        cardWidth: node.getBoundingClientRect().width,
        priority: window.getComputedStyle(
          node.querySelector('.issue-meta-priority') ?? node
        ).display,
        updated: window.getComputedStyle(
          node.querySelector('.issue-meta-updated') ?? node
        ).display,
      };
    };
    const medium = await readAtWidth(240);
    const narrow = await readAtWidth(200);
    if (previousBodyStyle.length === 0) {
      document.body.removeAttribute('style');
    } else {
      document.body.setAttribute('style', previousBodyStyle);
    }

    return {
      medium,
      narrow,
    };
  });
  expect(displayState.medium.cardWidth).toBeLessThanOrEqual(260);
  expect(displayState.medium.priority).not.toBe('none');
  expect(displayState.medium.updated).not.toBe('none');
  expect(displayState.narrow.cardWidth).toBeLessThanOrEqual(220);
  expect({
    priority: displayState.narrow.priority,
    updated: displayState.narrow.updated,
  }).toEqual({
    priority: 'none',
    updated: 'none',
  });
}

async function expectDailyWorklogPanelLayout(frame: Frame): Promise<void> {
  const layout = await frame.evaluate(() => {
    const workspace = document.querySelector('.dashboard-workspace');
    const panel = document.querySelector('.daily-worklog-panel');
    const issues = document.querySelector('.issues-region');
    if (
      !(workspace instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(issues instanceof HTMLElement)
    ) {
      return null;
    }

    const workspaceBox = workspace.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const issuesBox = issues.getBoundingClientRect();
    return {
      workspaceHeight: Math.round(workspaceBox.height),
      panelFraction: panelBox.height / workspaceBox.height,
      issuesFraction: issuesBox.height / workspaceBox.height,
      issuesOverflowY: window.getComputedStyle(issues).overflowY,
      issuesStaysAbovePanel: issuesBox.bottom <= panelBox.top + 1,
    };
  });

  if (layout === null) {
    throw new Error('Expected the daily worklog panel layout to be measurable.');
  }

  expect(layout.workspaceHeight).toBeGreaterThan(200);
  expect(layout.panelFraction).toBeGreaterThanOrEqual(0.31);
  expect(layout.panelFraction).toBeLessThanOrEqual(0.39);
  expect(layout.issuesFraction).toBeGreaterThanOrEqual(0.55);
  expect(['auto', 'scroll']).toContain(layout.issuesOverflowY);
  expect(layout.issuesStaysAbovePanel).toBe(true);
}

async function expectIssueCardWorklog(frame: Frame): Promise<void> {
  const worklogText = (key: string): Promise<string[]> => {
    return frame
      .getByLabel(`${key} assigned ticket`)
      .locator('.issue-meta-worklog')
      .allTextContents();
  };

  expect(await worklogText('OPS-123')).toEqual(['3h 30m']);
  expect(await worklogText('OPS-456')).toEqual(['1h']);
  expect(await worklogText('OPS-321')).toEqual(['3d 2h']);
  expect(await worklogText('OPS-900')).toEqual([]);
}

async function expectDashboardDetailButtonHoverReveal(frame: Frame): Promise<void> {
  const issue = frame.getByLabel('OPS-123 assigned ticket');
  const detailButton = issue.getByRole('button', { name: 'Details' });
  await expect(issue).toBeVisible();
  await frame.getByRole('button', { name: 'Refresh' }).hover();

  const before = await readDashboardDetailButtonState(issue);
  if (before.hoverMedia) {
    expect(before.opacity).toBeLessThan(0.05);
    expect(before.pointerEvents).toBe('none');
  } else {
    expect(before.opacity).toBe(1);
    expect(before.pointerEvents).toBe('auto');
  }

  await issue.hover();
  await expect(detailButton).toHaveCSS('opacity', '1');
  const afterHover = await readDashboardDetailButtonState(issue);
  expect(afterHover.pointerEvents).toBe('auto');
  expect(afterHover).toMatchObject({
    buttonWidth: before.buttonWidth,
    cardWidth: before.cardWidth,
    headerHeight: before.headerHeight,
  });

  await frame.getByRole('button', { name: 'Refresh' }).hover();
  if (before.hoverMedia) {
    await expect
      .poll(async () => {
        return (await readDashboardDetailButtonState(issue)).opacity;
      })
      .toBeLessThan(0.05);
  }

  await detailButton.focus();
  await expect(detailButton).toHaveCSS('opacity', '1');
  const afterFocus = await readDashboardDetailButtonState(issue);
  expect(afterFocus.pointerEvents).toBe('auto');
  expect(afterFocus).toMatchObject({
    buttonWidth: before.buttonWidth,
    cardWidth: before.cardWidth,
    headerHeight: before.headerHeight,
  });
}

async function readDashboardDetailButtonState(
  issue: Locator
): Promise<DashboardDetailButtonState> {
  const state = await issue.evaluate((card) => {
    const button = card.querySelector('button');
    const header = card.querySelector('.issue-card-header');
    if (!(button instanceof HTMLElement) || !(header instanceof HTMLElement)) {
      return null;
    }

    const buttonStyle = window.getComputedStyle(button);
    const buttonBox = button.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    return {
      buttonWidth: Math.round(buttonBox.width),
      cardWidth: Math.round(cardBox.width),
      headerHeight: Math.round(headerBox.height),
      hoverMedia: window.matchMedia('(hover: hover)').matches,
      opacity: Number.parseFloat(buttonStyle.opacity),
      pointerEvents: buttonStyle.pointerEvents,
    };
  });

  if (state === null) {
    throw new Error('Expected dashboard detail button state to be measurable.');
  }

  return state;
}

async function expectTableBordersAreVisible(table: Locator): Promise<void> {
  const borders = await table.evaluate((node) => {
    const cell = node.querySelector('td, th');
    return {
      cellBorder: cell === null ? '0px' : window.getComputedStyle(cell).borderTopWidth,
      tableBorder: window.getComputedStyle(node).borderTopWidth,
    };
  });

  expect(borders).toEqual({
    cellBorder: '1px',
    tableBorder: '1px',
  });
}

async function expectStatusOptions(
  frame: Frame,
  expectedOptions: readonly { readonly text: string; readonly value: string }[]
): Promise<void> {
  const select = frame.getByRole('combobox', { name: 'Issue status' });
  await expect(select.getByRole('option')).toHaveText(
    expectedOptions.map((option) => option.text)
  );
  const options = await select.evaluate((node) => {
    if (!(node instanceof HTMLSelectElement)) {
      return [];
    }

    return [...node.options].map((option) => {
      return {
        text: option.text,
        value: option.value,
      };
    });
  });
  expect(options).toEqual(expectedOptions);
}

async function expectCompactDetailHeaderActions(frame: Frame): Promise<void> {
  await expect(frame.getByLabel('Issue actions').getByText('Status', { exact: true })).toHaveCount(0);
  const layout = await frame.evaluate(() => {
    const header = document.querySelector('.detail-page-header');
    const metaRow = document.querySelector('.detail-page-meta-row');
    const actions = document.querySelector('.detail-header-actions');
    const select = document.querySelector('[data-detail-status-select]');
    const button = document.querySelector('[data-detail-action="open-worklog"]');
    const issueKey = document.querySelector('.issue-key');
    const title = document.querySelector('.detail-page-title h1');
    const hiddenLabel = document.querySelector('.detail-status-control .visually-hidden');
    if (
      !(header instanceof HTMLElement) ||
      !(metaRow instanceof HTMLElement) ||
      !(actions instanceof HTMLElement) ||
      !(select instanceof HTMLElement) ||
      !(button instanceof HTMLElement) ||
      !(issueKey instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(hiddenLabel instanceof HTMLElement)
    ) {
      return null;
    }

    const selectBox = select.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const issueKeyBox = issueKey.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    const actionsBox = actions.getBoundingClientRect();
    const hiddenStyle = window.getComputedStyle(hiddenLabel);
    const actionStyle = window.getComputedStyle(actions);
    const overlapsTitle =
      selectBox.left < titleBox.right &&
      titleBox.left < selectBox.right &&
      selectBox.top < titleBox.bottom &&
      titleBox.top < selectBox.bottom;
    return {
      actionMarginBottom: actionStyle.marginBottom,
      buttonDoesNotWrap: button.scrollHeight <= button.clientHeight + 1,
      headerDisplay: window.getComputedStyle(header).display,
      hiddenLabelIsVisualOnly:
        hiddenStyle.position === 'absolute' &&
        hiddenStyle.width === '1px' &&
        hiddenStyle.height === '1px' &&
        hiddenStyle.overflow === 'hidden',
      sameActionRow: Math.abs(selectBox.top - buttonBox.top) < 3,
      sameIssueKeyRow: Math.abs(selectBox.top - issueKeyBox.top) < 12,
      statusDoesNotOverlapTitle: !overlapsTitle,
      titleAboveActionRow: titleBox.bottom <= actionsBox.top,
      titleGap: Math.round(actionsBox.top - titleBox.bottom),
      whiteSpace: window.getComputedStyle(button).whiteSpace,
    };
  });

  if (layout === null) {
    throw new Error('Expected detail header layout to be measurable.');
  }

  expect(layout).toMatchObject({
    actionMarginBottom: '0px',
    buttonDoesNotWrap: true,
    headerDisplay: 'grid',
    hiddenLabelIsVisualOnly: true,
    sameActionRow: true,
    sameIssueKeyRow: true,
    statusDoesNotOverlapTitle: true,
    titleAboveActionRow: true,
    whiteSpace: 'nowrap',
  });
  expect(layout.titleGap).toBeGreaterThanOrEqual(0);
  expect(layout.titleGap).toBeLessThanOrEqual(6);
}

async function expectNarrowDetailHeaderActionsOnIssueKeyRow(frame: Frame): Promise<void> {
  await expect(frame.getByLabel('Issue actions')).toBeVisible();
  const layout = await frame.evaluate(() => {
    const shell = document.querySelector('.detail-shell');
    const header = document.querySelector('.detail-page-header');
    const actions = document.querySelector('.detail-header-actions');
    const issueKey = document.querySelector('.issue-key');
    const title = document.querySelector('.detail-page-title h1');
    const select = document.querySelector('[data-detail-status-select]');
    const button = document.querySelector('[data-detail-action="open-worklog"]');
    if (
      !(shell instanceof HTMLElement) ||
      !(header instanceof HTMLElement) ||
      !(actions instanceof HTMLElement) ||
      !(issueKey instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(select instanceof HTMLElement) ||
      !(button instanceof HTMLElement)
    ) {
      return null;
    }

    const titleBox = title.getBoundingClientRect();
    const actionsBox = actions.getBoundingClientRect();
    const issueKeyBox = issueKey.getBoundingClientRect();
    const selectBox = select.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const overlapsTitle =
      selectBox.left < titleBox.right &&
      titleBox.left < selectBox.right &&
      selectBox.top < titleBox.bottom &&
      titleBox.top < selectBox.bottom;
    return {
      actionMarginBottom: window.getComputedStyle(actions).marginBottom,
      headerDisplay: window.getComputedStyle(header).display,
      sameActionRow: Math.abs(selectBox.top - buttonBox.top) < 3,
      sameIssueKeyRow: Math.abs(selectBox.top - issueKeyBox.top) < 12,
      shellWidth: Math.round(shell.getBoundingClientRect().width),
      statusDoesNotOverlapTitle: !overlapsTitle,
      titleAboveActionRow: titleBox.bottom <= actionsBox.top,
      titleGap: Math.round(actionsBox.top - titleBox.bottom),
    };
  });

  expect(layout).toEqual({
    actionMarginBottom: '0px',
    headerDisplay: 'grid',
    sameActionRow: true,
    sameIssueKeyRow: true,
    shellWidth: expect.any(Number),
    statusDoesNotOverlapTitle: true,
    titleAboveActionRow: true,
    titleGap: expect.any(Number),
  });
  expect(layout?.shellWidth).toBeGreaterThan(340);
  expect(layout?.shellWidth).toBeLessThan(920);
  expect(layout?.titleGap).toBeGreaterThanOrEqual(0);
  expect(layout?.titleGap).toBeLessThanOrEqual(6);
}

async function expectLongDetailTitleDoesNotOverlapStatus(frame: Frame): Promise<void> {
  const layout = await frame.evaluate(() => {
    const title = document.querySelector('.detail-page-title h1');
    const actions = document.querySelector('.detail-header-actions');
    const select = document.querySelector('[data-detail-status-select]');
    const button = document.querySelector('[data-detail-action="open-worklog"]');
    const header = document.querySelector('.detail-page-header');
    const issueKey = document.querySelector('.issue-key');
    if (
      !(title instanceof HTMLElement) ||
      !(actions instanceof HTMLElement) ||
      !(select instanceof HTMLElement) ||
      !(button instanceof HTMLElement) ||
      !(header instanceof HTMLElement) ||
      !(issueKey instanceof HTMLElement)
    ) {
      return null;
    }

    const longTitle = `Demo${'X'.repeat(140)}`;
    title.textContent = longTitle;
    title.setAttribute('title', longTitle);
    const titleBox = title.getBoundingClientRect();
    const actionsBox = actions.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const issueKeyBox = issueKey.getBoundingClientRect();
    const selectBox = select.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    return {
      actionWidth: Math.round(actionsBox.width),
      actionsFitHeader: actionsBox.right <= headerBox.right + 1,
      actionsFollowIssueKey: actionsBox.left >= issueKeyBox.right + 8,
      headerDisplay: window.getComputedStyle(header).display,
      sameActionRow: Math.abs(selectBox.top - buttonBox.top) < 3,
      sameIssueKeyRow: Math.abs(selectBox.top - issueKeyBox.top) < 12,
      statusDoesNotOverlapTitle: !(
        selectBox.left < titleBox.right &&
        titleBox.left < selectBox.right &&
        selectBox.top < titleBox.bottom &&
        titleBox.top < selectBox.bottom
      ),
      titleAboveActionRow: titleBox.bottom <= actionsBox.top,
    };
  });

  expect(layout).toEqual({
    actionWidth: expect.any(Number),
    actionsFitHeader: true,
    actionsFollowIssueKey: true,
    headerDisplay: 'grid',
    sameActionRow: true,
    sameIssueKeyRow: true,
    statusDoesNotOverlapTitle: true,
    titleAboveActionRow: true,
  });
  expect(layout?.actionWidth).toBeGreaterThanOrEqual(250);
}

async function expectIssueContentInlineImages(issueContent: Locator): Promise<void> {
  const image = issueContent.getByRole('img', {
    name: 'reconciliation-alert-preview.png',
  });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^data:image\//u);
  await expect(issueContent.getByText('Image preview unavailable')).toHaveCount(0);
  await expect(
    issueContent.getByRole('img', { name: /preview unavailable/iu })
  ).toHaveCount(0);

  const imageState = await image.evaluate((node) => {
    if (!(node instanceof HTMLImageElement)) {
      return null;
    }

    const description = node.closest('[aria-label="Description and comments"]');
    const figure = node.closest('figure');
    if (!(description instanceof HTMLElement) || !(figure instanceof HTMLElement)) {
      return null;
    }

    const descriptionBox = description.getBoundingClientRect();
    const imageBox = node.getBoundingClientRect();
    return {
      alt: node.alt,
      fillsDescriptionWidth:
        Math.abs(imageBox.width - descriptionBox.width) <= 2,
      figureDisplay: window.getComputedStyle(figure).display,
      figureHasMediaClass: figure.classList.contains('jira-adf-media'),
      naturalHeight: node.naturalHeight,
      naturalWidth: node.naturalWidth,
      notUpscaledBeyondNaturalWidth: node.naturalWidth >= imageBox.width,
      srcStartsWithImageData: node.currentSrc.startsWith('data:image/'),
      visible: imageBox.width > 0 && imageBox.height > 0,
      withinDescription:
        imageBox.left >= descriptionBox.left &&
        imageBox.right <= descriptionBox.right + 1 &&
        imageBox.top >= descriptionBox.top &&
        imageBox.bottom <= descriptionBox.bottom + 1,
    };
  });

  expect(imageState).toEqual({
    alt: 'reconciliation-alert-preview.png',
    fillsDescriptionWidth: true,
    figureDisplay: 'grid',
    figureHasMediaClass: true,
    naturalHeight: expect.any(Number),
    naturalWidth: expect.any(Number),
    notUpscaledBeyondNaturalWidth: true,
    srcStartsWithImageData: true,
    visible: true,
    withinDescription: true,
  });
  expect(imageState?.naturalHeight).toBeGreaterThan(0);
  expect(imageState?.naturalWidth).toBeGreaterThan(1000);

  const commentImage = issueContent.getByRole('img', {
    name: 'comment-alert-preview.png',
  });
  await expect(commentImage).toBeVisible();
  await expect(commentImage).toHaveAttribute('src', /^data:image\//u);
  const commentImageState = await commentImage.evaluate((node) => {
    if (!(node instanceof HTMLImageElement)) {
      return null;
    }

    const comment = node.closest('.detail-comment');
    const figure = node.closest('figure');
    const commentBox = comment instanceof HTMLElement ? comment.getBoundingClientRect() : null;
    const imageBox = node.getBoundingClientRect();
    return {
      figureHasMediaClass: figure instanceof HTMLElement && figure.classList.contains('jira-adf-media'),
      srcStartsWithImageData: node.currentSrc.startsWith('data:image/'),
      visible: imageBox.width > 0 && imageBox.height > 0,
      withinComment:
        commentBox !== null &&
        imageBox.left >= commentBox.left &&
        imageBox.right <= commentBox.right + 1 &&
        imageBox.top >= commentBox.top &&
        imageBox.bottom <= commentBox.bottom + 1,
    };
  });
  expect(commentImageState).toEqual({
    figureHasMediaClass: true,
    srcStartsWithImageData: true,
    visible: true,
    withinComment: true,
  });
}

async function expectImageLightbox(frame: Frame): Promise<void> {
  const sourceImage = frame.getByRole('img', {
    name: 'reconciliation-alert-preview.png',
  });
  await expect(sourceImage).toBeVisible();
  const beforeOpenState = await readImageLightboxState(frame);

  expect(beforeOpenState).toMatchObject({
    closeVisible: false,
    dialogDisplay: 'none',
    dialogFullscreen: false,
    dialogOpen: false,
    lightboxAlt: '',
    lightboxHasHeightAttribute: false,
    lightboxHasSrc: true,
    lightboxHasWidthAttribute: false,
    lightboxSrc: '',
    sourceCursor: 'zoom-in',
    sourceMarked: 'true',
    sourceRole: null,
  });

  await clickWithFallback(sourceImage);
  const dialog = frame.getByRole('dialog', { name: 'Image viewer' });
  await expect(dialog).toBeVisible();
  expect(await readImageLightboxState(frame)).toMatchObject({
    closeVisible: true,
    dialogDisplay: 'grid',
    dialogFullscreen: true,
    dialogOpen: true,
    imageFitsViewport: true,
    lightboxAlt: 'reconciliation-alert-preview.png',
    lightboxHasHeightAttribute: false,
    lightboxHasSrc: true,
    lightboxHasWidthAttribute: false,
    lightboxSrcStartsWithImageData: true,
    sameSrc: true,
    visibleMessages: [],
  });

  await clickWithFallback(dialog.getByRole('button', { name: 'Close image viewer' }));
  await expect(dialog).toBeHidden();
  expect(await readImageLightboxState(frame)).toMatchObject({
    dialogDisplay: 'none',
    dialogOpen: false,
    lightboxAlt: '',
    lightboxSrc: '',
  });

  await clickWithFallback(sourceImage);
  await expect(dialog).toBeVisible();
  await dialog.click({ position: { x: 12, y: 12 } });
  await expect(dialog).toBeHidden();
  expect(await readImageLightboxState(frame)).toMatchObject({
    dialogOpen: false,
    lightboxAlt: '',
    lightboxSrc: '',
  });
}

async function readImageLightboxState(frame: Frame): Promise<Record<string, unknown>> {
  const state = await frame.evaluate(() => {
    const source = document.querySelector('.jira-adf-media img[alt="reconciliation-alert-preview.png"]');
    const dialog = document.querySelector('.detail-image-lightbox-dialog');
    const image = dialog?.querySelector('.detail-image-lightbox-img');
    const close = dialog?.querySelector('.detail-image-lightbox-close');
    if (!(source instanceof HTMLImageElement) || !(dialog instanceof HTMLDialogElement) || !(image instanceof HTMLImageElement)) {
      return null;
    }

    const dialogBox = dialog.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    const closeBox = close instanceof HTMLElement ? close.getBoundingClientRect() : null;
    const visibleMessages = [
      ...document.querySelectorAll(
        '.detail-action-status, .detail-dialog-status, [role="alert"]'
      ),
    ]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((node) => {
        const box = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return node.textContent.trim().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      })
      .map((node) => node.textContent.trim());

    return {
      closeVisible: closeBox !== null && closeBox.width > 0 && closeBox.height > 0,
      dialogDisplay: window.getComputedStyle(dialog).display,
      dialogFullscreen:
        Math.round(dialogBox.width) === document.documentElement.clientWidth &&
        Math.round(dialogBox.height) === document.documentElement.clientHeight &&
        Math.round(dialogBox.left) === 0 &&
        Math.round(dialogBox.top) === 0,
      dialogOpen: dialog.open,
      imageFitsViewport:
        imageBox.width <= window.innerWidth * 0.9 + 1 &&
        imageBox.height <= window.innerHeight * 0.9 + 1,
      lightboxAlt: image.alt,
      lightboxHasHeightAttribute: image.hasAttribute('height'),
      lightboxHasSrc: image.hasAttribute('src'),
      lightboxHasWidthAttribute: image.hasAttribute('width'),
      lightboxSrc: image.getAttribute('src') ?? '',
      lightboxSrcStartsWithImageData: image.src.startsWith('data:image/'),
      sameSrc: image.src === source.currentSrc || image.src === source.src,
      sourceCursor: window.getComputedStyle(source).cursor,
      sourceMarked: source.dataset['lightbox'],
      sourceRole: source.getAttribute('role'),
      visibleMessages,
    };
  });
  if (state === null) {
    throw new Error('Expected image lightbox DOM to be present.');
  }

  return state;
}

async function expectNoVisibleDetailMessages(frame: Frame): Promise<void> {
  const visibleMessages = await frame.evaluate(() => {
    return [
      ...document.querySelectorAll(
        '.detail-action-status, .detail-dialog-status, [role="alert"]'
      ),
    ]
      .filter((node): node is HTMLElement => {
        return node instanceof HTMLElement;
      })
      .filter((node) => {
        const text = node.textContent.trim();
        const box = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return (
          text.length > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0
        );
      })
      .map((node) => {
        return node.textContent.trim();
      });
  });

  expect(visibleMessages).toEqual([]);
}

async function expectNoVisibleAlerts(frame: Frame): Promise<void> {
  const visibleAlerts = await frame.evaluate(() => {
    return [...document.querySelectorAll('[role="alert"]')]
      .filter((node): node is HTMLElement => {
        return node instanceof HTMLElement;
      })
      .filter((node) => {
        const text = node.textContent.trim();
        const box = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return (
          text.length > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          box.width > 0 &&
          box.height > 0
        );
      })
      .map((node) => {
        return node.textContent.trim();
      });
  });

  expect(visibleAlerts).toEqual([]);
}

async function expectTechnicalNotesNearAttachments(frame: Frame): Promise<void> {
  const detailState = await frame.evaluate(() => {
    const webLinks = document.querySelector('[aria-label="All Jira web links"]');
    const activity = document.querySelector('[aria-label="Activity"]');
    const notes = document.querySelector('[aria-label="Technical notes"]');
    const notesBody = document.querySelector('.detail-technical-notes');
    const attachments = document.querySelector('[aria-label="Attachments"]');
    const previousSection = attachments?.previousElementSibling ?? null;
    return {
      activityAfterWebLinks:
        webLinks !== null &&
        activity !== null &&
        Boolean(webLinks.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING),
      activityBeforeTechnicalNotes:
        activity !== null &&
        notes !== null &&
        Boolean(activity.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING),
      afterWebLinks:
        webLinks !== null &&
        notes !== null &&
        Boolean(webLinks.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeAttachments:
        notes !== null &&
        attachments !== null &&
        Boolean(notes.compareDocumentPosition(attachments) & Node.DOCUMENT_POSITION_FOLLOWING),
      immediatelyAboveAttachments: previousSection === notes,
      maxHeight: notesBody === null ? '' : window.getComputedStyle(notesBody).maxHeight,
      scrollable:
        notesBody === null ? false : notesBody.scrollHeight > notesBody.clientHeight,
    };
  });

  expect(detailState).toEqual({
    activityAfterWebLinks: true,
    activityBeforeTechnicalNotes: true,
    afterWebLinks: true,
    beforeAttachments: true,
    immediatelyAboveAttachments: true,
    maxHeight: '220px',
    scrollable: true,
  });
}

async function expectDetailLinksUseWebviewOpenPath(frame: Frame): Promise<void> {
  const linkTargets = await frame.evaluate(() => {
    return [...document.querySelectorAll('.detail-link, .detail-clone-mr-link')]
      .filter((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
      .map((link) => {
        return {
          href: link.href,
          target: link.getAttribute('target'),
        };
      });
  });

  expect(linkTargets.length).toBeGreaterThan(0);
  expect(linkTargets.every((link) => link.href.startsWith('https://'))).toBe(true);
  expect(linkTargets.every((link) => link.target === null)).toBe(true);
}

async function expectCloneButtonHoverReveal(
  cloneCard: Locator,
  cloneButton: Locator
): Promise<void> {
  await expect(cloneCard).toBeVisible();
  await expect
    .poll(async () => {
      const opacity = await cloneButton.evaluate((button) => {
        return window.getComputedStyle(button).opacity;
      });
      return Number.parseFloat(opacity);
    })
    .toBeLessThan(0.05);
  await cloneCard.hover();

  await expect(cloneButton).toHaveCSS('opacity', '1');
}

async function expectSettingsDisconnectInset(frame: Frame): Promise<void> {
  const disconnectInset = await frame.evaluate(() => {
    const row = document.querySelector('.settings-connection');
    const disconnect = [...document.querySelectorAll('button')].find((button) => {
      return button.textContent.trim() === 'Disconnect';
    });
    if (!(row instanceof HTMLElement) || !(disconnect instanceof HTMLElement)) {
      return null;
    }

    return {
      marginRight: window.getComputedStyle(disconnect).marginRight,
      rightGap: Math.round(row.getBoundingClientRect().right - disconnect.getBoundingClientRect().right),
    };
  });

  expect(disconnectInset?.marginRight).toBe('3px');
  expect(disconnectInset?.rightGap).toBe(5);
}

async function expectNotificationReadState(
  frame: Frame,
  title: string,
  unread: boolean
): Promise<void> {
  const item = frame.getByLabel(title);
  await expect(item).toBeVisible();
  await expect.poll(async () => item.evaluate((node) => node.getAttribute('data-unread'))).toBe(
    String(unread)
  );
}

async function expectNotificationDetailButtonAlwaysVisible(
  frame: Frame,
  title: string
): Promise<void> {
  const item = frame.getByLabel(title);
  const button = item.getByRole('button', { name: 'Details' });
  await expect(item).toBeVisible();
  await expect(button).toBeVisible();

  const state = await button.evaluate((node) => {
    const style = window.getComputedStyle(node);
    return {
      className: node.getAttribute('class') ?? '',
      insideIssueCard: node.closest('.issue-card') !== null,
      opacity: Number.parseFloat(style.opacity),
      pointerEvents: style.pointerEvents,
    };
  });

  expect(state).toEqual({
    className: expect.stringContaining('notification-detail-button'),
    insideIssueCard: false,
    opacity: 1,
    pointerEvents: 'auto',
  });
}

async function expectReloadButtonAtHeaderEdge(frame: Frame): Promise<void> {
  const headingBox = await resolveBoundingBox(
    frame.getByRole('heading', { name: 'Notifications' })
  );
  const buttonBox = await resolveBoundingBox(
    frame.getByRole('button', { name: 'Reload notifications' })
  );
  const regionBox = await resolveBoundingBox(frame.getByLabel('JiraOps notifications'));

  expect(Math.abs(buttonBox.y - headingBox.y)).toBeLessThanOrEqual(8);
  expect(buttonBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
  expect(regionBox.x + regionBox.width - (buttonBox.x + buttonBox.width)).toBeLessThanOrEqual(6);
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

async function expectClearButtonUsesCompactWidth(frame: Frame): Promise<void> {
  const clearButton = frame.getByRole('button', { name: 'Clear' });
  const readRatio = async (): Promise<number> => {
    return clearButton.evaluate((button) => {
      const summary = button.parentElement;
      const summaryWidth = summary?.getBoundingClientRect().width ?? 0;
      return summaryWidth <= 0 ? 0 : button.getBoundingClientRect().width / summaryWidth;
    });
  };
  await expect.poll(readRatio).toBeGreaterThan(0.32);
  expect(await readRatio()).toBeLessThan(0.38);
}

async function resolveBoundingBox(locator: Locator): Promise<LocatorBoundingBox> {
  const resolved: { box?: LocatorBoundingBox } = {};
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox().catch(() => null);
        if (box === null || box.width <= 0 || box.height <= 0) {
          return false;
        }
        resolved.box = box;
        return true;
      },
      { timeout: 10_000 }
    )
    .toBe(true);
  if (resolved.box === undefined) {
    throw new Error('Expected visible element to have a bounding box.');
  }
  return resolved.box;
}
