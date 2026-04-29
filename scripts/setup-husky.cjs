const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(process.cwd());

function readGitRoot() {
  try {
    return resolve(
      execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    );
  } catch {
    return null;
  }
}

function runHuskyInstall() {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(executable, ['husky'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

const gitRoot = readGitRoot();

if (gitRoot !== projectRoot) {
  process.stdout.write('Skipping Husky install because jira-ops is not the git root.\n');
  process.exit(0);
}

if (!existsSync(resolve(projectRoot, '.husky', 'pre-commit'))) {
  process.stdout.write('Skipping Husky install because .husky/pre-commit is missing.\n');
  process.exit(0);
}

runHuskyInstall();
