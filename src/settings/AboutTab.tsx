import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, RefreshCw, FileDown, Upload, RotateCcw, Trash2, ClipboardCopy, FolderOpen, Crosshair, Image as ImageIcon } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { useI18n } from "../i18n";
import { openUrl } from "@tauri-apps/plugin-opener";

interface AboutTabProps {
  appVersion: string;
  autoUpdate: boolean;
  toggleAutoUpdate: () => void;
  updateStatus: string;
  updateVersion: string;
  checkForUpdates: () => void;
  installUpdate: () => void;
  exportStatus: string;
  importStatus: string;
  handleExportSettings: () => void;
  handleImportSettings: () => void;
  resetStatus: string;
  handleResetSettings: () => void;
  uninstallStatus: string;
  uninstallError?: string;
  handleUninstallNectar: () => void;
}

export function AboutTab({
  appVersion,
  autoUpdate,
  toggleAutoUpdate,
  updateStatus,
  updateVersion,
  checkForUpdates,
  installUpdate,
  exportStatus,
  importStatus,
  handleExportSettings,
  handleImportSettings,
  resetStatus,
  handleResetSettings,
  uninstallStatus,
  uninstallError,
  handleUninstallNectar,
}: AboutTabProps) {
  const { t } = useI18n();
  const [diagStatus, setDiagStatus] = useState<"idle" | "working" | "copied" | "error">("idle");
  const [hitboxLogging, setHitboxLogging] = useState(false);
  const [iconStatus, setIconStatus] = useState<"idle" | "working" | "done" | "error">("idle");

  useEffect(() => {
    invoke<boolean>("get_hitbox_logging").then(setHitboxLogging).catch(() => {});
  }, []);

  const copyDiagnostics = async () => {
    setDiagStatus("working");
    try {
      const report = await invoke<string>("get_diagnostics");
      await navigator.clipboard.writeText(report);
      setDiagStatus("copied");
    } catch {
      setDiagStatus("error");
    }
    setTimeout(() => setDiagStatus("idle"), 2500);
  };

  const refreshIconCache = async () => {
    setIconStatus("working");
    try {
      await invoke("clear_icon_cache");
      setIconStatus("done");
    } catch {
      setIconStatus("error");
    }
    setTimeout(() => setIconStatus("idle"), 2500);
  };

  const getIconCacheLabel = () => {
    if (iconStatus === "working") return t("settings.about.icons.working");
    if (iconStatus === "done") return t("settings.about.icons.done");
    if (iconStatus === "error") return t("settings.about.icons.error");
    return t("settings.about.icons.btn");
  };

  const toggleHitboxLogging = () => {
    const next = !hitboxLogging;
    setHitboxLogging(next);
    invoke("set_hitbox_logging", { enabled: next }).catch(() => setHitboxLogging(!next));
  };

  const getDiagLabel = () => {
    if (diagStatus === "working") return t("settings.about.diagnostics.working");
    if (diagStatus === "copied") return t("settings.about.diagnostics.done");
    if (diagStatus === "error") return t("settings.about.diagnostics.error");
    return t("settings.about.diagnostics.btn");
  };

  const getUpdateLabel = () => {
    switch (updateStatus) {
      case "checking":
        return t("settings.about.update.checking");
      case "available":
        return t("settings.about.update.available", { version: updateVersion });
      case "uptodate":
        return t("settings.about.update.uptodate", { version: appVersion });
      case "downloading":
        return t("overlay.update.downloading", { percent: "" });
      case "installing":
        return t("overlay.update.installing");
      case "unconfigured":
        return t("settings.about.update.unconfigured");
      case "error":
        return t("settings.about.update.error");
      default:
        return t("settings.about.update.check");
    }
  };

  const getUpdateDesc = () =>
    updateStatus === "unconfigured"
      ? t("settings.about.update.unconfigured.desc")
      : updateStatus === "available"
      ? t("settings.about.update.available", { version: updateVersion })
      : t("settings.about.version", { version: appVersion || "—" });

  const getPillLabel = () => {
    switch (updateStatus) {
      case "checking":
        return t("settings.about.update.checking");
      case "available":
        return t("settings.about.update.available", { version: updateVersion });
      case "uptodate":
        return t("settings.about.update.uptodate", { version: appVersion });
      case "downloading":
        return t("overlay.update.downloading", { percent: "" });
      case "installing":
        return t("overlay.update.installing");
      case "unconfigured":
        return t("settings.about.update.unconfigured");
      case "error":
        return t("settings.about.update.error");
      default:
        return t("settings.about.update.check");
    }
  };

  const pillBusy = ["checking", "downloading", "installing"].includes(updateStatus);

  const getExportLabel = () => {
    if (exportStatus === "exporting") return t("common.loading");
    if (exportStatus === "success") return t("settings.about.export.done");
    return t("settings.about.export.btn");
  };

  const getImportLabel = () => {
    if (importStatus === "importing") return t("common.loading");
    if (importStatus === "success") return t("settings.about.import.done");
    return t("settings.about.import.btn");
  };

  const getResetLabel = () => {
    if (resetStatus === "resetting") return t("common.loading");
    if (resetStatus === "confirm") return t("settings.about.reset.confirm");
    return t("settings.about.reset.btn");
  };

  const getResetDesc = () =>
    resetStatus === "confirm" ? t("settings.about.reset.confirm") : t("settings.about.reset.desc");

  const getUninstallLabel = () => {
    if (uninstallStatus === "uninstalling") return t("settings.about.uninstall.working");
    if (uninstallStatus === "confirm") return t("settings.about.uninstall.confirm");
    if (uninstallStatus === "error") return t("settings.about.uninstall.error", { error: uninstallError || "" });
    return t("settings.about.uninstall.btn");
  };

  const getUninstallDesc = () => {
    if (uninstallStatus === "confirm") return t("settings.about.uninstall.confirm");
    if (uninstallStatus === "error") return uninstallError || t("settings.about.uninstall.error", { error: "" });
    return t("settings.about.uninstall.desc");
  };

  return (
    <div className="about-tab-container">
      <div className="about-header">
        <img src="/oryvia.png" className="about-logo" alt="Oryvia Logo" />
        <h1 className="about-title">{t("settings.about.title")}</h1>
        <p className="about-version">{t("settings.about.version", { version: appVersion || "—" })}</p>
        <button
          className={`update-pill update-pill--${updateStatus || "idle"}`}
          disabled={pillBusy}
          onClick={() => (updateStatus === "available" ? installUpdate() : checkForUpdates())}
        >
          {getPillLabel()}
        </button>
      </div>

      <div className="setting-group-label">{t("settings.about.group.updates")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Download}
          label={t("settings.about.autoUpdate.label")}
          desc={t("settings.about.autoUpdate.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={autoUpdate} onChange={toggleAutoUpdate} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow
          icon={RefreshCw}
          label={getUpdateLabel()}
          desc={getUpdateDesc()}
          action
          divider={false}
          onClick={() => (updateStatus === "available" ? installUpdate() : checkForUpdates())}
        />
      </div>

      <div className="setting-group-label setting-group-label--spaced">
        {t("settings.about.group.maintenance")}
      </div>
      <div className="setting-group">
        <SettingRow
          icon={FileDown}
          label={getExportLabel()}
          desc={t("settings.about.export.desc")}
          action
          onClick={handleExportSettings}
        />
        <SettingRow
          icon={Upload}
          label={getImportLabel()}
          desc={t("settings.about.import.desc")}
          action
          onClick={handleImportSettings}
        />
        <SettingRow
          icon={ImageIcon}
          label={getIconCacheLabel()}
          desc={t("settings.about.icons.desc")}
          action
          onClick={refreshIconCache}
        />
        <SettingRow
          icon={RotateCcw}
          label={getResetLabel()}
          desc={getResetDesc()}
          action
          divider={false}
          danger={resetStatus === "confirm"}
          onClick={handleResetSettings}
        />
      </div>

      <div className="setting-group-label setting-group-label--spaced">
        {t("settings.about.diagnostics.label")}
      </div>
      <div className="setting-group">
        <SettingRow
          icon={ClipboardCopy}
          label={getDiagLabel()}
          desc={t("settings.about.diagnostics.desc")}
          action
          onClick={copyDiagnostics}
        />
        <SettingRow
          icon={FolderOpen}
          label={t("settings.about.openLogs.label")}
          desc={t("settings.about.openLogs.desc")}
          action
          onClick={() => invoke("open_log_folder").catch(() => {})}
        />
        <SettingRow
          icon={Crosshair}
          label={t("settings.about.hitbox.label")}
          desc={t("settings.about.hitbox.desc")}
          divider={false}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={hitboxLogging} onChange={toggleHitboxLogging} />
            <span className="slider"></span>
          </label>
        </SettingRow>
      </div>

      <div className="setting-group-label setting-group-label--spaced">
        {t("settings.about.uninstall.label")}
      </div>
      <div className="setting-group">
        <SettingRow
          icon={Trash2}
          label={getUninstallLabel()}
          desc={getUninstallDesc()}
          action
          divider={false}
          danger={uninstallStatus === "confirm" || uninstallStatus === "error"}
          onClick={handleUninstallNectar}
        />
      </div>

      <div className="about-footer">
        <p>
          {t("settings.about.forkCredit")}{" "}
          <a
            href="https://github.com/panchi146"
            style={{ color: "inherit", textDecoration: "none" }}
            onClick={(event) => {
              event.preventDefault();
              void openUrl("https://github.com/panchi146").catch(console.error);
            }}
          >
            Panchi146
          </a>
        </p>
      </div>
    </div>
  );
}
