import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbUrl = process.env.DATABASE_URL || '';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `ankhangpos-backup-${timestamp}.sql`;

    // Run pg_dump
    const sql = execSync(`pg_dump "${dbUrl}" --no-owner --no-acl`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

    return new NextResponse(sql, {
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json({ error: 'Lỗi tạo backup' }, { status: 500 });
  }
}
