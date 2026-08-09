import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CommandResult = {
  stdout: string;
  stderr: string;
};

let syncInProgress = false;

function isPostgresUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'postgresql:' || url.protocol === 'postgres:';
  } catch {
    return false;
  }
}

function commandName(command: string): string {
  if (process.platform === 'win32' && (command === 'pg_dump' || command === 'psql')) {
    return command + '.exe';
  }
  return command;
}

function processEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGCONNECT_TIMEOUT: '20',
    ...overrides,
  };
}

function postgresCommandEnv(databaseUrl: string): Partial<NodeJS.ProcessEnv> {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !database) {
    throw new Error('URL PostgreSQL thiếu host hoặc tên database');
  }

  const env: Partial<NodeJS.ProcessEnv> = {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGDATABASE: database,
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);

  const queryEnvNames: Record<string, string> = {
    application_name: 'PGAPPNAME',
    channel_binding: 'PGCHANNELBINDING',
    connect_timeout: 'PGCONNECT_TIMEOUT',
    sslcert: 'PGSSLCERT',
    sslkey: 'PGSSLKEY',
    sslmode: 'PGSSLMODE',
    sslrootcert: 'PGSSLROOTCERT',
    target_session_attrs: 'PGTARGETSESSIONATTRS',
  };
  for (const [queryName, envName] of Object.entries(queryEnvNames)) {
    const value = url.searchParams.get(queryName);
    if (value) env[envName] = value;
  }

  return env;
}

function runCommand(
  command: string,
  args: string[],
  envOverrides: Partial<NodeJS.ProcessEnv> = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      commandName(command),
      args,
      {
        cwd: process.cwd(),
        env: processEnv(envOverrides),
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      },
      (error, stdout, stderr) => {
        const result = {
          stdout: stdout || '',
          stderr: stderr || '',
        };
        if (error) {
          reject(new Error(
            command + ' thất bại: ' + (result.stderr.trim() || error.message)
          ));
          return;
        }
        resolve(result);
      }
    );
  });
}

function quoteIdentifier(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function quoteLiteral(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function sanitizeError(message: string, urls: string[]): string {
  return urls.reduce(
    (result, url) => result.split(url).join('[DATABASE_URL]'),
    message
  );
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
}

async function createOnlineBackup(onlineDatabaseUrl: string): Promise<string> {
  const backupDir = path.join(process.cwd(), 'backups', 'sync');
  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });

  const backupFile = path.join(
    backupDir,
    'online-before-sync-' + timestamp() + '.dump'
  );
  await runCommand(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--schema=public',
      '--file',
      backupFile,
    ],
    postgresCommandEnv(onlineDatabaseUrl)
  );
  await fs.chmod(backupFile, 0o600).catch(() => undefined);
  return path.relative(process.cwd(), backupFile);
}

async function updateOnlineSchema(onlineDatabaseUrl: string): Promise<void> {
  const prismaCli = path.join(
    process.cwd(),
    'node_modules',
    'prisma',
    'build',
    'index.js'
  );
  await fs.access(prismaCli).catch(() => {
    throw new Error('Không tìm thấy Prisma CLI. Hãy chạy npm install');
  });

  await runCommand(
    process.execPath,
    [
      prismaCli,
      'db',
      'push',
      '--schema',
      'prisma/schema.prisma',
      '--skip-generate',
      '--accept-data-loss',
    ],
    {
      DATABASE_URL: onlineDatabaseUrl,
      DIRECT_URL: onlineDatabaseUrl,
    }
  );
}

async function getTables(databaseUrl: string): Promise<string[]> {
  const { stdout } = await runCommand(
    'psql',
    [
      '-X',
      '-t',
      '-A',
      '-c',
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename;",
    ],
    postgresCommandEnv(databaseUrl)
  );

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countSql(tables: string[], prefix: string): string {
  return tables
    .map((table) =>
      `SELECT ${quoteLiteral(prefix)}, ${quoteLiteral(table)}, count(*)::text FROM public.${quoteIdentifier(table)}`
    )
    .join(' UNION ALL ');
}

function parseCounts(output: string, prefix: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split('|');
    if (parts.length !== 3 || parts[0] !== prefix) continue;
    const count = Number.parseInt(parts[2], 10);
    if (parts[1] && Number.isFinite(count)) {
      result.set(parts[1], count);
    }
  }
  return result;
}

async function getCounts(
  databaseUrl: string,
  tables: string[],
  prefix: string
): Promise<Map<string, number>> {
  const { stdout } = await runCommand(
    'psql',
    [
      '-X',
      '-t',
      '-A',
      '-F',
      '|',
      '-c',
      countSql(tables, prefix) + ';',
    ],
    postgresCommandEnv(databaseUrl)
  );
  return parseCounts(stdout, prefix);
}

function assertCountsSql(
  tables: string[],
  expectedCounts: Map<string, number>
): string {
  const checks = tables.map((table) => {
    const expected = expectedCounts.get(table);
    if (expected === undefined) {
      throw new Error('Không đọc được số dòng local của bảng ' + table);
    }

    return [
      `SELECT count(*) INTO actual_count FROM public.${quoteIdentifier(table)};`,
      `IF actual_count <> ${expected} THEN`,
      "  RAISE EXCEPTION 'SYNC_ROW_COUNT_MISMATCH: table=%, expected=%, actual=%', " +
        `${quoteLiteral(table)}, ${expected}, actual_count;`,
      'END IF;',
    ].join('\n');
  });

  return [
    'DO $ankhang_sync$',
    'DECLARE actual_count bigint;',
    'BEGIN',
    ...checks,
    'END',
    '$ankhang_sync$;',
  ].join('\n');
}

export async function POST() {
  const localDatabaseUrl =
    process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
  const onlineDatabaseUrl = process.env.SUPABASE_DIRECT_URL;

  if (!isPostgresUrl(localDatabaseUrl)) {
    return NextResponse.json(
      { error: 'Database local chưa được cấu hình đúng' },
      { status: 500 }
    );
  }
  if (!isPostgresUrl(onlineDatabaseUrl)) {
    return NextResponse.json(
      { error: 'SUPABASE_DIRECT_URL chưa được cấu hình đúng' },
      { status: 500 }
    );
  }
  if (localDatabaseUrl === onlineDatabaseUrl) {
    return NextResponse.json(
      { error: 'Database local và online không được trùng nhau' },
      { status: 400 }
    );
  }
  if (syncInProgress) {
    return NextResponse.json(
      { error: 'Một lượt đồng bộ khác đang chạy' },
      { status: 409 }
    );
  }

  let tempDir = '';
  let backupFile = '';
  syncInProgress = true;

  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ankhangpos-sync-'));
    const dumpFile = path.join(tempDir, 'local-data.sql');
    const restoreFile = path.join(tempDir, 'restore-online.sql');

    const tables = await getTables(localDatabaseUrl);
    if (tables.length === 0) {
      throw new Error('Không tìm thấy bảng dữ liệu nào trong database local');
    }

    const localCounts = await getCounts(
      localDatabaseUrl,
      tables,
      'LOCAL_COUNT'
    );
    const missingLocalCounts = tables.filter(
      (table) => !localCounts.has(table)
    );
    if (missingLocalCounts.length > 0) {
      throw new Error(
        'Không đọc được số dòng local ở các bảng: ' +
        missingLocalCounts.join(', ')
      );
    }

    // Backup online is mandatory before any schema or data change.
    backupFile = await createOnlineBackup(onlineDatabaseUrl);
    await updateOnlineSchema(onlineDatabaseUrl);

    const onlineTableList = await getTables(onlineDatabaseUrl);
    const onlineTables = new Set(onlineTableList);
    const localTables = new Set(tables);
    const missingTables = tables.filter((table) => !onlineTables.has(table));
    const extraTables = onlineTableList.filter((table) => !localTables.has(table));
    if (missingTables.length > 0) {
      throw new Error(
        'Database online thiếu bảng sau khi cập nhật schema: ' +
        missingTables.join(', ')
      );
    }
    if (extraTables.length > 0) {
      throw new Error(
        'Database online còn bảng không có ở local: ' + extraTables.join(', ')
      );
    }

    await runCommand(
      'pg_dump',
      [
        '--data-only',
        '--no-owner',
        '--no-acl',
        '--schema=public',
        '--exclude-table=public._prisma_migrations',
        '--file',
        dumpFile,
      ],
      postgresCommandEnv(localDatabaseUrl)
    );

    const tableList = tables
      .map((table) => 'public.' + quoteIdentifier(table))
      .join(', ');
    const dumpPath = dumpFile.replace(/\\/g, '/').replace(/'/g, "''");

    const circularConstraints = [
      ['products', 'products_blend_template_id_fkey'],
      ['blend_templates', 'blend_templates_output_product_id_fkey'],
    ];
    const deferConstraints = circularConstraints
      .map(([table, constraint]) =>
        `ALTER TABLE public.${quoteIdentifier(table)} ALTER CONSTRAINT ${quoteIdentifier(constraint)} DEFERRABLE INITIALLY IMMEDIATE;`
      )
      .join('\n');
    const restoreConstraints = circularConstraints
      .map(([table, constraint]) =>
        `ALTER TABLE public.${quoteIdentifier(table)} ALTER CONSTRAINT ${quoteIdentifier(constraint)} NOT DEFERRABLE;`
      )
      .join('\n');

    const restoreSql = [
      '\\set ON_ERROR_STOP on',
      'BEGIN;',
      deferConstraints,
      'SET CONSTRAINTS ALL DEFERRED;',
      'TRUNCATE TABLE ' + tableList + ' CASCADE;',
      "\\i '" + dumpPath + "'",
      assertCountsSql(tables, localCounts),
      'SET CONSTRAINTS ALL IMMEDIATE;',
      restoreConstraints,
      'COMMIT;',
      countSql(tables, 'ONLINE_COUNT') + ';',
    ].join('\n');

    await fs.writeFile(restoreFile, restoreSql, {
      encoding: 'utf8',
      mode: 0o600,
    });

    const { stdout, stderr } = await runCommand(
      'psql',
      [
        '-X',
        '-t',
        '-A',
        '-F',
        '|',
        '-f',
        restoreFile,
      ],
      postgresCommandEnv(onlineDatabaseUrl)
    );

    const onlineCounts = parseCounts(stdout, 'ONLINE_COUNT');
    const mismatches = tables.filter(
      (table) => localCounts.get(table) !== onlineCounts.get(table)
    );
    if (mismatches.length > 0) {
      throw new Error(
        'Số dòng online không khớp local ở các bảng: ' +
        mismatches.join(', ')
      );
    }

    const synced = tables.map((table) => ({
      table,
      count: onlineCounts.get(table) || 0,
    }));
    const totalRows = synced.reduce((sum, row) => sum + row.count, 0);
    const warnings = stderr
      .split(/\r?\n/)
      .filter((line) => /warning/i.test(line))
      .length;

    return NextResponse.json({
      success: true,
      message: 'Đồng bộ thành công ' + totalRows + ' dòng dữ liệu lên Supabase',
      tables: synced,
      totalRows,
      warnings,
      backupFile,
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    const message = sanitizeError(
      rawMessage,
      [localDatabaseUrl, onlineDatabaseUrl]
    );
    return NextResponse.json(
      {
        error: 'Đồng bộ thất bại: ' + message,
        backupFile: backupFile || undefined,
      },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
    syncInProgress = false;
  }
}
