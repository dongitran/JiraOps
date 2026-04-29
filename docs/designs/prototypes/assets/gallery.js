const frameElement = document.getElementById('prototype-frame');
const themeButton = document.getElementById('theme-cycle');
const controlsToggle = document.getElementById('controls-toggle');
const controlsPanel = document.getElementById('floating-controls-panel');

const THEMES = [
  {
    id: 'dark',
    galleryClass: 'gallery-theme-dark',
    frameClass: 'vscode-dark',
    buttonLabel: 'Theme: Dark',
  },
  {
    id: 'light',
    galleryClass: 'gallery-theme-light',
    frameClass: 'vscode-light',
    buttonLabel: 'Theme: Light',
  },
  {
    id: 'high-contrast',
    galleryClass: 'gallery-theme-high-contrast',
    frameClass: 'vscode-high-contrast',
    buttonLabel: 'Theme: High Contrast',
  },
];

if (
  !(frameElement instanceof HTMLIFrameElement) ||
  !(themeButton instanceof HTMLButtonElement) ||
  !(controlsToggle instanceof HTMLButtonElement) ||
  !(controlsPanel instanceof HTMLDivElement)
) {
  throw new Error('Prototype gallery is missing required DOM nodes.');
}

let currentThemeIndex = 0;
let controlsOpen = false;

frameElement.addEventListener('load', () => {
  applyThemeToFrame();
});

themeButton.addEventListener('click', () => {
  currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
  applyThemeToGallery();
  applyThemeToFrame();
});

controlsToggle.addEventListener('click', () => {
  setControlsOpen(!controlsOpen);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && controlsOpen) {
    setControlsOpen(false);
  }
});

applyThemeToGallery();
setControlsOpen(false);

function applyThemeToGallery() {
  const theme = THEMES[currentThemeIndex];
  if (theme === undefined) {
    return;
  }

  for (const item of THEMES) {
    document.body.classList.toggle(item.galleryClass, item.id === theme.id);
  }
  themeButton.textContent = theme.buttonLabel;
}

function applyThemeToFrame() {
  const frameBody = frameElement.contentDocument?.body;
  const theme = THEMES[currentThemeIndex];
  if (frameBody === undefined || theme === undefined) {
    return;
  }

  for (const item of THEMES) {
    frameBody.classList.toggle(item.frameClass, item.id === theme.id);
  }
}

function setControlsOpen(isOpen) {
  controlsOpen = isOpen;
  controlsPanel.hidden = !isOpen;
  controlsToggle.setAttribute('aria-expanded', String(isOpen));
}
