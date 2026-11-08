import { Palette, Droplet, Contrast, Droplets, Sun, Square, Maximize2 } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Dropdown } from "./Dropdown";
import { useI18n } from "../i18n";

interface AppearanceTabProps {
  themeMode: string;
  handleThemeModeChange: (mode: string) => void;
  themeColor: string;
  handleThemeColorChange: (color: string) => void;
  themeOpacity: number;
  handleOpacityChange: (val: number) => void;
  themeSaturation: number;
  handleSaturationChange: (val: number) => void;
  themeBrightness: number;
  handleBrightnessChange: (val: number) => void;
  cornersEnabled: boolean;
  toggleCorners: () => void;
  scale: number;
  handleScaleChange: (val: number) => void;
}

export function AppearanceTab({
  themeMode,
  handleThemeModeChange,
  themeColor,
  handleThemeColorChange,
  themeOpacity,
  handleOpacityChange,
  themeSaturation,
  handleSaturationChange,
  themeBrightness,
  handleBrightnessChange,
  cornersEnabled,
  toggleCorners,
  scale,
  handleScaleChange,
}: AppearanceTabProps) {
  const { t } = useI18n();
  const showCustomColor = themeMode === "custom";
  const showAdvancedSliders = themeMode === "custom" || themeMode === "adaptive";

  return (
    <>
      <div className="setting-group-label">{t("settings.appearance.group.theme")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Palette}
          label={t("settings.appearance.themeMode.label")}
          desc={t("settings.appearance.themeMode.desc")}
        >
          <Dropdown
            value={themeMode}
            onChange={handleThemeModeChange}
            options={[
              { value: "dark", label: t("settings.appearance.themeMode.dark") },
              { value: "light", label: t("settings.appearance.themeMode.light") },
              { value: "custom", label: t("settings.appearance.themeMode.custom") },
              { value: "adaptive", label: t("settings.appearance.themeMode.adaptive") },
            ]}
          />
        </SettingRow>

        {showCustomColor && (
          <SettingRow
            icon={Droplet}
            label={t("settings.appearance.customColor.label")}
            desc={t("settings.appearance.customColor.desc")}
          >
            <div className="color-picker-row">
              <input
                type="color"
                value={themeColor}
                onChange={(e) => handleThemeColorChange(e.target.value)}
                className="color-picker-input"
              />
              <span className="color-picker-label">{themeColor.toUpperCase()}</span>
            </div>
          </SettingRow>
        )}

        <SettingRow
          icon={Contrast}
          label={t("settings.appearance.opacity.label")}
          desc={t("settings.appearance.opacity.desc", { percent: Math.round(themeOpacity * 100) })}
          divider={showAdvancedSliders}
        >
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={themeOpacity}
            onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
            className="settings-slider"
          />
        </SettingRow>

        {showAdvancedSliders && (
          <>
            <SettingRow
              icon={Droplets}
              label={t("settings.appearance.saturation.label")}
              desc={t("settings.appearance.saturation.desc", { percent: Math.round(themeSaturation * 100) })}
            >
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.02"
                value={themeSaturation}
                onChange={(e) => handleSaturationChange(parseFloat(e.target.value))}
                className="settings-slider"
              />
            </SettingRow>

            <SettingRow
              icon={Sun}
              label={t("settings.appearance.brightness.label")}
              desc={t("settings.appearance.brightness.desc", { percent: Math.round(themeBrightness * 100) })}
              divider={false}
            >
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.02"
                value={themeBrightness}
                onChange={(e) => handleBrightnessChange(parseFloat(e.target.value))}
                className="settings-slider"
              />
            </SettingRow>
          </>
        )}
      </div>

      <div className="setting-group-label">{t("settings.appearance.group.layout")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Square}
          label={t("settings.appearance.corners.label")}
          desc={t("settings.appearance.corners.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={cornersEnabled} onChange={toggleCorners} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow
          icon={Maximize2}
          label={t("settings.appearance.scale.label")}
          desc={t("settings.appearance.scale.desc")}
          divider={false}
        >
          <div className="scale-button-container">
            <button
              className="scale-adjust-btn"
              onClick={() => handleScaleChange(Math.max(0.7, scale - 0.05))}
              disabled={scale <= 0.7}
            >
              -
            </button>
            <span className="scale-display-value">{Math.round(scale * 100)}%</span>
            <button
              className="scale-adjust-btn"
              onClick={() => handleScaleChange(Math.min(1.5, scale + 0.05))}
              disabled={scale >= 1.5}
            >
              +
            </button>
          </div>
        </SettingRow>
      </div>
    </>
  );
}
