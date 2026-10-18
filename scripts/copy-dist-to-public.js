import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });
cpSync('dist', 'public', { recursive: true, force: true });
