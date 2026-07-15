import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

type EnvMap = Record<string, string>;

const ROOT_DIR = process.cwd();

function parseEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) return {};

  const env: EnvMap = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex < 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadProjectEnv(): void {
  for (const envFile of ['.env', '.env.online']) {
    const fileEnv = parseEnvFile(path.join(ROOT_DIR, envFile));
    for (const [key, value] of Object.entries(fileEnv)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function commandName(command: string): string {
  if (process.platform === 'win32' && ['npx', 'pg_dump', 'psql'].includes(command)) {
    return `${command}.exe`;
  }
  return command;
}

function runCommand(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv; stdout?: 'pipe' | 'inherit' }): string {
  const result = spawnSync(commandName(command), args, {
    cwd: ROOT_DIR,
    env: options?.env || process.env,
    encoding: 'utf8',
    stdio: ['ignore', options?.stdout || 'inherit', 'inherit'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }

  return result.stdout || '';
}

function makeTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function maskUrl(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

function createBackup(localDatabaseUrl: string): string {
  const backupDir = path.join(ROOT_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const backupFile = path.join(backupDir, `local-db-before-online-pull-${makeTimestamp()}.dump`);
  runCommand('pg_dump', ['-d', localDatabaseUrl, '--format=custom', '--file', backupFile]);
  return backupFile;
}

function getLocalTables(localDatabaseUrl: string): string[] {
  const stdout = runCommand(
    'psql',
    [
      localDatabaseUrl,
      '-t',
      '-A',
      '-c',
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename;",
    ],
    { stdout: 'pipe' }
  );

  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function quoteTable(tableName: string): string {
  return `public."${tableName.replace(/"/g, '""')}"`;
}

async function main() {
  loadProjectEnv();

  const apply = process.argv.includes('--apply');
  const skipBackup = process.argv.includes('--no-backup');
  const localDatabaseUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  const onlineDatabaseUrl = process.env.SUPABASE_DIRECT_URL || process.env.SUPABASE_DATABASE_URL;

  if (!localDatabaseUrl) {
    throw new Error('Thiếu LOCAL_DATABASE_URL hoặc DATABASE_URL');
  }
  if (!onlineDatabaseUrl) {
    throw new Error('Thiếu SUPABASE_DIRECT_URL hoặc SUPABASE_DATABASE_URL');
  }
  if (localDatabaseUrl === onlineDatabaseUrl) {
    throw new Error('Local DB và online DB đang trỏ cùng một URL, dừng để tránh ghi nhầm.');
  }

  console.log('=== Pull online data to local ===');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Online source: ${maskUrl(onlineDatabaseUrl)}`);
  console.log(`Local target: ${maskUrl(localDatabaseUrl)}`);

  const tables = getLocalTables(localDatabaseUrl);
  console.log(`Local tables to replace: ${tables.length}`);

  if (!apply) {
    console.log('\nDry-run only. Run with --apply to replace local data with online data.');
    return;
  }

  if (!skipBackup) {
    const backupFile = createBackup(localDatabaseUrl);
    console.log(`Backup created: ${backupFile}`);
  } else {
    console.log('Backup skipped by --no-backup');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ankhang-online-pull-'));
  const dumpFile = path.join(tempDir, 'online-data.sql');
  const restoreFile = path.join(tempDir, 'restore-local.sql');

  try {
    console.log('\nDumping online data...');
    runCommand('pg_dump', [
      '-d',
      onlineDatabaseUrl,
      '--data-only',
      '--no-owner',
      '--no-acl',
      '--schema=public',
      '--exclude-table=public._prisma_migrations',
      '--file',
      dumpFile,
    ]);

    const truncateSql = tables.length > 0
      ? `TRUNCATE TABLE ${tables.map(quoteTable).join(', ')} CASCADE;`
      : '';

    const restoreSql = [
      '\\set ON_ERROR_STOP on',
      'BEGIN;',
      truncateSql,
      `\\i '${dumpFile.replace(/\\/g, '/')}'`,
      'COMMIT;',
    ].filter(Boolean).join('\n');

    fs.writeFileSync(restoreFile, restoreSql, 'utf8');

    console.log('Restoring online data into local DB...');
    runCommand('psql', [localDatabaseUrl, '-f', restoreFile]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\nOnline data pulled into local DB successfully.');
}

main().catch((error) => {
  console.error('Pull online data failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
