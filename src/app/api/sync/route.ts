import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const execAsync = promisify(exec);

function getLocalDbConfig() {
  const localUrl = process.env.LOCAL_DATABASE_URL;
  if (!localUrl) throw new Error('LOCAL_DATABASE_URL chưa được cấu hình');

  try {
    const parsedUrl = new URL(localUrl);
    if (!['postgresql:', 'postgres:'].includes(parsedUrl.protocol)) {
      throw new Error('Protocol không hợp lệ');
    }

    return {
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      host: parsedUrl.hostname,
      port: parsedUrl.port || '5432',
      database: parsedUrl.pathname.replace(/^\//, ''),
    };
  } catch {
    throw new Error('LOCAL_DATABASE_URL không hợp lệ');
  }
}

function validateSupabaseUrl(url: string): boolean {
  return /^postgresql:\/\/[^;|&$`]+$/.test(url);
}

export async function POST() {
  const supabaseUrl = process.env.SUPABASE_DIRECT_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'SUPABASE_DIRECT_URL chưa được cấu hình' }, { status: 500 });
  }

  if (!validateSupabaseUrl(supabaseUrl)) {
    return NextResponse.json({ error: 'SUPABASE_DIRECT_URL không hợp lệ' }, { status: 500 });
  }

  let db;
  try {
    db = getLocalDbConfig();
  } catch {
    return NextResponse.json({ error: 'LOCAL_DATABASE_URL không hợp lệ hoặc chưa được cấu hình' }, { status: 500 });
  }

  const tmpDir = os.tmpdir();
  const dumpFile = path.join(tmpDir, 'sync_dump.sql');
  const scriptFile = path.join(tmpDir, 'sync_script.sql');

  try {
    // Bước 1: Dump data — credentials từ env
    const dumpCmd = `pg_dump -U ${db.user} -h ${db.host} -p ${db.port} -d ${db.database} --data-only --no-owner --no-acl --disable-triggers --schema=public -f "${dumpFile}"`;
    await execAsync(dumpCmd, { env: { ...process.env, PGPASSWORD: db.password } });

    // Bước 2: Lấy danh sách bảng
    const { stdout: tablesOut } = await execAsync(
      `psql -U ${db.user} -h ${db.host} -p ${db.port} -d ${db.database} -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"`,
      { env: { ...process.env, PGPASSWORD: db.password } }
    );
    const tables = tablesOut.trim().split(/\r?\n/).filter(Boolean);

    if (tables.length === 0) throw new Error('Không tìm thấy bảng nào');

    // Bước 3: Gộp tất cả lệnh thành 1 file
    const truncateSQL = tables.map(t => `TRUNCATE TABLE public."${t}" CASCADE;`).join('\n');
    const countQueries = tables.map(t => `SELECT '${t}' as t, count(*) as c FROM public."${t}"`).join(' UNION ALL ');
    const dumpFilePath = dumpFile.replace(/\\/g, '/');
    
    const combinedScript = `-- Xoa du lieu cu\n${truncateSQL}\n\n-- Khoi phuc du lieu\n\\set ON_ERROR_STOP off\n\\i '${dumpFilePath}'\n\\set ON_ERROR_STOP on\n\n-- Dem so luong\n${countQueries};`;
    await fs.writeFile(scriptFile, combinedScript, 'utf-8');

    // Bước 4: Mở 1 kết nối tới Supabase và chạy hết script
    let countOutput = '';
    let warnings = 0;
    try {
      const { stdout, stderr } = await execAsync(
        `psql "${supabaseUrl}" -t -A -f "${scriptFile}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      countOutput = stdout;
      warnings = stderr ? stderr.split('\n').filter(l => l.includes('ERROR') && !l.includes('schema') && !l.includes('auth.') && !l.includes('storage.')).length : 0;
    } catch (e: unknown) {
      const execErr = e as { stdout?: string };
      countOutput = execErr.stdout || '';
    }

    // Parse kết quả
    const lines = countOutput.trim().split(/\r?\n/).filter(Boolean);
    const synced = lines.filter(line => line.includes('|')).map(line => {
      const [table, count] = line.split('|');
      return { table: table.trim(), count: parseInt(count) };
    }).filter(r => !isNaN(r.count) && r.count > 0);

    const totalRows = synced.reduce((sum, r) => sum + r.count, 0);

    await Promise.all([ fs.unlink(dumpFile).catch(() => {}), fs.unlink(scriptFile).catch(() => {}) ]);

    return NextResponse.json({ 
      success: true, 
      message: `Đồng bộ thành công ${totalRows} dòng dữ liệu lên Supabase`, 
      tables: synced, 
      totalRows, 
      warnings 
    });
  } catch (error) {
    await Promise.all([ fs.unlink(dumpFile).catch(() => {}), fs.unlink(scriptFile).catch(() => {}) ]);
    const msg = error instanceof Error ? error.message : 'Lỗi không xác định';
    return NextResponse.json({ error: `Đồng bộ thất bại: ${msg}` }, { status: 500 });
  }
}
