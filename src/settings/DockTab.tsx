import { useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import { Monitor, Eye, EyeOff, Circle, Search, Shuffle, MonitorCheck, CalendarDays, Maximize2, Keyboard, Sparkles, RotateCcw, Download } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { SettingRow } from "./SettingRow";
import { Dropdown } from "./Dropdown";
import type { MonitorInfo, MonitorMode } from "./types";
import { usePerMonitor } from "./usePerMonitor";
import { useI18n } from "../i18n";

const START_ICON_PRESETS = [
  { key: "default", src: "/oryvia.png", label: "Oryvia" },
  { key: "windows", src: "/windows.png", label: "Windows" },
];

const startIconTileStyle = (active: boolean): CSSProperties => ({
  width: "48px",
  height: "48px",
  borderRadius: "12px",
  border: active ? "2px solid var(--nectar-accent, #007aff)" : "2px solid rgba(255,255,255,0.1)",
  background: active ? "rgba(0,122,255,0.15)" : "rgba(255,255,255,0.05)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "all 0.15s ease",
  padding: "6px",
  color: "rgba(255,255,255,0.5)",
});

interface DockTabProps {
  dockEnabled: boolean;
  toggleDock: () => void;
  dockMode: string;
  setDockModeValue: (mode: string) => void;
  dockPreviewEnabled: boolean;
  toggleDockPreview: () => void;
  dockSearchEnabled: boolean;
  toggleDockSearch: () => void;
  dockCalendarEnabled: boolean;
  toggleDockCalendar: () => void;
  dockIconOnly: boolean;
  toggleDockIconOnly: () => void;
  dockAdaptive: boolean;
  toggleDockAdaptive: () => void;
  startIcon: string;
  handleStartIconChange: (icon: string) => void;
  dockWinNumberEnabled: boolean;
  toggleDockWinNumber: () => void;
  dockMixedReorder: boolean;
  toggleDockMixedReorder: () => void;
  monitors: MonitorInfo[];
  dockMonitorMode: MonitorMode;
  setDockMonitorModeValue: (mode: MonitorMode) => void;
  dockMonitorId: string;
  setDockMonitorIdValue: (id: string) => void;
  dockModeByMonitor: Record<string, string>;
  setDockModeForMonitor: (monitorId: string, mode: string | null) => void;
  replaceDockModes: (next: Record<string, string>) => void;
}

export function DockTab({
  dockEnabled,
  toggleDock,
  dockMode,
  setDockModeValue,
  dockPreviewEnabled,
  toggleDockPreview,
  dockSearchEnabled,
  toggleDockSearch,
  dockCalendarEnabled,
  toggleDockCalendar,
  dockIconOnly,
  toggleDockIconOnly,
  dockAdaptive,
  toggleDockAdaptive,
  startIcon,
  handleStartIconChange,
  dockWinNumberEnabled,
  toggleDockWinNumber,
  dockMixedReorder,
  toggleDockMixedReorder,
  monitors,
  dockMonitorMode,
  setDockMonitorModeValue,
  dockMonitorId,
  setDockMonitorIdValue,
  dockModeByMonitor,
  setDockModeForMonitor,
  replaceDockModes,
}: DockTabProps) {
  const { t } = useI18n();
  const [syncingTaskbar, setSyncingTaskbar] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const handleImportTaskbar = async () => {
    if (syncingTaskbar) return;
    setSyncingTaskbar(true);
    setSyncFeedback(t("settings.dock.importTaskbar.syncing"));
    try {
      const res = await invoke<{ added_count: number; total_windows_pins: number }>("import_taskbar_pins_manual", { forceReimport: true });
      if (res && res.added_count > 0) {
        setSyncFeedback(t("settings.dock.importTaskbar.success", { count: res.added_count }));
      } else {
        setSyncFeedback(t("settings.dock.importTaskbar.alreadySynced"));
      }
    } catch (_) {
      setSyncFeedback(null);
    } finally {
      setSyncingTaskbar(false);
      setTimeout(() => setSyncFeedback(null), 3500);
    }
  };

  const perMonitor = usePerMonitor(dockMode, dockModeByMonitor, replaceDockModes, monitors);
  const multiMonitor = dockMonitorMode === "all" && monitors.length > 1;
  const showPerMonitor = multiMonitor && perMonitor.enabled;

  const handleStartIconUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      handleStartIconChange(`custom:${reader.result as string}`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <>
      <div className="setting-group-label">{t("settings.dock.group.dock")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Monitor}
          label={t("settings.dock.enable.label")}
          desc={t("settings.dock.enable.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={dockEnabled} onChange={toggleDock} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {dockEnabled && (
          <>
            {!showPerMonitor && (
              <SettingRow
                icon={dockMode === "fixed" ? EyeOff : Eye}
                label={t("settings.dock.behavior.label")}
                desc={t("settings.dock.behavior.desc")}
              >
                <Dropdown
                  value={dockMode}
                  onChange={setDockModeValue}
                  options={[
                    { value: "fixed", label: t("settings.dock.behavior.always") },
                    { value: "smart", label: t("settings.dock.behavior.smart") },
                    { value: "peek", label: t("settings.dock.behavior.auto") },
                  ]}
                />
              </SettingRow>
            )}

            <SettingRow
              icon={MonitorCheck}
              label={t("settings.dock.displayMode.label")}
              desc={t("settings.dock.displayMode.desc")}
            >
              <Dropdown
                value={dockMonitorMode}
                onChange={(v) => setDockMonitorModeValue(v as MonitorMode)}
                options={[
                  { value: "primary", label: t("settings.dock.displayMode.primary") },
                  { value: "all", label: t("settings.dock.displayMode.all") },
                  { value: "specific", label: t("settings.dock.displayMode.custom") },
                ]}
              />
            </SettingRow>

            {dockMonitorMode === "specific" && (
              <SettingRow
                icon={Monitor}
                label={t("settings.dock.targetMonitor.label")}
                desc={t("settings.dock.targetMonitor.desc")}
              >
                <Dropdown
                  value={dockMonitorId}
                  onChange={setDockMonitorIdValue}
                  placeholder={monitors.length === 0 ? t("common.loading") : undefined}
                  options={monitors.map((m) => ({
                    value: m.id,
                    label: `${m.label}${m.is_primary ? t("common.primarySuffix") : ""}`,
                  }))}
                />
              </SettingRow>
            )}

            {multiMonitor && (
              <SettingRow
                icon={Monitor}
                label={t("settings.dock.perMonitor.label")}
                desc={t("settings.dock.perMonitor.desc")}
              >
                <label className="toggle-switch">
                  <input type="checkbox" checked={perMonitor.enabled} onChange={perMonitor.toggle} />
                  <span className="slider"></span>
                </label>
              </SettingRow>
            )}

            {showPerMonitor && monitors.map((m) => (
              <SettingRow
                key={m.id}
                icon={Monitor}
                label={`${m.label}`}
                desc={m.is_primary ? t("settings.dock.displayMode.primary") : undefined}
              >
                <Dropdown
                  value={dockModeByMonitor[m.id] || dockMode}
                  onChange={(v) => setDockModeForMonitor(m.id, v)}
                  options={[
                    { value: "fixed", label: t("settings.dock.behavior.always") },
                    { value: "smart", label: t("settings.dock.behavior.smart") },
                    { value: "peek", label: t("settings.dock.behavior.auto") },
                  ]}
                />
              </SettingRow>
            ))}

            <SettingRow
              icon={Eye}
              label={t("settings.dock.preview.label")}
              desc={t("settings.dock.preview.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={dockPreviewEnabled} onChange={toggleDockPreview} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              icon={Search}
              label={t("settings.dock.search.label")}
              desc={t("settings.dock.search.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={dockSearchEnabled} onChange={toggleDockSearch} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              icon={CalendarDays}
              label={t("settings.dock.calendar.label")}
              desc={t("settings.dock.calendar.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={dockCalendarEnabled} onChange={toggleDockCalendar} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              icon={Circle}
              label={t("settings.dock.iconOnly.label")}
              desc={t("settings.dock.iconOnly.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={dockIconOnly} onChange={toggleDockIconOnly} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              icon={Keyboard}
              label={t("settings.dock.winNumber.label")}
              desc={t("settings.dock.winNumber.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={dockWinNumberEnabled} onChange={toggleDockWinNumber} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            {dockMode === "fixed" && (
              <SettingRow
                icon={Maximize2}
                label={t("settings.dock.adaptive.label")}
                desc={t("settings.dock.adaptive.desc")}
              >
                <label className="toggle-switch">
                  <input type="checkbox" checked={dockAdaptive} onChange={toggleDockAdaptive} />
                  <span className="slider"></span>
                </label>
              </SettingRow>
            )}

            <SettingRow
              icon={Shuffle}
              label={t("settings.dock.mixedReorder.label")}
              desc={t("settings.dock.mixedReorder.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={dockMixedReorder} onChange={toggleDockMixedReorder} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              icon={Download}
              label={t("settings.dock.importTaskbar.label")}
              desc={t("settings.dock.importTaskbar.desc")}
            >
              <button
                className="setting-action-btn"
                onClick={handleImportTaskbar}
                disabled={syncingTaskbar}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  background: syncingTaskbar ? "rgba(0, 122, 255, 0.2)" : "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "var(--nectar-text, #fff)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: syncingTaskbar ? "wait" : "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {syncFeedback || t("settings.dock.importTaskbar.btn")}
              </button>
            </SettingRow>

            <div className="setting-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
                <div className="setting-icon-bg">
                  <Sparkles size={14} strokeWidth={1.5} />
                </div>
                <div className="setting-info">
                  <span className="setting-label">{t("settings.dock.startIcon.label")}</span>
                  <span className="setting-desc">{t("settings.dock.startIcon.desc")}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", paddingLeft: "34px" }}>
                {START_ICON_PRESETS.map((icon) => (
                  <div
                    key={icon.key}
                    onClick={() => handleStartIconChange(icon.key)}
                    style={startIconTileStyle(startIcon === icon.key)}
                    title={icon.label}
                  >
                    <img src={icon.src} alt={icon.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
                  </div>
                ))}
                <div
                  onClick={() => document.getElementById("start-icon-file-input")?.click()}
                  style={startIconTileStyle(startIcon.startsWith("custom:"))}
                  title={t("settings.dock.startIcon.custom")}
                >
                  {startIcon.startsWith("custom:") ? (
                    <img
                      src={startIcon.replace("custom:", "")}
                      alt="Custom"
                      style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "8px" }}
                      draggable={false}
                    />
                  ) : (
                    <span style={{ fontSize: "20px" }}>+</span>
                  )}
                </div>
                {startIcon !== "default" && (
                  <div onClick={() => handleStartIconChange("default")} style={startIconTileStyle(false)} title={t("common.refresh")}>
                    <RotateCcw size={18} strokeWidth={1.5} />
                  </div>
                )}
              </div>
              <input
                id="start-icon-file-input"
                type="file"
                accept=".png,.ico,.jpg,.jpeg,.svg,.bmp"
                style={{ display: "none" }}
                onChange={handleStartIconUpload}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
