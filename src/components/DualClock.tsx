import { useEffect, useState, useMemo } from "react";
import { Globe } from "lucide-react";
import { useI18n } from "../i18n";

export interface TimezoneOption {
  value: string;
  labelEn: string;
  labelVi: string;
  shortEn: string;
  shortVi: string;
}

export const DEFAULT_DUAL_CLOCK_TIMEZONE = "Asia/Tokyo";

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "UTC", labelEn: "UTC — Coordinated Universal Time", labelVi: "UTC — Giờ Phối hợp Quốc tế", shortEn: "UTC", shortVi: "UTC" },
  { value: "Asia/Ho_Chi_Minh", labelEn: "Ho Chi Minh City / Hanoi (ICT)", labelVi: "TP.HCM / Hà Nội (ICT)", shortEn: "VN", shortVi: "Việt Nam" },
  { value: "Asia/Bangkok", labelEn: "Bangkok (ICT)", labelVi: "Bangkok (ICT)", shortEn: "BKK", shortVi: "Bangkok" },
  { value: "Asia/Singapore", labelEn: "Singapore (SGT)", labelVi: "Singapore (SGT)", shortEn: "SGP", shortVi: "Singapore" },
  { value: "Asia/Tokyo", labelEn: "Tokyo (JST)", labelVi: "Tokyo (JST)", shortEn: "TYO", shortVi: "Tokyo" },
  { value: "Asia/Seoul", labelEn: "Seoul (KST)", labelVi: "Seoul (KST)", shortEn: "SEL", shortVi: "Seoul" },
  { value: "Asia/Shanghai", labelEn: "Shanghai / Beijing (CST)", labelVi: "Thượng Hải / Bắc Kinh (CST)", shortEn: "SHA", shortVi: "Bắc Kinh" },
  { value: "Asia/Hong_Kong", labelEn: "Hong Kong (HKT)", labelVi: "Hồng Kông (HKT)", shortEn: "HKG", shortVi: "Hồng Kông" },
  { value: "Asia/Taipei", labelEn: "Taipei (CST)", labelVi: "Đài Bắc (CST)", shortEn: "TPE", shortVi: "Đài Bắc" },
  { value: "Asia/Kolkata", labelEn: "Mumbai / New Delhi (IST)", labelVi: "Mumbai / New Delhi (IST)", shortEn: "IST", shortVi: "Ấn Độ" },
  { value: "Asia/Dubai", labelEn: "Dubai (GST)", labelVi: "Dubai (GST)", shortEn: "DXB", shortVi: "Dubai" },
  { value: "Europe/London", labelEn: "London (GMT/BST)", labelVi: "London (GMT/BST)", shortEn: "LON", shortVi: "London" },
  { value: "Europe/Paris", labelEn: "Paris (CET/CEST)", labelVi: "Paris (CET/CEST)", shortEn: "PAR", shortVi: "Paris" },
  { value: "Europe/Berlin", labelEn: "Berlin (CET/CEST)", labelVi: "Berlin (CET/CEST)", shortEn: "BER", shortVi: "Berlin" },
  { value: "Europe/Moscow", labelEn: "Moscow (MSK)", labelVi: "Moscow (MSK)", shortEn: "MOW", shortVi: "Moscow" },
  { value: "America/New_York", labelEn: "New York (EST/EDT)", labelVi: "New York (EST/EDT)", shortEn: "NYC", shortVi: "New York" },
  { value: "America/Chicago", labelEn: "Chicago (CST/CDT)", labelVi: "Chicago (CST/CDT)", shortEn: "CHI", shortVi: "Chicago" },
  { value: "America/Denver", labelEn: "Denver (MST/MDT)", labelVi: "Denver (MST/MDT)", shortEn: "DEN", shortVi: "Denver" },
  { value: "America/Los_Angeles", labelEn: "Los Angeles (PST/PDT)", labelVi: "Los Angeles (PST/PDT)", shortEn: "LAX", shortVi: "Los Angeles" },
  { value: "America/Toronto", labelEn: "Toronto (EST/EDT)", labelVi: "Toronto (EST/EDT)", shortEn: "YYZ", shortVi: "Toronto" },
  { value: "America/Sao_Paulo", labelEn: "São Paulo (BRT)", labelVi: "São Paulo (BRT)", shortEn: "GRU", shortVi: "São Paulo" },
  { value: "Australia/Sydney", labelEn: "Sydney (AEST/AEDT)", labelVi: "Sydney (AEST/AEDT)", shortEn: "SYD", shortVi: "Sydney" },
  { value: "Pacific/Auckland", labelEn: "Auckland (NZST/NZDT)", labelVi: "Auckland (NZST/NZDT)", shortEn: "AKL", shortVi: "Auckland" },
];

/**
 * Validates an IANA timezone string using Intl.DateTimeFormat.
 * Falls back safely to DEFAULT_DUAL_CLOCK_TIMEZONE ("Asia/Tokyo") if invalid.
 */
export function normalizeTimezone(tz: unknown): string {
  if (typeof tz !== "string" || !tz.trim()) {
    return DEFAULT_DUAL_CLOCK_TIMEZONE;
  }
  const trimmed = tz.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_DUAL_CLOCK_TIMEZONE;
  }
}

function getDatePartsInZone(date: Date, timeZone?: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();

  for (const p of parts) {
    if (p.type === "year") year = parseInt(p.value, 10);
    if (p.type === "month") month = parseInt(p.value, 10);
    if (p.type === "day") day = parseInt(p.value, 10);
  }
  return { year, month, day };
}

export interface DualClockData {
  localTime: string;
  secondTime: string;
  secondZoneId: string;
  secondCityShort: string;
  dayDiff: -1 | 0 | 1;
}

/**
 * Pure helper to compute Local Time, Second Timezone Time, and Day Offset (-1, 0, +1).
 * Exported for deterministic unit testing across DST and midnight boundaries.
 */
export function computeDualClockData(
  now: Date,
  targetTimeZone: unknown,
  use24Hour: boolean,
  lang: "en" | "vi" = "en",
  localTimeZoneOverride?: string
): DualClockData {
  const validZone = normalizeTimezone(targetTimeZone);
  const locale = lang === "vi" ? "vi-VN" : "en-US";

  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24Hour,
  };

  const localTime = new Intl.DateTimeFormat(locale, {
    ...timeOpts,
    ...(localTimeZoneOverride ? { timeZone: localTimeZoneOverride } : {}),
  }).format(now);

  const secondTime = new Intl.DateTimeFormat(locale, {
    ...timeOpts,
    timeZone: validZone,
  }).format(now);

  const localParts = getDatePartsInZone(now, localTimeZoneOverride);
  const secondParts = getDatePartsInZone(now, validZone);

  const localUtcMidnight = Date.UTC(localParts.year, localParts.month - 1, localParts.day);
  const secondUtcMidnight = Date.UTC(secondParts.year, secondParts.month - 1, secondParts.day);
  const diffDays = Math.round((secondUtcMidnight - localUtcMidnight) / 86400000);
  const dayDiff: -1 | 0 | 1 = diffDays > 0 ? 1 : diffDays < 0 ? -1 : 0;

  const known = TIMEZONE_OPTIONS.find((opt) => opt.value === validZone);
  let secondCityShort = known ? (lang === "vi" ? known.shortVi : known.shortEn) : "";
  if (!secondCityShort) {
    const slashIdx = validZone.lastIndexOf("/");
    secondCityShort = (slashIdx >= 0 ? validZone.slice(slashIdx + 1) : validZone).replace(/_/g, " ");
  }

  return {
    localTime,
    secondTime,
    secondZoneId: validZone,
    secondCityShort,
    dayDiff,
  };
}

interface DualClockProps {
  timezone: string;
  timeFormat24h: boolean;
  standalone?: boolean;
}

export function DualClock({ timezone, timeFormat24h, standalone = false }: DualClockProps) {
  const { t, language } = useI18n();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(
    () => computeDualClockData(now, timezone, timeFormat24h, language),
    [now, timezone, timeFormat24h, language]
  );

  const dayBadge =
    data.dayDiff === 1
      ? t("clock.dual.tomorrow")
      : data.dayDiff === -1
        ? t("clock.dual.yesterday")
        : t("clock.dual.today");

  return (
    <div className={`dual-clock-strip ${standalone ? "standalone" : ""}`} role="region" aria-label={t("settings.notch.dualClock.label")}>
      <div className="dual-clock-cell local">
        <span className="dual-clock-label">{t("clock.dual.local")}</span>
        <span className="dual-clock-time">{data.localTime}</span>
      </div>

      <div className="dual-clock-divider" aria-hidden="true" />

      <div className="dual-clock-cell remote">
        <div className="dual-clock-remote-meta">
          <Globe size={10} strokeWidth={2.2} className="dual-clock-globe" />
          <span className="dual-clock-label">{data.secondCityShort}</span>
          {data.dayDiff !== 0 && (
            <span className={`dual-clock-day-badge ${data.dayDiff > 0 ? "ahead" : "behind"}`}>
              {dayBadge}
            </span>
          )}
        </div>
        <span className="dual-clock-time">{data.secondTime}</span>
      </div>
    </div>
  );
}
