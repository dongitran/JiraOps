import type { JiraIssueDetail } from './jiraIssueDetails';
import type { JiraAssignedIssue } from './jiraClient';
import type { RemoteWebLink } from './remoteLinks';

const TEST_ATTACHMENT_IMAGE_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="#2aa198"/></svg>'
)}`;

export function resolveTestAssignedIssues(): JiraAssignedIssue[] {
  return [
    {
      key: 'OPS-123',
      summary: 'Stabilize payment reconciliation alerts',
      status: 'In Progress',
      statusCategory: 'In Progress',
      priority: 'High',
      assigneeDisplayName: 'Current User',
      updated: '2026-05-01T08:20:00.000+0000',
    },
    {
      key: 'OPS-456',
      summary: 'Review checkout service release readiness',
      status: 'Code Review',
      statusCategory: 'In Progress',
      priority: 'Medium',
      assigneeDisplayName: 'Current User',
      updated: '2026-05-01T06:05:00.000+0000',
    },
    {
      key: 'OPS-321',
      summary: 'Follow cloned inventory reservation cleanup',
      status: 'In Review',
      statusCategory: 'In Progress',
      priority: 'High',
      assigneeDisplayName: 'Current User',
      updated: '2026-05-01T05:15:00.000+0000',
    },
    {
      key: 'OPS-900',
      summary: 'demoABCDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      status: 'To Do',
      statusCategory: 'To Do',
      priority: 'Medium',
      assigneeDisplayName: 'Current User',
      updated: '2026-05-01T04:45:00.000+0000',
    },
    {
      key: 'OPS-789',
      summary: 'Confirm warehouse webhook retry policy',
      status: 'Waiting for Input',
      statusCategory: 'To Do',
      priority: 'Low',
      assigneeDisplayName: 'Current User',
      updated: '2026-04-30T17:45:00.000+0000',
    },
  ];
}

export function resolveTestRemoteLinks(issueKey: string): RemoteWebLink[] {
  if (issueKey === 'OPS-123') {
    return resolveOps123RemoteLinks();
  }

  if (issueKey === 'OPS-456') {
    return resolveOps456RemoteLinks();
  }

  if (issueKey === 'OPS-321') {
    return resolveOps321RemoteLinks();
  }

  if (issueKey === 'OPS-111') {
    return [createMergeRequestLink(issueKey, '88', 'Backport alert window tuning')];
  }

  if (issueKey === 'OPS-222') {
    return [
      createMergeRequestLink(issueKey, '91', 'Clean stale inventory reservations'),
      createMergeRequestLink(issueKey, '92', 'Add reservation cleanup observability'),
    ];
  }

  if (issueKey === 'OPS-789') {
    return [
      {
        id: `${issueKey}-policy`,
        title: 'Webhook retry policy',
        url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/2209/webhook-retry-policy',
        relationship: 'Confluence',
        host: 'example.atlassian.net',
      },
    ];
  }

  return [];
}

export function resolveTestIssueDetail(issueKey: string): JiraIssueDetail {
  if (issueKey === 'OPS-123') {
    return createOps123IssueDetail();
  }

  if (issueKey === 'OPS-321') {
    return createOps321IssueDetail();
  }

  const issue = resolveTestAssignedIssues().find((item) => item.key === issueKey);
  return createDefaultIssueDetail(issueKey, issue?.summary ?? 'Test issue');
}

export function isJiraOpsTestMode(): boolean {
  return process.env['JIRA_OPS_TEST_MODE'] === '1';
}

function resolveOps123RemoteLinks(): RemoteWebLink[] {
  return [
    {
      id: 'OPS-123-mr-482',
      title: 'Handle delayed payment settlements',
      url: 'https://gitlab.example.com/platform/payments/-/merge_requests/482',
      relationship: 'Merge request',
      host: 'gitlab.example.com',
    },
    {
      id: 'OPS-123-mr-483',
      title: 'Tighten reconciliation alert thresholds',
      url: 'https://gitlab.example.com/platform/observability/-/merge_requests/483',
      relationship: 'Merge request',
      host: 'gitlab.example.com',
    },
    {
      id: 'OPS-123-runbook',
      title: 'Payment incident runbook',
      url: 'https://docs.example.com/runbooks/payments/reconciliation',
      relationship: 'Runbook',
      host: 'docs.example.com',
    },
    {
      id: 'OPS-123-design',
      title: 'Alert tuning design note',
      url: 'https://example.atlassian.net/wiki/spaces/OPS/pages/1453/alert-tuning',
      relationship: 'Confluence',
      host: 'example.atlassian.net',
    },
  ];
}

function resolveOps456RemoteLinks(): RemoteWebLink[] {
  return [
    {
      id: 'OPS-456-mr-214',
      title: 'Prepare checkout release toggle cleanup',
      url: 'https://gitlab.example.com/storefront/checkout/-/merge_requests/214',
      relationship: 'Merge request',
      host: 'gitlab.example.com',
    },
    {
      id: 'OPS-456-dashboard',
      title: 'Checkout release dashboard',
      url: 'https://grafana.example.com/d/checkout-release',
      relationship: 'Dashboard',
      host: 'grafana.example.com',
    },
  ];
}

function resolveOps321RemoteLinks(): RemoteWebLink[] {
  return [
    {
      id: 'OPS-321-runbook',
      title: 'Inventory reservation runbook',
      url: 'https://docs.example.com/runbooks/inventory/reservations',
      relationship: 'Runbook',
      host: 'docs.example.com',
    },
  ];
}

function createMergeRequestLink(
  issueKey: string,
  iid: string,
  title: string
): RemoteWebLink {
  const projectPath =
    issueKey === 'OPS-222' ? 'storefront/inventory' : 'platform/observability';
  return {
    id: `${issueKey}-mr-${iid}`,
    title,
    url: `https://gitlab.example.com/${projectPath}/-/merge_requests/${iid}`,
    relationship: 'Merge request',
    host: 'gitlab.example.com',
  };
}

function createOps123IssueDetail(): JiraIssueDetail {
  return {
    ...createDefaultIssueDetail('OPS-123', 'Stabilize payment reconciliation alerts'),
    descriptionText:
      'Reconciliation alerts fire too late when settlement batches arrive after the normal processing window. Tighten thresholds and keep on-call context visible.',
    descriptionHtml:
      '<h3>Alert behavior</h3><p>Reconciliation alerts fire too late when settlement batches arrive after the normal processing window.</p><ul><li><p>Tighten the delayed settlement threshold.</p></li><li><p>Keep the on-call runbook visible for reviewers.</p></li></ul><p>Review the <a href="https://docs.example.com/runbooks/payments/reconciliation">payment incident runbook</a> before merging.</p>',
    comments: [
      {
        id: 'OPS-123-comment-1',
        authorDisplayName: 'Current User',
        bodyText:
          'Validated against the delayed settlement sample. The alert should page only after the retry budget is exhausted.',
        bodyHtml:
          '<p>Validated against the delayed settlement sample.</p><p><strong>Expected:</strong> page only after the retry budget is exhausted.</p>',
        created: '2026-05-01T07:55:00.000+0000',
      },
    ],
    attachments: [
      {
        id: 'OPS-123-image-1',
        filename: 'reconciliation-alert-preview.png',
        mimeType: 'image/png',
        size: 28420,
        imageDataUri: TEST_ATTACHMENT_IMAGE_DATA_URI,
      },
    ],
    linkedCloneIssues: [
      {
        key: 'OPS-111',
        relationship: 'clones',
        status: 'Code Review',
      },
    ],
  };
}

function createOps321IssueDetail(): JiraIssueDetail {
  return {
    ...createDefaultIssueDetail('OPS-321', 'Follow cloned inventory reservation cleanup'),
    descriptionText:
      'This ticket tracks the cloned inventory cleanup task. The active implementation MR is attached to the cloned work item.',
    descriptionHtml:
      '<p>This ticket tracks the cloned inventory cleanup task. The active implementation MR is attached to the cloned work item.</p>',
    comments: [
      {
        id: 'OPS-321-comment-1',
        authorDisplayName: 'Release Manager',
        bodyText:
          'Keep this ticket open until the cloned cleanup MR is merged and the reservation job is verified.',
        bodyHtml:
          '<p>Keep this ticket open until the cloned cleanup MR is merged and the reservation job is verified.</p>',
        created: '2026-05-01T05:40:00.000+0000',
      },
    ],
    linkedCloneIssues: [
      {
        key: 'OPS-222',
        relationship: 'is cloned by',
        status: 'In Review',
      },
    ],
  };
}

function createDefaultIssueDetail(issueKey: string, summary: string): JiraIssueDetail {
  const assignedIssue = resolveTestAssignedIssues().find((issue) => issue.key === issueKey);
  return {
    key: issueKey,
    summary,
    status: assignedIssue?.status ?? 'To Do',
    statusCategory: assignedIssue?.statusCategory ?? 'To Do',
    priority: assignedIssue?.priority ?? null,
    updated: assignedIssue?.updated ?? '2026-05-01T00:00:00.000+0000',
    descriptionText: 'No description was provided for this test issue.',
    descriptionHtml: '<p>No description was provided for this test issue.</p>',
    comments: [],
    attachments: [],
    linkedCloneIssues: [],
  };
}
