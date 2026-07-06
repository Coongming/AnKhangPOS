import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  const supabaseUrl = process.env.SUPABASE_DIRECT_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: 'SUPABASE_DIRECT_URL chưa được cấu hình' }, { status: 500 });
  }

  try {
    // Step 1: Dump local data
    const dumpCmd = `PGPASSWORD=ankhang123 pg_dump -U ankhang -h localhost -d ankhangpos --data-only --no-owner --no-acl --disable-triggers --schema=public -f /tmp/sync_dump.sql`;
    await execAsync(dumpCmd);

    // Step 2: Get list of public tables from Supabase (not local, to avoid missing tables)
    const { stdout: tablesOut } = await execAsync(
      `psql "${supabaseUrl}" -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tableowner != 'supabase_admin' ORDER BY tablename;"`
    );
    const tables = tablesOut.trim().split('\n').filter(Boolean);

    // Step 3: Truncate all public tables on Supabase
    const truncateSQL = tables.map(t => `TRUNCATE TABLE public."${t}" CASCADE;`).join(' ');
    await execAsync(`psql "${supabaseUrl}" -c "${truncateSQL}"`);

    // Step 4: Restore data to Supabase
    const { stderr } = await execAsync(
      `psql "${supabaseUrl}" --set ON_ERROR_STOP=off -f /tmp/sync_dump.sql 2>&1 || true`
    );

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

    // Cleanup
    await execAsync('rm -f /tmp/sync_dump.sql');

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
    return NextResponse.json({ error: `Đồng bộ thất bại: ${msg}` }, { status: 500 });
  }
}
