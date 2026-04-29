import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KNOWN_VSCODE_PATHS: readonly string[] = [
  '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron',
  '/usr/share/code/code',
  '/usr/bin/code',
  'C:\\Program Files\\Microsoft VS Code\\Code.exe',
];

export function getExtensionRootDir(): string {
  return path.resolve(__dirname, '..', '..');
}

export function getTemporaryWorkspaceDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jira-ops-workspace-'));
}

export function getTemporaryUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jira-ops-user-data-'));
}

export function resolveVscodeExecutablePath(): string {
  const envPath = process.env['VSCODE_EXECUTABLE_PATH'];
  if (envPath !== undefined && envPath.length > 0) {
    return envPath;
  }

  for (const candidatePath of KNOWN_VSCODE_PATHS) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    'Unable to find a VS Code executable. Set VSCODE_EXECUTABLE_PATH to the full executable path.'
  );
}
