/**
 * Botanical Lab — Timezone & Date Formatting Utilities
 *
 * All system event timestamps are stored in UTC in PostgreSQL and rendered
 * in Asia/Kolkata (IST, UTC+05:30) across user interfaces.
 */

export const TIMEZONE_IST = 'Asia/Kolkata';

/**
 * Formats a date/timestamp into 12-hour IST format with seconds (e.g. "05:07:35 PM").
 */
export function formatTimeIST(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '--:--:--';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '--:--:--';

  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TIMEZONE_IST,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch (e) {
    console.error('Time formatting error:', e);
    return date.toLocaleTimeString();
  }
}

/**
 * Formats a date/timestamp into short 12-hour IST format (e.g. "05:07 PM").
 */
export function formatShortTimeIST(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '--:--';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '--:--';

  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TIMEZONE_IST,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch (e) {
    console.error('Time formatting error:', e);
    return date.toLocaleTimeString();
  }
}

/**
 * Formats a date/timestamp into 24-hour IST format (e.g. "17:07:35").
 */
export function format24hTimeIST(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '--:--:--';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '--:--:--';

  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE_IST,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch (e) {
    console.error('Time formatting error:', e);
    return date.toLocaleTimeString();
  }
}

/**
 * Formats a date/timestamp into full IST datetime (e.g. "20 Sep 2026, 05:07 PM").
 */
export function formatDateTimeIST(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '--';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '--';

  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: TIMEZONE_IST,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch (e) {
    console.error('Datetime formatting error:', e);
    return date.toLocaleString();
  }
}
