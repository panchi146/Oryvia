import { Globe, Power, Download, Clock, BatteryWarning, RefreshCw, LogOut } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Dropdown } from "./Dropdown";
import { useI18n } from "../i18n";

interface GeneralTabProps {
  language: "en" | "vi";
  handleLanguageChange: (lang: string) => void;
  autostart: boolean;
  toggleAutostart: () => void;
  timeFormat24h: boolean;
  toggleTimeFormat24h: () => void;
  showUpdateIndicator: boolean;
  toggleUpdateIndicator: () => void;
  lowBatteryThreshold: number;
  handleThresholdChange: (val: number) => void;
  restartNectar: () => void;
  quitNectar: () => void;
}

export function GeneralTab({
  language,
  handleLanguageChange,
  autostart,
  toggleAutostart,
  timeFormat24h,
  toggleTimeFormat24h,
  showUpdateIndicator,
  toggleUpdateIndicator,
  lowBatteryThreshold,
  handleThresholdChange,
  restartNectar,
  quitNectar,
}: GeneralTabProps) {
  const { t } = useI18n();

  return (
    <>
      <div className="setting-group-label">{t("settings.general.group.language")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Globe}
          label={t("settings.general.language.label")}
          desc={t("settings.general.language.desc")}
          divider={false}
        >
          <Dropdown
            value={language}
            onChange={handleLanguageChange}
            options={[
              { value: "en", label: t("settings.general.language.en") },
              { value: "vi", label: t("settings.general.language.vi") },
            ]}
          />
        </SettingRow>
      </div>

      <div className="setting-group-label">{t("settings.general.group.system")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Power}
          label={t("settings.general.autostart.label")}
          desc={t("settings.general.autostart.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={autostart} onChange={toggleAutostart} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow
          icon={Download}
          label={t("settings.general.updateIndicator.label")}
          desc={t("settings.general.updateIndicator.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={showUpdateIndicator} onChange={toggleUpdateIndicator} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow
          icon={Clock}
          label={t("settings.general.timeFormat.label")}
          desc={t("settings.general.timeFormat.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={timeFormat24h} onChange={toggleTimeFormat24h} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow
          icon={BatteryWarning}
          label={t("settings.general.lowBattery.label")}
          desc={t("settings.general.lowBattery.desc", { threshold: lowBatteryThreshold })}
          divider={false}
        >
          <input
            type="range"
            min="5"
            max="50"
            step="5"
            value={lowBatteryThreshold}
            onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
            className="settings-slider"
          />
        </SettingRow>
      </div>

      <div className="setting-group-label">{t("settings.general.group.app")}</div>
      <div className="setting-group">
        <SettingRow
          icon={RefreshCw}
          label={t("settings.general.restart.label")}
          desc={t("settings.general.restart.desc")}
          action
          onClick={restartNectar}
        />
        <SettingRow
          icon={LogOut}
          label={t("settings.general.quit.label")}
          desc={t("settings.general.quit.desc")}
          action
          danger
          onClick={quitNectar}
          divider={false}
        />
      </div>
    </>
  );
}
