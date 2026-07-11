/**
 * Input validation helpers — không dùng thư viện bên ngoài.
 * Dùng cho tất cả API routes nhận số liệu từ client.
 */

export function validateNumber(value: unknown, fieldName: string): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(num)) {
    throw new ValidationError(`${fieldName} không hợp lệ (phải là số)`);
  }
  return num;
}

export function validatePositiveNumber(value: unknown, fieldName: string): number {
  const num = validateNumber(value, fieldName);
  if (num < 0) {
    throw new ValidationError(`${fieldName} không được âm`);
  }
  return num;
}

export function validatePositiveInt(value: unknown, fieldName: string): number {
  const num = validateNumber(value, fieldName);
  if (num < 0 || !Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} phải là số nguyên dương`);
  }
  return num;
}

export function validateRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName} không được để trống`);
  }
  return value.trim();
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}
