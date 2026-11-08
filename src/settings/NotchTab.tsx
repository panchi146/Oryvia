import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PanelTop,
  Calendar,
  Music,
  Minimize2,
  LayoutList,
  Sparkles,
  Circle,
  CloudSun,
  X,
  Monitor,
  MonitorCheck,
  CloudCog,
  ChevronRight,
  Hourglass,
  Timer,
  BellRing,
  MousePointerClick,
  Clock,
  MoveHorizontal,
  Gauge,
  ArrowLeftRight,
  Activity,
  Zap,
  RotateCcw,
  Check,
} from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Dropdown } from "./Dropdown";
import { useCaldav } from "../hooks/useCaldav";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig, MonitorInfo, MonitorMode } from "./types";
import { usePerMonitor } from "./usePerMonitor";
import { usePopoverPosition } from "./usePopoverPosition";
import { useI18n } from "../i18n";

interface NotchTabProps {
  notchMode: string;
  setNotchModeValue: (mode: string) => void;
  monitors: MonitorInfo[];
  notchMonitorMode: MonitorMode;
  setNotchMonitorModeValue: (mode: MonitorMode) => void;
  notchMonitorId: string;
  setNotchMonitorIdValue: (id: string) => void;
  notchModeByMonitor: Record<string, string>;
  setNotchModeForMonitor: (monitorId: string, mode: string | null) => void;
  replaceNotchModes: (next: Record<string, string>) => void;
  calendarEnabled: boolean;
  toggleCalendar: () => void;
  timerEnabled: boolean;
  toggleTimerEnabled: () => void;
  timerSoundEnabled: boolean;
  toggleTimerSound: () => void;
  stopwatchEnabled: boolean;
  toggleStopwatchEnabled: () => void;
  musicModeEnabled: boolean;
  toggleMusicMode: () => void;
  musicCompactNotch: boolean;
  toggleMusicCompactNotch: () => void;
  mediaLayout: "classic" | "compact";
  toggleMediaLayout: (layout: "classic" | "compact") => void;
  mediaAmbienceEnabled: boolean;
  toggleAmbience: () => void;
  mediaCompactGlowEnabled: boolean;
  toggleCompactGlow: () => void;
  weatherEnabled: boolean;
  toggleWeather: () => void;
  tempUnitFahrenheit: boolean;
  toggleTempUnit: () => void;
  cityName: string;
  setCityName: (name: string) => void;
  citySearchResults: Array<{ name: string; country: string; latitude: number; longitude: number }>;
  showCityDropdown: boolean;
  setShowCityDropdown: (show: boolean) => void;
  selectCity: (city: { name: string; country: string; latitude: number; longitude: number }) => void;
  handleCityClear: () => void;
  statusWidgets: WidgetConfig;
  handleWidgetsChange: (config: WidgetConfig) => void;
  hasBattery: boolean;
  onOpenCalendarSync: () => void;
  notchExpandOnHover: boolean;
  toggleNotchExpandOnHover: () => void;
  notchHoverDelay: number;
  handleNotchHoverDelayChange: (val: number) => void;
  notchCollapseDelay: number;
  handleNotchCollapseDelayChange: (val: number) => void;
  notchHitboxMargin: number;
  handleNotchHitboxMarginChange: (val: number) => void;
  notchScrollSensitivity: "low" | "normal" | "high";
  handleNotchScrollSensitivityChange: (val: "low" | "normal" | "high") => void;
  notchCollapsedWidth: number;
  handleNotchCollapsedWidthChange: (val: number) => void;
  notchSpringBounciness: number;
  handleNotchSpringBouncinessChange: (val: number) => void;
  notchAnimationSpeed: number;
  handleNotchAnimationSpeedChange: (val: number) => void;
  notchReduceMotion: boolean;
  toggleNotchReduceMotion: () => void;
  resetNotchInteractionSettings: () => void;
}

export function NotchTab({
  notchMode,
  setNotchModeValue,
  monitors,
  notchMonitorMode,
  setNotchMonitorModeValue,
  notchMonitorId,
  setNotchMonitorIdValue,
  notchModeByMonitor,
  setNotchModeForMonitor,
  replaceNotchModes,
  calendarEnabled,
  toggleCalendar,
  timerEnabled,
  toggleTimerEnabled,
  timerSoundEnabled,
  toggleTimerSound,
  stopwatchEnabled,
  toggleStopwatchEnabled,
  musicModeEnabled,
  toggleMusicMode,
  musicCompactNotch,
  toggleMusicCompactNotch,
  mediaLayout,
  toggleMediaLayout,
  mediaAmbienceEnabled,
  toggleAmbience,
  mediaCompactGlowEnabled,
  toggleCompactGlow,
  weatherEnabled,
  toggleWeather,
  tempUnitFahrenheit,
  toggleTempUnit,
  cityName,
  setCityName,
  citySearchResults,
  showCityDropdown,
  setShowCityDropdown,
  selectCity,
  handleCityClear,
  statusWidgets,
  handleWidgetsChange,
  hasBattery,
  onOpenCalendarSync,
  notchExpandOnHover,
  toggleNotchExpandOnHover,
  notchHoverDelay,
  handleNotchHoverDelayChange,
  notchCollapseDelay,
  handleNotchCollapseDelayChange,
  notchHitboxMargin,
  handleNotchHitboxMarginChange,
  notchScrollSensitivity,
  handleNotchScrollSensitivityChange,
  notchCollapsedWidth,
  handleNotchCollapsedWidthChange,
  notchSpringBounciness,
  handleNotchSpringBouncinessChange,
  notchAnimationSpeed,
  handleNotchAnimationSpeedChange,
  notchReduceMotion,
  toggleNotchReduceMotion,
  resetNotchInteractionSettings,
}: NotchTabProps) {
  const { t } = useI18n();
  const [resetFeedback, setResetFeedback] = useState(false);
  const caldav = useCaldav();
  const sources = (caldav.account ? 1 : 0) + caldav.links.length;
  const perMonitor = usePerMonitor(notchMode, notchModeByMonitor, replaceNotchModes, monitors);
  const multiMonitor = notchMonitorMode === "all" && monitors.length > 1;
  const showPerMonitor = multiMonitor && perMonitor.enabled;

  const cityInputRef = useRef<HTMLDivElement>(null);
  const cityMenuRef = useRef<HTMLDivElement>(null);
  const isCityDropdownOpen = Boolean(showCityDropdown && citySearchResults.length > 0);

  const { style: cityStyle, placement: cityPlacement, portalRoot } = usePopoverPosition(
    cityInputRef,
    cityMenuRef,
    {
      open: isCityDropdownOpen,
      align: "stretch",
      offset: 4,
      maxHeightCap: 180,
      flip: true,
    }
  );

  return (
    <>
      <div className="setting-group-label">{t("settings.notch.group.notch")}</div>
      <div className="setting-group">
        {!showPerMonitor && (
          <SettingRow
            icon={PanelTop}
            label={t("settings.notch.behavior.label")}
            desc={t("settings.notch.behavior.desc")}
          >
            <Dropdown
              value={notchMode}
              onChange={setNotchModeValue}
              options={[
                { value: "fixed", label: t("settings.notch.behavior.fixed") },
                { value: "smart", label: t("settings.notch.behavior.autohide") },
              ]}
            />
          </SettingRow>
        )}

        <SettingRow
          icon={MonitorCheck}
          label={t("settings.notch.displayMode.label")}
          desc={t("settings.notch.displayMode.desc")}
        >
          <Dropdown
            value={notchMonitorMode}
            onChange={(v) => setNotchMonitorModeValue(v as MonitorMode)}
            options={[
              { value: "primary", label: t("settings.notch.displayMode.primary") },
              { value: "all", label: t("settings.notch.displayMode.all") },
              { value: "specific", label: t("settings.notch.displayMode.custom") },
            ]}
          />
        </SettingRow>

        {notchMonitorMode === "specific" && (
          <SettingRow
            icon={Monitor}
            label={t("settings.notch.targetMonitor.label")}
            desc={t("settings.notch.targetMonitor.desc")}
          >
            <Dropdown
              value={notchMonitorId}
              onChange={setNotchMonitorIdValue}
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
            label={t("settings.notch.perMonitor.label")}
            desc={t("settings.notch.perMonitor.desc")}
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
            desc={m.is_primary ? t("settings.notch.displayMode.primary") : undefined}
          >
            <Dropdown
              value={notchModeByMonitor[m.id] || notchMode}
              onChange={(v) => setNotchModeForMonitor(m.id, v)}
              options={[
                { value: "fixed", label: t("settings.notch.behavior.fixed") },
                { value: "smart", label: t("settings.notch.behavior.autohide") },
              ]}
            />
          </SettingRow>
        ))}

        <SettingRow
          icon={Calendar}
          label={t("settings.notch.calendar.label")}
          desc={t("settings.notch.calendar.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={calendarEnabled} onChange={toggleCalendar} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {calendarEnabled && (
          <SettingRow
            icon={CloudCog}
            label={t("settings.notch.syncSources.label")}
            desc={
              sources
                ? t("settings.notch.syncSources.descConnected", { count: sources, s: sources === 1 ? "" : "s" })
                : t("settings.notch.syncSources.descDisconnected")
            }
            action
            onClick={onOpenCalendarSync}
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </SettingRow>
        )}

        <SettingRow
          icon={Hourglass}
          label={t("settings.notch.timer.label")}
          desc={t("settings.notch.timer.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={timerEnabled} onChange={toggleTimerEnabled} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {timerEnabled && (
          <SettingRow
            icon={BellRing}
            label={t("settings.notch.timerSound.label")}
            desc={t("settings.notch.timerSound.desc")}
          >
            <label className="toggle-switch">
              <input type="checkbox" checked={timerSoundEnabled} onChange={toggleTimerSound} />
              <span className="slider"></span>
            </label>
          </SettingRow>
        )}

        <SettingRow
          icon={Timer}
          label={t("settings.notch.stopwatch.label")}
          desc={t("settings.notch.stopwatch.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={stopwatchEnabled} onChange={toggleStopwatchEnabled} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow
          icon={Music}
          label={t("settings.notch.musicMode.label")}
          desc={t("settings.notch.musicMode.desc")}
        >
          <label className="toggle-switch">
            <input type="checkbox" checked={musicModeEnabled} onChange={toggleMusicMode} />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {musicModeEnabled && (
          <>
            <SettingRow
              icon={Minimize2}
              label={t("settings.notch.compactNotch.label")}
              desc={t("settings.notch.compactNotch.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={musicCompactNotch} onChange={toggleMusicCompactNotch} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              icon={LayoutList}
              label={t("settings.notch.mediaLayout.label")}
              desc={t("settings.notch.mediaLayout.desc")}
            >
              <div className="unit-toggle-minimal wide">
                <span className={mediaLayout === "classic" ? "active" : ""} onClick={() => toggleMediaLayout("classic")}>
                  {t("settings.notch.mediaLayout.classic")}
                </span>
                <span className={mediaLayout === "compact" ? "active" : ""} onClick={() => toggleMediaLayout("compact")}>
                  {t("settings.notch.mediaLayout.compact")}
                </span>
              </div>
            </SettingRow>

            <SettingRow
              icon={Sparkles}
              label={t("settings.notch.ambientGlow.label")}
              desc={t("settings.notch.ambientGlow.desc")}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={mediaAmbienceEnabled} onChange={toggleAmbience} />
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow
              icon={Circle}
              label={t("settings.notch.compactGlow.label")}
              desc={t("settings.notch.compactGlow.desc")}
              divider={false}
            >
              <label className="toggle-switch">
                <input type="checkbox" checked={mediaCompactGlowEnabled} onChange={toggleCompactGlow} />
                <span className="slider"></span>
              </label>
            </SettingRow>
          </>
        )}
      </div>

      <div className="setting-group-label">{t("settings.notch.group.weather")}</div>
      <div className="setting-group">
        <SettingRow
          icon={CloudSun}
          label={t("settings.notch.weather.label")}
          desc={cityName || t("settings.notch.city.desc")}
        >
          <div className="weather-controls">
            <div className="unit-toggle-minimal" onClick={toggleTempUnit}>
              <span className={!tempUnitFahrenheit ? "active" : ""}>°C</span>
              <span className={tempUnitFahrenheit ? "active" : ""}>°F</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={weatherEnabled} onChange={toggleWeather} />
              <span className="slider"></span>
            </label>
          </div>
        </SettingRow>

        {weatherEnabled && (
          <div className="manual-city-input">
            <div className="city-input-row" ref={cityInputRef}>
              <input
                type="text"
                placeholder={t("settings.notch.city.placeholder")}
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && citySearchResults.length > 0) {
                    e.preventDefault();
                    selectCity(citySearchResults[0]);
                  }
                  if (e.key === "Escape") {
                    setShowCityDropdown(false);
                  }
                }}
                onBlur={() => setTimeout(() => setShowCityDropdown(false), 200)}
              />
              {cityName && (
                <button
                  className="city-clear-btn"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleCityClear();
                  }}
                  title={t("common.clear")}
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              )}
            </div>
            {isCityDropdownOpen &&
              portalRoot &&
              createPortal(
                <div
                  ref={cityMenuRef}
                  className={`city-dropdown city-dropdown--${cityPlacement}`}
                  style={cityStyle}
                >
                  {citySearchResults.map((city) => (
                    <button
                      key={`${city.name}-${city.latitude}`}
                      className="city-dropdown-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectCity(city);
                      }}
                    >
                      <span className="city-dropdown-name">{city.name}</span>
                      <span className="city-dropdown-country">{city.country}</span>
                    </button>
                  ))}
                </div>,
                portalRoot
              )}
          </div>
        )}
      </div>

      <div className="setting-group-label">{t("settings.notch.group.widgets")}</div>
      <div className="setting-group">
        <StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange} hasBattery={hasBattery} />
      </div>

      <div className="setting-group-label">{t("settings.notch.group.interaction")}</div>
      <div className="setting-group">
        {/* 1. Expand on hover */}
        <SettingRow
          label={t("settings.notch.expandOnHover.label")}
          desc={t("settings.notch.expandOnHover.desc")}
          icon={MousePointerClick}
        >
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notchExpandOnHover}
              onChange={toggleNotchExpandOnHover}
            />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {/* 2. Hover delay */}
        <SettingRow
          label={t("settings.notch.hoverDelay.label")}
          desc={t("settings.notch.hoverDelay.desc")}
          icon={Clock}
        >
          <div className="setting-slider-group">
            <span className="setting-slider-value">{notchHoverDelay}ms</span>
            <input
              type="range"
              min="0"
              max="500"
              step="25"
              value={notchHoverDelay}
              onChange={(e) => handleNotchHoverDelayChange(Number(e.target.value))}
              className="settings-slider"
            />
          </div>
        </SettingRow>

        {/* 3. Collapse delay */}
        <SettingRow
          label={t("settings.notch.collapseDelay.label")}
          desc={t("settings.notch.collapseDelay.desc")}
          icon={Clock}
        >
          <div className="setting-slider-group">
            <span className="setting-slider-value">{notchCollapseDelay}ms</span>
            <input
              type="range"
              min="0"
              max="800"
              step="50"
              value={notchCollapseDelay}
              onChange={(e) => handleNotchCollapseDelayChange(Number(e.target.value))}
              className="settings-slider"
            />
          </div>
        </SettingRow>

        {/* 4. Hitbox margin */}
        <SettingRow
          label={t("settings.notch.hitboxMargin.label")}
          desc={t("settings.notch.hitboxMargin.desc")}
          icon={MoveHorizontal}
        >
          <div className="setting-slider-group">
            <span className="setting-slider-value">{notchHitboxMargin}px</span>
            <input
              type="range"
              min="0"
              max="16"
              step="2"
              value={notchHitboxMargin}
              onChange={(e) => handleNotchHitboxMarginChange(Number(e.target.value))}
              className="settings-slider"
            />
          </div>
        </SettingRow>

        {/* 5. Scroll sensitivity */}
        <SettingRow
          label={t("settings.notch.scrollSensitivity.label")}
          desc={t("settings.notch.scrollSensitivity.desc")}
          icon={Gauge}
        >
          <Dropdown
            value={notchScrollSensitivity}
            onChange={(val) => handleNotchScrollSensitivityChange(val as "low" | "normal" | "high")}
            options={[
              { value: "low", label: t("settings.notch.scrollSensitivity.low") },
              { value: "normal", label: t("settings.notch.scrollSensitivity.normal") },
              { value: "high", label: t("settings.notch.scrollSensitivity.high") },
            ]}
          />
        </SettingRow>

        {/* 6. Collapsed width */}
        <SettingRow
          label={t("settings.notch.collapsedWidth.label")}
          desc={t("settings.notch.collapsedWidth.desc")}
          icon={ArrowLeftRight}
        >
          <div className="setting-slider-group">
            <span className="setting-slider-value">{notchCollapsedWidth}px</span>
            <input
              type="range"
              min="110"
              max="220"
              step="5"
              value={notchCollapsedWidth}
              onChange={(e) => handleNotchCollapsedWidthChange(Number(e.target.value))}
              className="settings-slider"
            />
          </div>
        </SettingRow>

        {/* 7. Spring bounciness */}
        <SettingRow
          label={t("settings.notch.springBounciness.label")}
          desc={t("settings.notch.springBounciness.desc")}
          icon={Activity}
        >
          <div className="setting-slider-group">
            <span className="setting-slider-value">{notchSpringBounciness}%</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={notchSpringBounciness}
              onChange={(e) => handleNotchSpringBouncinessChange(Number(e.target.value))}
              className="settings-slider"
            />
          </div>
        </SettingRow>

        {/* 8. Animation speed */}
        <SettingRow
          label={t("settings.notch.animationSpeed.label")}
          desc={t("settings.notch.animationSpeed.desc")}
          icon={Zap}
        >
          <div className="setting-slider-group">
            <span className="setting-slider-value">{notchAnimationSpeed}%</span>
            <input
              type="range"
              min="50"
              max="150"
              step="5"
              value={notchAnimationSpeed}
              onChange={(e) => handleNotchAnimationSpeedChange(Number(e.target.value))}
              className="settings-slider"
            />
          </div>
        </SettingRow>

        {/* 9. Reduce motion */}
        <SettingRow
          label={t("settings.notch.reduceMotion.label")}
          desc={t("settings.notch.reduceMotion.desc")}
          icon={Minimize2}
        >
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={notchReduceMotion}
              onChange={toggleNotchReduceMotion}
            />
            <span className="slider"></span>
          </label>
        </SettingRow>

        {/* 10. Restore defaults */}
        <SettingRow
          label={t("settings.notch.resetInteraction.label")}
          desc={t("settings.notch.resetInteraction.desc")}
          divider={false}
          icon={RotateCcw}
        >
          <button
            type="button"
            className="setting-btn"
            onClick={() => {
              resetNotchInteractionSettings();
              setResetFeedback(true);
              setTimeout(() => setResetFeedback(false), 2000);
            }}
          >
            {resetFeedback ? (
              <>
                <Check size={13} strokeWidth={2.5} style={{ color: "var(--color-green, #32D74B)" }} />
                <span>{t("settings.notch.resetInteraction.done")}</span>
              </>
            ) : (
              <>
                <RotateCcw size={13} strokeWidth={2} />
                <span>{t("settings.notch.resetInteraction.btn")}</span>
              </>
            )}
          </button>
        </SettingRow>
      </div>
    </>
  );
}
