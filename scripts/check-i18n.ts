import { translations } from "../src/i18n/translations";
import * as fs from "fs";
import * as path from "path";

const targetFiles = [
  path.resolve(__dirname, "../src/components/ConnectionsView.tsx"),
  path.resolve(__dirname, "../src/components/PanelOrderConfig.tsx"),
  path.resolve(__dirname, "../src/components/DualClock.tsx"),
  path.resolve(__dirname, "../src/settings/NotchTab.tsx"),
];
const keysInView = new Set<string>();
const regex = /(?:^|[^a-zA-Z0-9_])t\(\s*["']([^"']+)["']/g;

for (const filePath of targetFiles) {
  const content = fs.readFileSync(filePath, "utf-8");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    keysInView.add(match[1]);
  }
}

// Also check labelKey/descKey references in PanelOrderConfig
const panelOrderContent = fs.readFileSync(path.resolve(__dirname, "../src/components/PanelOrderConfig.tsx"), "utf-8");
const propKeyRegex = /(?:labelKey|descKey):\s*["']([^"']+)["']/g;
let propMatch: RegExpExecArray | null;
while ((propMatch = propKeyRegex.exec(panelOrderContent)) !== null) {
  keysInView.add(propMatch[1]);
}

// Also check reason codes like `reasons.${code}` in ConnectionsView
const reasonCodes = [
  "connections.reasons.device_remained_connected",
  "connections.reasons.device_out_of_range",
  "connections.reasons.device_not_paired",
  "connections.reasons.access_denied",
  "connections.reasons.radio_off",
  "connections.reasons.driver_error",
  "connections.reasons.timeout",
  "connections.reasons.status_unknown",
  "connections.reasons.pairing_rejected",
  "connections.reasons.pairing_auth_failed",
  "connections.reasons.pairing_timeout",
  "connections.reasons.pairing_ceremony_unsupported",
  "connections.reasons.pairing_failed",
  "connections.reasons.device_cannot_pair",
  "connections.reasons.pairing_auth_not_allowed",
  "connections.reasons.pairing_protection_unmet",
  "connections.reasons.pairing_already_exists",
  "connections.reasons.pairing_in_progress",
  "connections.reasons.pairing_canceled",
  "connections.reasons.pairing_rejected_by_handler",
  "connections.reasons.pairing_no_supported_profiles",
  "connections.reasons.pairing_has_association",
  "connections.reasons.pairing_invalid_data",
  "connections.reasons.pairing_too_many_connections",
  "connections.reasons.pairing_hardware_failure",
  "connections.reasons.pairing_not_supported",
  "connections.reasons.device_already_paired",
  "connections.reasons.device_not_available",
  "connections.reasons.pairing_pin_required",
  "connections.reasons.pairing_capability_unknown",
  "connections.reasons.pairing_unsupported_direct",
  "connections.pairBtnTooltip",
  "connections.reasons.phone_managed_by_windows",
  "connections.reasons.hid_managed_by_windows",
  "connections.reasons.connecting_pending",
  "connections.reasons.disconnecting_pending",
  "connections.reasons.outcome_unknown",
  "connections.reasons.wifi_rollback_failed",
  "connections.reasons.wifi_connect_failed",
  "connections.reasons.wifi_association_failed",
  "connections.reasons.wifi_adapter_disabled",
  "connections.reasons.wifi_access_denied",
];
for (const rc of reasonCodes) {
  keysInView.add(rc);
}

console.log(`Checking ${keysInView.size} distinct keys in translations...`);

let hasError = false;
for (const lang of ["en", "vi"] as const) {
  const dict = translations[lang] as Record<string, string>;
  const missing: string[] = [];
  for (const key of keysInView) {
    if (!(key in dict) || dict[key] === undefined || dict[key] === "") {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    console.error(`[ERROR] Missing or empty keys in '${lang}':`);
    for (const m of missing) {
      console.error(`  - ${m}`);
    }
    hasError = true;
  } else {
    console.log(`[PASS] All keys present in '${lang}'.`);
  }
}

// Check consistency between EN and VI (all keys in EN should be in VI, and vice versa)
const enKeys = new Set(Object.keys(translations.en));
const viKeys = new Set(Object.keys(translations.vi));

const onlyInEn = [...enKeys].filter((k) => !viKeys.has(k));
const onlyInVi = [...viKeys].filter((k) => !enKeys.has(k));

if (onlyInEn.length > 0) {
  console.warn(`[WARN] Keys only in EN (${onlyInEn.length}):`, onlyInEn.slice(0, 10));
}
if (onlyInVi.length > 0) {
  console.warn(`[WARN] Keys only in VI (${onlyInVi.length}):`, onlyInVi.slice(0, 10));
}

if (hasError) {
  process.exit(1);
} else {
  console.log("[SUCCESS] i18n check completed successfully!");
}
