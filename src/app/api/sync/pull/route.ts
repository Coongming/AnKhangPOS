import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

function validatePostgresUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
  } catch {
    return false;
  }
}

function getLocalDatabaseUrl(): string {
  const url = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  if (!url || !validatePostgresUrl(url)) {
    throw new Error('LOCAL_DATABASE_URL hoặc DATABASE_URL không hợp lệ');
  }
  return url;
}

function getOnlineDatabaseUrl(): string {
  const url = process.env.SUPABASE_DIRECT_URL || process.env.SUPABASE_DATABASE_URL;
  if (!url || !validatePostgresUrl(url)) {
    throw new Error('SUPABASE_DIRECT_URL hoặc SUPABASE_DATABASE_URL không hợp lệ');
  }
  return url;
}

function quoteTable(tableName: string): string {
  return `public."${tableName.replace(/"/g, '""')}"`;
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function getLocalTables(localUrl: string): Promise<string[]> {
  const { stdout } = await execFileAsync('psql', [
    localUrl,
    '-t',
    '-A',
    '-c',
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename;",
  ]);

  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function countRows(localUrl: string, tables: string[]) {
  if (tables.length === 0) return [];

  const countSql = tables
    .map((table) => `SELECT '${table.replace(/'/g, "''")}' as table_name, count(*)::int as row_count FROM ${quoteTable(table)}`)
    .join(' UNION ALL ');

  const { stdout } = await execFileAsync('psql', [localUrl, '-t', '-A', '-c', countSql]);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [table, count] = line.split('|');
      return { table: table.trim(), count: Number(count) || 0 };
    });
}

export async function POST() {
  let localUrl: string;
  let onlineUrl: string;

  try {
    localUrl = getLocalDatabaseUrl();
    onlineUrl = getOnlineDatabaseUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cấu hình database không hợp lệ';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (localUrl === onlineUrl) {
    return NextResponse.json(
      { error: 'Database local và Supabase đang trỏ cùng một URL, dừng để tránh ghi nhầm dữ liệu.' },
      { status: 500 }
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ankhang-pull-online-'));
  const dumpFile = path.join(tmpDir, 'online-data.sql');
  const restoreFile = path.join(tmpDir, 'restore-local.sql');
  const backupDir = path.join(process.cwd(), 'backups');
  const backupFile = path.join(backupDir, `local-before-pull-online-${timestampForFile()}.dump`);

  try {
    await fs.mkdir(backupDir, { recursive: true });

    const tables = await getLocalTables(localUrl);
    if (tables.length === 0) throw new Error('Không tìm thấy bảng local nào để khôi phục');

    await execFileAsync('pg_dump', ['-d', localUrl, '--format=custom', '--file', backupFile]);

    await execFileAsync('pg_dump', [
      '-d',
      onlineUrl,
      '--data-only',
      '--no-owner',
      '--no-acl',
      '--schema=public',
      '--exclude-table=public._prisma_migrations',
      '--file',
      dumpFile,
    ]);

    const truncateSql = `TRUNCATE TABLE ${tables.map(quoteTable).join(', ')} CASCADE;`;
    const restoreSql = [
      '\\set ON_ERROR_STOP on',
      'BEGIN;',
      truncateSql,
      `\\i '${dumpFile.replace(/\\/g, '/')}'`,
      'COMMIT;',
    ].join('\n');

    await fs.writeFile(restoreFile, restoreSql, 'utf8');
    await execFileAsync('psql', [localUrl, '-f', restoreFile], { maxBuffer: 20 * 1024 * 1024 });

    const synced = await countRows(localUrl, tables);
    const totalRows = synced.reduce((sum, row) => sum + row.count, 0);

    return NextResponse.json({
      success: true,
      message: `Đã kéo ${totalRows} dòng dữ liệu từ Supabase về local`,
      totalRows,
      backupFile,
      tables: synced.filter((row) => row.count > 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Kéo dữ liệu thất bại: ${message}` }, { status: 500 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
