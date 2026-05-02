export const ISSUE_DETAIL_SCRIPT_BODY = `
      const vscode = acquireVsCodeApi();
      let pendingDetailAction = '';

      function setActionStatus(message, tone) {
        const actionStatus = document.querySelector('.detail-action-status');
        if (actionStatus instanceof HTMLElement) {
          actionStatus.textContent = message;
          actionStatus.dataset.tone = tone;
        }
      }

      function setDialogStatus(message) {
        const dialogStatus = document.querySelector('.detail-dialog-status');
        if (dialogStatus instanceof HTMLElement) {
          dialogStatus.textContent = message;
        }
      }

      function getStatusSelect() {
        const select = document.querySelector('[data-detail-status-select]');
        return select instanceof HTMLSelectElement ? select : null;
      }

      function updateCurrentStatusOption(status) {
        const select = getStatusSelect();
        const option = select?.querySelector('option[value=""]');
        if (option instanceof HTMLOptionElement) {
          option.textContent = status;
          option.dataset.status = status;
        }
        if (select !== null) {
          select.value = '';
        }
      }

      function setWorklogPending(pending) {
        const submit = document.querySelector('[data-detail-action="submit-worklog"]');
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = pending;
        }
      }

      function getWorklogDialog() {
        const dialog = document.querySelector('.detail-worklog-dialog');
        return dialog instanceof HTMLDialogElement ? dialog : null;
      }

      function closeWorklogDialog() {
        const dialog = getWorklogDialog();
        if (dialog !== null && dialog.open) {
          dialog.close();
        }
      }

      function openWorklogDialog() {
        const dialog = getWorklogDialog();
        if (dialog === null) {
          return;
        }
        setDialogStatus('');
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
          return;
        }
        dialog.setAttribute('open', '');
      }

      function bindExternalLinks() {
        for (const link of document.querySelectorAll('a[href]')) {
          link.addEventListener('click', (event) => {
            event.preventDefault();
            vscode.postMessage({ type: 'jiraOps.openExternalLink', url: link.href });
          });
        }
      }

      function bindStatusSelect() {
        const select = getStatusSelect();
        if (select === null) {
          return;
        }
        select.addEventListener('change', () => {
          if (select.value.length === 0) {
            return;
          }
          pendingDetailAction = 'status';
          select.disabled = true;
          setActionStatus('Updating status...', 'info');
          vscode.postMessage({
            type: 'jiraOps.transitionIssue',
            issueKey: select.dataset.issueKey,
            transitionId: select.value,
          });
        });
      }

      function bindWorklogDialog() {
        const openButton = document.querySelector('[data-detail-action="open-worklog"]');
        if (openButton instanceof HTMLButtonElement) {
          openButton.addEventListener('click', openWorklogDialog);
        }
        for (const closeButton of document.querySelectorAll('[data-detail-action="close-worklog"]')) {
          closeButton.addEventListener('click', () => {
            if (pendingDetailAction !== 'work') {
              closeWorklogDialog();
            }
          });
        }
      }

      function bindWorklogForm() {
        const form = document.querySelector('form[data-detail-action="work"]');
        if (!(form instanceof HTMLFormElement)) {
          return;
        }
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          const minutes = Number.parseInt(String(formData.get('minutes') ?? ''), 10);
          if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
            setDialogStatus('Enter minutes from 1 to 1440.');
            return;
          }
          pendingDetailAction = 'work';
          setWorklogPending(true);
          setDialogStatus('Logging work...');
          vscode.postMessage({
            type: 'jiraOps.logWork',
            issueKey: form.dataset.issueKey,
            minutes,
            comment: String(formData.get('comment') ?? ''),
          });
        });
      }

      function handleStatusActionResult(data) {
        const select = getStatusSelect();
        if (select !== null) {
          select.disabled = false;
          select.value = '';
        }
        if (data.success === true && typeof data.status === 'string' && data.status.length > 0) {
          updateCurrentStatusOption(data.status);
        }
      }

      function handleWorklogActionResult(data) {
        setWorklogPending(false);
        if (data.success === true) {
          const note = document.querySelector('textarea[name="comment"]');
          if (note instanceof HTMLTextAreaElement) {
            note.value = '';
          }
          closeWorklogDialog();
          return;
        }
        setDialogStatus(typeof data.message === 'string' ? data.message : 'Jira work log could not be added.');
      }

      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'jiraOps.detailActionResult') {
          return;
        }
        if (pendingDetailAction === 'status') {
          handleStatusActionResult(event.data);
        }
        if (pendingDetailAction === 'work') {
          handleWorklogActionResult(event.data);
        }
        const tone = event.data.success === true ? 'success' : 'error';
        setActionStatus(typeof event.data.message === 'string' ? event.data.message : '', tone);
        pendingDetailAction = '';
      });

      bindExternalLinks();
      bindStatusSelect();
      bindWorklogDialog();
      bindWorklogForm();
`;
