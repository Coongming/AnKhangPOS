import { getStartOfDayVN } from './utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export const CUSTOMER_RECENCY_GROUPS = [
  { value: 'month_1', label: 'Trong 1 tháng' },
  { value: 'month_2', label: 'Trên 1 đến 2 tháng' },
  { value: 'month_3', label: 'Trên 2 đến 3 tháng' },
  { value: 'month_4', label: 'Trên 3 đến 4 tháng' },
] as const;

export type CustomerRecency = typeof CUSTOMER_RECENCY_GROUPS[number]['value'] | 'older' | 'never';
export type CustomerRecencyFilter = CustomerRecency | 'all';
export type CustomerStatusFilter = 'all' | 'active' | 'inactive';

export function getRecencyMonthStart(asOf: Date, monthsAgo: number): Date {
  const vnDate = new Date(getStartOfDayVN(asOf).getTime() + VN_OFFSET_MS);
  const year = vnDate.getUTCFullYear();
  const month = vnDate.getUTCMonth() - monthsAgo;
  // Clamp the day before subtracting months (31 March -> 28/29 February).
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(vnDate.getUTCDate(), lastDay)) - VN_OFFSET_MS);
}

export function getCustomerRecency(lastPurchaseDate: Date | null, asOf: Date): {
  recency: CustomerRecency;
  daysSinceLastPurchase: number | null;
} {
  if (!lastPurchaseDate) return { recency: 'never', daysSinceLastPurchase: null };

  const purchaseDay = getStartOfDayVN(lastPurchaseDate).getTime();
  const daysSinceLastPurchase = Math.round((getStartOfDayVN(asOf).getTime() - purchaseDay) / DAY_MS);
  if (daysSinceLastPurchase < 0) throw new Error('Purchase date is after the report date');

  const group = CUSTOMER_RECENCY_GROUPS.find((_, index) =>
    purchaseDay >= getRecencyMonthStart(asOf, index + 1).getTime(),
  );
  return { recency: group?.value ?? 'older', daysSinceLastPurchase };
}

interface CustomerWithRecency {
  code: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  recency: CustomerRecency;
}

export function selectCustomersByRecency<T extends CustomerWithRecency>(
  customers: T[],
  search: string,
  status: CustomerStatusFilter,
  recency: CustomerRecencyFilter,
) {
  const query = search.trim().toLocaleLowerCase('vi-VN');
  const matching = customers.filter(customer => {
    if (status === 'active' && !customer.isActive) return false;
    if (status === 'inactive' && customer.isActive) return false;
    return !query || [customer.code, customer.name, customer.phone ?? '']
      .some(value => value.toLocaleLowerCase('vi-VN').includes(query));
  });
  const counts: Record<CustomerRecencyFilter, number> = {
    all: matching.length, month_1: 0, month_2: 0, month_3: 0, month_4: 0, older: 0, never: 0,
  };
  for (const customer of matching) counts[customer.recency]++;
  return {
    counts,
    customers: recency === 'all' ? matching : matching.filter(customer => customer.recency === recency),
  };
}
