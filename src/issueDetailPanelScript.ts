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
        const dialogStatus = document.querySelector('.detail-worklog-dialog .detail-dialog-status');
        if (dialogStatus instanceof HTMLElement) {
          dialogStatus.textContent = message;
        }
      }

      function setCloneDialogStatus(message) {
        const dialogStatus = document.querySelector('.detail-clone-dialog .detail-dialog-status');
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

      function getCloneDialog() {
        const dialog = document.querySelector('.detail-clone-dialog');
        return dialog instanceof HTMLDialogElement ? dialog : null;
      }

      function closeCloneDialog() {
        const dialog = getCloneDialog();
        if (dialog !== null && dialog.open) {
          dialog.close();
        }
      }

      function getCloneCard(sourceMrUrl) {
        for (const card of document.querySelectorAll('.detail-clone-mr-card')) {
          if (card instanceof HTMLElement && card.dataset.sourceMrUrl === sourceMrUrl) {
            return card;
          }
        }
        return null;
      }

      function setCloneCardPending(sourceMrUrl, pending) {
        const card = getCloneCard(sourceMrUrl);
        const button = card?.querySelector('[data-clone-action="open"]');
        const status = card?.querySelector('.detail-clone-status');
        if (button instanceof HTMLButtonElement) {
          button.disabled = pending;
          button.textContent = pending ? 'Cloning...' : 'Clone';
        }
        if (status instanceof HTMLElement) {
          status.textContent = pending ? 'Cloning merge request...' : '';
          status.dataset.tone = 'info';
        }
      }

      function setCloneCardFailure(sourceMrUrl, message) {
        setCloneCardPending(sourceMrUrl, false);
        const status = getCloneCard(sourceMrUrl)?.querySelector('.detail-clone-status');
        if (status instanceof HTMLElement) {
          status.textContent = message;
          status.dataset.tone = 'error';
        }
      }

      function setCloneCardSuccess(sourceMrUrl, mergeRequestUrl, message, mergeRequestCreated) {
        const card = getCloneCard(sourceMrUrl);
        const button = card?.querySelector('[data-clone-action="open"]');
        const status = card?.querySelector('.detail-clone-status');
        if (button instanceof HTMLButtonElement) {
          button.disabled = true;
          button.textContent = mergeRequestCreated ? 'Cloned' : 'Updated';
        }
        if (card instanceof HTMLElement) {
          card.dataset.cloneState = 'cloned';
        }
        if (status instanceof HTMLElement) {
          if (typeof mergeRequestUrl !== 'string' || mergeRequestUrl.length === 0) {
            status.textContent = message;
            status.dataset.tone = 'success';
            return;
          }
          const link = document.createElement('a');
          link.href = mergeRequestUrl;
          link.textContent = message;
          link.addEventListener('click', (event) => {
            event.preventDefault();
            vscode.postMessage({ type: 'jiraOps.openExternalLink', url: link.href });
          });
          status.replaceChildren('Cloned as ', link);
          status.dataset.tone = 'success';
        }
      }

      function setCloneInputValue(form, name, value) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) {
          input.value = value;
        }
      }

      function getCloneInputValue(form, name) {
        const input = form.elements.namedItem(name);
        return input instanceof HTMLInputElement ? input.value.trim() : '';
      }

      function openCloneDialog(button) {
        const dialog = getCloneDialog();
        const form = document.querySelector('form[data-detail-action="clone"]');
        if (dialog === null || !(form instanceof HTMLFormElement)) {
          return;
        }

        form.dataset.sourceMrUrl = button.dataset.sourceMrUrl ?? '';
        form.dataset.sourceMrTitle = button.dataset.sourceMrTitle ?? '';
        setCloneDialogStatus('');
        setCloneInputValue(form, 'destinationGroup', '');
        setCloneInputValue(form, 'baseBranch', button.dataset.defaultBaseBranch ?? 'staging');
        setCloneInputValue(form, 'portBranch', button.dataset.defaultPortBranch ?? '');
        setCloneInputValue(form, 'title', button.dataset.defaultTitle ?? '');
        const source = form.querySelector('[data-clone-source]');
        if (source instanceof HTMLElement) {
          source.textContent = button.dataset.sourceMrLabel ?? 'Selected merge request';
        }

        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
          return;
        }
        dialog.setAttribute('open', '');
      }

      function getImageLightboxDialog() {
        const dialog = document.querySelector('.detail-image-lightbox-dialog');
        return dialog instanceof HTMLDialogElement ? dialog : null;
      }

      function openImageLightbox(sourceImage) {
        const dialog = getImageLightboxDialog();
        const lightboxImage = dialog?.querySelector('.detail-image-lightbox-img');
        if (dialog === null || !(lightboxImage instanceof HTMLImageElement)) {
          return;
        }

        lightboxImage.src = sourceImage.currentSrc || sourceImage.src;
        lightboxImage.alt = sourceImage.alt;
        dialog.addEventListener('close', () => clearImageLightbox(dialog), { once: true });
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
          return;
        }
        dialog.setAttribute('open', '');
      }

      function closeImageLightbox() {
        const dialog = getImageLightboxDialog();
        if (dialog !== null && dialog.open) {
          dialog.close();
          clearImageLightbox(dialog);
        }
      }

      function clearImageLightbox(dialog) {
        const lightboxImage = dialog.querySelector('.detail-image-lightbox-img');
        if (lightboxImage instanceof HTMLImageElement) {
          lightboxImage.removeAttribute('src');
          lightboxImage.alt = '';
        }
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

      function bindCloneDialog() {
        for (const cloneButton of document.querySelectorAll('[data-clone-action="open"]')) {
          if (cloneButton instanceof HTMLButtonElement) {
            cloneButton.addEventListener('click', () => openCloneDialog(cloneButton));
          }
        }
        for (const closeButton of document.querySelectorAll('[data-clone-action="close"]')) {
          closeButton.addEventListener('click', closeCloneDialog);
        }
      }

      function bindCloneForm() {
        const form = document.querySelector('form[data-detail-action="clone"]');
        if (!(form instanceof HTMLFormElement)) {
          return;
        }
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const sourceMrUrl = form.dataset.sourceMrUrl ?? '';
          const sourceMrTitle = form.dataset.sourceMrTitle ?? '';
          const destinationGroup = getCloneInputValue(form, 'destinationGroup');
          const baseBranch = getCloneInputValue(form, 'baseBranch');
          const portBranch = getCloneInputValue(form, 'portBranch');
          const title = getCloneInputValue(form, 'title');
          if ([sourceMrUrl, sourceMrTitle, destinationGroup, baseBranch, portBranch, title].some((value) => value.length === 0)) {
            setCloneDialogStatus('Complete every clone field.');
            return;
          }

          closeCloneDialog();
          setCloneCardPending(sourceMrUrl, true);
          vscode.postMessage({
            type: 'jiraOps.cloneMergeRequest',
            issueKey: form.dataset.issueKey,
            sourceMrUrl,
            sourceMrTitle,
            destinationGroup,
            baseBranch,
            portBranch,
            title,
          });
        });
      }

      function bindImageLightbox() {
        const dialog = getImageLightboxDialog();
        if (dialog === null) {
          return;
        }

        const closeButton = dialog.querySelector('.detail-image-lightbox-close');
        if (closeButton instanceof HTMLButtonElement) {
          closeButton.addEventListener('click', closeImageLightbox);
        }

        dialog.addEventListener('click', (event) => {
          if (event.target === dialog) {
            closeImageLightbox();
          }
        });
        document.addEventListener('click', (event) => {
          const target = event.target;
          if (target instanceof HTMLImageElement && target.dataset.lightbox === 'true') {
            openImageLightbox(target);
          }
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
        if (!event.data) {
          return;
        }
        if (event.data.type === 'jiraOps.cloneMergeRequestResult') {
          if (event.data.success === true) {
            setCloneCardSuccess(
              event.data.sourceMrUrl,
              event.data.mergeRequestUrl,
              event.data.message,
              event.data.mergeRequestCreated === true
            );
            return;
          }
          setCloneCardFailure(event.data.sourceMrUrl, event.data.message ?? 'Merge request could not be cloned.');
          return;
        }
        if (event.data.type !== 'jiraOps.detailActionResult') {
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
      bindCloneDialog();
      bindCloneForm();
      bindImageLightbox();
`;
