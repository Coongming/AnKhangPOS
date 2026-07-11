import fs from 'fs';
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

function maskUrl(url: string): string {
  return url.replace(/:[^:@/]+@/, ':***@');
}

async function main() {
  loadProjectEnv();

  const apply = process.argv.includes('--apply');
  const acceptDataLoss = process.argv.includes('--accept-data-loss');
  const onlineDatabaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DIRECT_URL;
  const onlineDirectUrl = process.env.SUPABASE_DIRECT_URL || onlineDatabaseUrl;

  if (!onlineDatabaseUrl) {
    throw new Error('Thiếu SUPABASE_DATABASE_URL hoặc SUPABASE_DIRECT_URL');
  }
  if (!onlineDirectUrl) {
    throw new Error('Thiếu SUPABASE_DIRECT_URL');
  }

  console.log('=== Update online schema ===');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Online database: ${maskUrl(onlineDatabaseUrl)}`);
  console.log(`Online direct: ${maskUrl(onlineDirectUrl)}`);

  if (!apply) {
    console.log('\nDry-run only. Run with --apply to push prisma/schema.prisma to Supabase.');
    console.log('Add --accept-data-loss only when you intentionally allow destructive schema changes.');
    return;
  }

  const args = ['prisma', 'db', 'push'];
  if (acceptDataLoss) {
    args.push('--accept-data-loss');
  }

  runCommand('npx', args, {
    ...process.env,
    DATABASE_URL: onlineDatabaseUrl,
    DIRECT_URL: onlineDirectUrl,
  });

  console.log('\nOnline schema updated successfully.');
}

main().catch((error) => {
  console.error('Update online schema failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
