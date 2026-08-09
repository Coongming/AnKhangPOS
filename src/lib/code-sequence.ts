import { Prisma } from '@prisma/client';

export const CODE_PADDING = {
  HD: 6,
  KH: 4,
  PN: 4,
  NV: 4,
  SP: 4,
  NCC: 4,
  TR: 4,
} as const;

export type CodePrefix = keyof typeof CODE_PADDING;

export function formatCode(prefix: CodePrefix, value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Giá trị mã ${prefix} không hợp lệ`);
  }
  return `${prefix}${String(value).padStart(CODE_PADDING[prefix], '0')}`;
}

export function normalizeCode(code: string, prefix: CodePrefix): string {
  const match = code.trim().match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
  if (!match) throw new Error(`Mã không hợp lệ: ${code}`);
  return formatCode(prefix, Number(match[1]));
}

/**
 * Tăng bộ đếm ngay trong transaction. PostgreSQL khóa đúng một dòng prefix,
 * vì vậy hai yêu cầu tạo đồng thời không thể nhận cùng một mã.
 */
export async function generateCodeInTx(
  tx: Prisma.TransactionClient,
  prefix: CodePrefix
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ currentValue: number }>>(Prisma.sql`
    INSERT INTO "code_sequences" ("prefix", "current_value", "updated_at")
    VALUES (${prefix}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("prefix") DO UPDATE
      SET "current_value" = "code_sequences"."current_value" + 1,
          "updated_at" = CURRENT_TIMESTAMP
    RETURNING "current_value" AS "currentValue"
  `);

  const currentValue = rows[0]?.currentValue;
  if (!currentValue) throw new Error(`Không thể sinh mã ${prefix}`);
  return formatCode(prefix, currentValue);
}
