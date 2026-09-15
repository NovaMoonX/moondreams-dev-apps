import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const targets: string[] = [];

if (existsSync('functions')) {
  execSync('npm run build', { cwd: 'functions', stdio: 'inherit' });
  targets.push('functions');
}

if (existsSync('database.rules.json')) {
  targets.push('database');
}

if (existsSync('firestore.rules')) {
  targets.push('firestore:rules');
}

if (existsSync('firestore.indexes.json')) {
  targets.push('firestore:indexes');
}

if (existsSync('storage.rules')) {
  targets.push('storage');
}

if (targets.length === 0) {
  console.log('No Firebase deploy targets found; skipping deploy.');
  process.exit(0);
}

execSync(`firebase deploy --only ${targets.join(',')}`, { stdio: 'inherit' });
