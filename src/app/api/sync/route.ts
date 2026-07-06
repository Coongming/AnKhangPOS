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

  const tmpDir = os.tmpdir();
  const dumpFile = path.join(tmpDir, 'sync_dump.sql');
  const scriptFile = path.join(tmpDir, 'sync_script.sql');

  try {
    // Bước 1: Dump data (Chỉ chạy ở local nên cực nhanh)
    const dumpCmd = `pg_dump -U ankhang -h localhost -d ankhangpos --data-only --no-owner --no-acl --disable-triggers --schema=public -f "${dumpFile}"`;
    await execAsync(dumpCmd, { env: { ...process.env, PGPASSWORD: 'ankhang123' } });

    // Bước 2: Lấy danh sách bảng cũng từ LOCAL (Không gọi sang Sing, không tốn thời gian)
    // Lưu ý: Đòi hỏi Local DB và Supabase DB phải có cấu trúc bảng giống hệt nhau (ta đã xóa bảng thừa lúc nãy)
    const { stdout: tablesOut } = await execAsync(
      `psql -U ankhang -h localhost -d ankhangpos -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"`,
      { env: { ...process.env, PGPASSWORD: 'ankhang123' } }
    );
    const tables = tablesOut.trim().split(/\r?\n/).filter(Boolean);

    if (tables.length === 0) throw new Error('Không tìm thấy bảng nào');

    // Bước 3: GỘP TẤT CẢ LỆNH THÀNH 1 FILE DUY NHẤT ĐỂ TIẾT KIỆM KẾT NỐI
    const truncateSQL = tables.map(t => `TRUNCATE TABLE public."${t}" CASCADE;`).join('\n');
    const countQueries = tables.map(t => `SELECT '${t}' as t, count(*) as c FROM public."${t}"`).join(' UNION ALL ');
    const dumpFilePath = dumpFile.replace(/\\/g, '/'); // Chuẩn hóa đường dẫn cho psql \i
    
    const combinedScript = `-- Xoa du lieu cu\n${truncateSQL}\n\n-- Khoi phuc du lieu\n\\set ON_ERROR_STOP off\n\\i '${dumpFilePath}'\n\\set ON_ERROR_STOP on\n\n-- Dem so luong\n${countQueries};`;
    await fs.writeFile(scriptFile, combinedScript, 'utf-8');

    // Bước 4: MỞ ĐÚNG 1 KẾT NỐI TỚI SUPABASE VÀ CHẠY HẾT SCRIPT (Siêu tốc)
    let countOutput = '';
    let warnings = 0;
    try {
      const { stdout, stderr } = await execAsync(
        `psql "${supabaseUrl}" -t -A -f "${scriptFile}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      countOutput = stdout;
      warnings = stderr ? stderr.split('\n').filter(l => l.includes('ERROR') && !l.includes('schema') && !l.includes('auth.') && !l.includes('storage.')).length : 0;
    } catch (e: any) {
      countOutput = e.stdout || '';
    }

    // Parse kết quả đếm dòng
    const lines = countOutput.trim().split(/\r?\n/).filter(Boolean);
    const synced = lines.filter(line => line.includes('|')).map(line => {
      const [table, count] = line.split('|');
      return { table: table.trim(), count: parseInt(count) };
    }).filter(r => !isNaN(r.count) && r.count > 0);

    const totalRows = synced.reduce((sum, r) => sum + r.count, 0);

    // Cleanup rác
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
