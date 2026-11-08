import { Volume2, Sun, ArrowLeftToLine, ArrowRightToLine, Mouse, ArrowLeftRight } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { useI18n } from "../i18n";

interface OverlaysTabProps {
  volumeOverlayEnabled: boolean;
  toggleVolumeOverlay: () => void;
  volumeEdgeEnabled: boolean;
  toggleVolumeEdge: () => void;
  brightnessOverlayEnabled: boolean;
  toggleBrightnessOverlay: () => void;
  brightnessEdgeEnabled: boolean;
  toggleBrightnessEdge: () => void;
  mouseWheelEnabled: boolean;
  toggleMouseWheel: () => void;
  swapHudSides: boolean;
  toggleSwapHudSides: () => void;
}

export function OverlaysTab({
  volumeOverlayEnabled,
  toggleVolumeOverlay,
  volumeEdgeEnabled,
  toggleVolumeEdge,
  brightnessOverlayEnabled,
  toggleBrightnessOverlay,
  brightnessEdgeEnabled,
  toggleBrightnessEdge,
  mouseWheelEnabled,
  toggleMouseWheel,
  swapHudSides,
  toggleSwapHudSides,
}: OverlaysTabProps) {
  const { t } = useI18n();

  return (
    <>
      <div className="setting-group-label">{t("settings.overlays.group.overlays")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Volume2}
          label={t("settings.overlays.volume.label")}
          desc={t("settings.overlays.volume.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={volumeOverlayEnabled} onChange={toggleVolumeOverlay} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {volumeOverlayEnabled && (
          <SettingRow
            icon={swapHudSides ? ArrowRightToLine : ArrowLeftToLine}
            label={t("settings.overlays.volumeEdge.label")}
            desc={swapHudSides ? t("settings.overlays.volumeEdge.descRight") : t("settings.overlays.volumeEdge.descLeft")}
          >
            <label className="toggle-switch">
              <input type="checkbox" checked={volumeEdgeEnabled} onChange={toggleVolumeEdge} />
              <span className="slider"></span>
            </label>
          </SettingRow>
        )}

        <SettingRow
          icon={Sun}
          label={t("settings.overlays.brightness.label")}
          desc={t("settings.overlays.brightness.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={brightnessOverlayEnabled} onChange={toggleBrightnessOverlay} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {brightnessOverlayEnabled && (
          <SettingRow
            icon={swapHudSides ? ArrowLeftToLine : ArrowRightToLine}
            label={t("settings.overlays.brightnessEdge.label")}
            desc={swapHudSides ? t("settings.overlays.brightnessEdge.descLeft") : t("settings.overlays.brightnessEdge.descRight")}
          >
            <label className="toggle-switch">
              <input type="checkbox" checked={brightnessEdgeEnabled} onChange={toggleBrightnessEdge} />
              <span className="slider"></span>
            </label>
          </SettingRow>
        )}

        <SettingRow
          icon={Mouse}
          label={t("settings.overlays.mouseWheel.label")}
          desc={t("settings.overlays.mouseWheel.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={mouseWheelEnabled} onChange={toggleMouseWheel} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow
          icon={ArrowLeftRight}
          label={t("settings.overlays.swapSides.label")}
          desc={t("settings.overlays.swapSides.desc")}
          divider={false}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={swapHudSides} onChange={toggleSwapHudSides} />
            <span className="slider"></span>
          </label>
        </SettingRow>
      </div>
    </>
  );
}
