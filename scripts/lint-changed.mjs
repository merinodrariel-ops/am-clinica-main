import { spawnSync } from 'node:child_process';

const requestedBase = process.argv[2] || 'origin/main';
const lintExtensions = /\.(?:[cm]?[jt]sx?)$/;

function git(args, options = {}) {
    return spawnSync('git', args, {
        cwd: process.cwd(),
        encoding: options.encoding ?? 'utf8',
        stdio: options.stdio,
    });
}

const requestedBaseExists = git(['cat-file', '-e', `${requestedBase}^{commit}`]).status === 0;
const fallbackBaseExists = git(['cat-file', '-e', 'HEAD^']).status === 0;
const base = requestedBaseExists ? requestedBase : fallbackBaseExists ? 'HEAD^' : 'HEAD';

const diff = git([
    'diff',
    '--name-only',
    '--diff-filter=ACMRT',
    '-z',
    base,
]);

if (diff.status !== 0) {
    process.stderr.write(diff.stderr || 'No se pudo calcular el diff para ESLint.\n');
    process.exit(diff.status || 1);
}

const files = diff.stdout
    .split('\0')
    .filter(Boolean)
    .filter(file => lintExtensions.test(file));

if (files.length === 0) {
    console.log(`No lintable files changed since ${base}.`);
    process.exit(0);
}

console.log(`Linting ${files.length} changed files since ${base}.`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const lint = spawnSync(npx, ['--no-install', 'eslint', ...files], { stdio: 'inherit' });
process.exit(lint.status ?? 1);
