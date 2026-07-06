import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export async function POST() {
  const supabaseUrl = process.env.SUPABASE_DIRECT_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'SUPABASE_DIRECT_URL chưa được cấu hình' }, { status: 500 });
  }

  const dumpFile = path.join(os.tmpdir(), 'sync_dump.sql');

  try {
    // Step 1: Dump local data
    // Dùng tùy chọn env thay vì PGPASSWORD=... trong chuỗi lệnh để tương thích Windows
    const dumpCmd = `pg_dump -U ankhang -h localhost -d ankhangpos --data-only --no-owner --no-acl --disable-triggers --schema=public -f "${dumpFile}"`;
    await execAsync(dumpCmd, { env: { ...process.env, PGPASSWORD: 'ankhang123' } });

    // Step 2: Get list of public tables from Supabase (not local, to avoid missing tables)
    const { stdout: tablesOut } = await execAsync(
      `psql "${supabaseUrl}" -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tableowner != 'supabase_admin' ORDER BY tablename;"`
    );
    const tables = tablesOut.trim().split('\n').filter(Boolean);

    // Step 3: Truncate all public tables on Supabase
    const truncateSQL = tables.map(t => `TRUNCATE TABLE public."${t}" CASCADE;`).join(' ');
    await execAsync(`psql "${supabaseUrl}" -c "${truncateSQL}"`);

    // Step 4: Restore data to Supabase
    let stderr = '';
    try {
      const result = await execAsync(
        `psql "${supabaseUrl}" --set ON_ERROR_STOP=off -f "${dumpFile}"`
      );
      stderr = result.stderr;
    } catch (e: any) {
      // psql trả về mã lỗi do warning khôi phục schema, ta cứ lưu lại stderr
      stderr = e.stderr || e.message;
    }

    // Step 5: Count rows synced
    const countQueries = tables.map(t => `SELECT '${t}' as t, count(*) as c FROM public."${t}"`).join(' UNION ALL ');
    const { stdout: countOut } = await execAsync(
      `psql "${supabaseUrl}" -t -A -c "${countQueries}"`
    );

    const synced = countOut.trim().split('\n').filter(Boolean).map(line => {
      const [table, count] = line.split('|');
      return { table, count: parseInt(count) };
    }).filter(r => r.count > 0);

    const totalRows = synced.reduce((sum, r) => sum + r.count, 0);

    // Cleanup (cross-platform)
    try {
      await fs.unlink(dumpFile);
    } catch (e) {
      // Bỏ qua lỗi nếu file không tồn tại
    }

    // Filter warnings (ignore Supabase internal schema errors)
    const warnings = stderr
      ? stderr.split('\n').filter(l => l.includes('ERROR') && !l.includes('schema') && !l.includes('auth.') && !l.includes('storage.')).length
      : 0;

    return NextResponse.json({
      success: true,
      message: `Đồng bộ thành công ${totalRows} dòng dữ liệu lên Supabase`,
      tables: synced,
      totalRows,
      warnings,
    });
  } catch (error) {
    console.error('Sync error:', error);
    const msg = error instanceof Error ? error.message : 'Lỗi không xác định';
    
    // Cleanup if failed
    try {
      await fs.unlink(dumpFile);
    } catch (e) {}

    return NextResponse.json({ error: `Đồng bộ thất bại: ${msg}` }, { status: 500 });
  }
}
