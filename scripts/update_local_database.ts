import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

type EnvMap = Record<string, string>;

const ROOT_DIR = process.cwd();
const PATCH_STOCK_REBUILD = 'db_patch_20260711_rebuild_stock_from_history';

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

function loadProjectEnv(): EnvMap {
  const fileEnv = parseEnvFile(path.join(ROOT_DIR, '.env'));
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return fileEnv;
}

function commandName(command: string): string {
  if (process.platform === 'win32' && command === 'npx') return 'npx.cmd';
  return command;
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(commandName(command), args, {
    cwd: ROOT_DIR,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
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

function createBackup(localDatabaseUrl: string): string {
  const backupDir = path.join(ROOT_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const backupFile = path.join(backupDir, `local-db-before-update-${makeTimestamp()}.dump`);
  const result = spawnSync(commandName('pg_dump'), ['-d', localDatabaseUrl, '--format=custom', '--file', backupFile], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`Không chạy được pg_dump. Cài PostgreSQL client hoặc thêm pg_dump vào PATH. Chi tiết: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Backup database thất bại với exit code ${result.status}`);
  }

  return backupFile;
}

async function hasPatch(prisma: any, key: string): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  return setting?.value === 'applied';
}

async function markPatchApplied(prisma: any, key: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: 'applied' },
    create: { key, value: 'applied' },
  });
}

async function main() {
  loadProjectEnv();

  const skipBackup = process.argv.includes('--no-backup');
  const localDatabaseUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  const localDirectUrl = process.env.LOCAL_DIRECT_URL || localDatabaseUrl;

  if (!localDatabaseUrl) {
    throw new Error('Thiếu LOCAL_DATABASE_URL trong .env');
  }

  const localEnv = {
    ...process.env,
    DATABASE_URL: localDatabaseUrl,
    DIRECT_URL: localDirectUrl || localDatabaseUrl,
  };

  console.log('=== Local database update ===');
  console.log(`Database: ${localDatabaseUrl.replace(/:[^:@/]+@/, ':***@')}`);

  if (!skipBackup) {
    const backupFile = createBackup(localDatabaseUrl);
    console.log(`Backup created: ${backupFile}`);
  } else {
    console.log('Backup skipped by --no-backup');
  }

  console.log('\nApplying Prisma schema...');
  runCommand('npx', ['prisma', 'db', 'push'], localEnv);

  console.log('\nSeeding default data...');
  runCommand('npx', ['tsx', 'prisma/seed.ts'], localEnv);

  process.env.DATABASE_URL = localDatabaseUrl;
  process.env.DIRECT_URL = localDirectUrl || localDatabaseUrl;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    if (await hasPatch(prisma, PATCH_STOCK_REBUILD)) {
      console.log('\nStock rebuild patch: already applied');
    } else {
      console.log('\nApplying stock rebuild patch...');
      await prisma.$disconnect();
      runCommand('npx', ['tsx', 'scripts/rebuild_stock_from_history.ts', '--apply'], localEnv);

      const markerPrisma = new PrismaClient();
      await markPatchApplied(markerPrisma, PATCH_STOCK_REBUILD);
      await markerPrisma.$disconnect();
      console.log('Stock rebuild patch marked as applied');
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  console.log('\nLocal database update completed.');
}

main().catch((error) => {
  console.error('Local database update failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
