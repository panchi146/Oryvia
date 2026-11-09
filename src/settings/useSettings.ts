import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import { type UpdateCheckResult, type UpdateStatus, statusFromUpdateResult, statusFromUpdateError, finishUpdateActivity } from "../updater";
import { getStoredLanguage, translate } from "../i18n";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { hexToHsl } from "../theme";
import type { WidgetConfig, MonitorInfo, MonitorMode, NectarPanel, PanelOrderMode } from "./types";
import {
  DEFAULT_PANEL_ORDER,
  normalizePanelOrder,
  normalizePanelOrderMode,
} from "../components/PanelOrderConfig";
import {
  DEFAULT_DUAL_CLOCK_TIMEZONE,
  normalizeTimezone,
} from "../components/DualClock";

function saveSetting(key: string, value: string) {
  localStorage.setItem(key, value);
  invoke("save_setting", { key, value }).catch(console.error);
}

function readBool(val: string | null): boolean {
  return val === "true";
}

export function useSettings() {
  const [autostart, setAutostart] = useState(false);
  const [weatherEnabled, setWeatherEnabled] = useState(true);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [timerSoundEnabled, setTimerSoundEnabled] = useState(true);
  const [stopwatchEnabled, setStopwatchEnabled] = useState(true);
  const [dualClockEnabled, setDualClockEnabled] = useState(
    () => localStorage.getItem("nectar-dual-clock-enabled") === "true"
  );
  const [dualClockTimezone, setDualClockTimezone] = useState(() =>
    normalizeTimezone(localStorage.getItem("nectar-dual-clock-timezone") || DEFAULT_DUAL_CLOCK_TIMEZONE)
  );
  const [musicModeEnabled, setMusicModeEnabled] = useState(true);
  const [musicCompactNotch, setMusicCompactNotch] = useState(true);
  const [volumeOverlayEnabled, setVolumeOverlayEnabled] = useState(true);
  const [volumeEdgeEnabled, setVolumeEdgeEnabled] = useState(
    () => localStorage.getItem("nectar-volume-edge-enabled") !== "false"
  );
  const [brightnessOverlayEnabled, setBrightnessOverlayEnabled] = useState(
    () => localStorage.getItem("nectar-brightness-overlay-enabled") !== "false"
  );
  const [brightnessEdgeEnabled, setBrightnessEdgeEnabled] = useState(
    () => localStorage.getItem("nectar-brightness-edge-enabled") === "true"
  );
  const [mouseWheelEnabled, setMouseWheelEnabled] = useState(
    () => localStorage.getItem("nectar-overlay-mouse-wheel") !== "false"
  );
  const [swapHudSides, setSwapHudSides] = useState(
    () => localStorage.getItem("nectar-swap-hud-sides") !== "false"
  );
  const [mediaAmbienceEnabled, setMediaAmbienceEnabled] = useState(true);
  const [mediaCompactGlowEnabled, setMediaCompactGlowEnabled] = useState(true);
  const [mediaLayout, setMediaLayout] = useState<"classic" | "compact">(
    () => (localStorage.getItem("nectar-media-layout") as "classic" | "compact") || "classic"
  );
  const [cornersEnabled, setCornersEnabled] = useState(
    () => localStorage.getItem("nectar-corners-enabled") === "true"
  );
  const [showUpdateIndicator, setShowUpdateIndicator] = useState(
    () => localStorage.getItem("nectar-show-update-indicator") !== "false"
  );
  const [timeFormat24h, setTimeFormat24h] = useState(
    () => localStorage.getItem("nectar-time-format-24h") === "true"
  );
  const [tempUnitFahrenheit, setTempUnitFahrenheit] = useState(false);
  const [cityName, setCityName] = useState("");
  const [citySearchResults, setCitySearchResults] = useState<
    Array<{ name: string; country: string; latitude: number; longitude: number }>
  >([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({
    left: ["weather"],
    right: ["battery"],
  });
  const [panelOrderMode, setPanelOrderMode] = useState<PanelOrderMode>(() =>
    normalizePanelOrderMode(localStorage.getItem("nectar-panel-order-mode"))
  );
  const [panelOrder, setPanelOrder] = useState<NectarPanel[]>(() =>
    normalizePanelOrder(localStorage.getItem("nectar-panel-order"))
  );
  const [dockEnabled, setDockEnabled] = useState(
    () => localStorage.getItem("nectar-dock-enabled") === "true"
  );
  const [dockPreviewEnabled, setDockPreviewEnabled] = useState(true);
  const [dockSearchEnabled, setDockSearchEnabled] = useState(true);
  const [dockCalendarEnabled, setDockCalendarEnabled] = useState(true);
  const [dockIconOnly, setDockIconOnly] = useState(
    () => localStorage.getItem("nectar-dock-icon-only") === "true"
  );
  const [startIcon, setStartIcon] = useState(
    () => localStorage.getItem("nectar-start-icon") || "default"
  );
  const [dockAdaptive, setDockAdaptive] = useState(
    () => localStorage.getItem("nectar-dock-adaptive") === "true"
  );
  const [dockWinNumberEnabled, setDockWinNumberEnabled] = useState(
    () => localStorage.getItem("nectar-dock-win-number-enabled") !== "false"
  );
  const [dockMixedReorder, setDockMixedReorder] = useState(
    () => localStorage.getItem("nectar-dock-mixed-reorder") === "true"
  );
  const [dockMode, setDockMode] = useState(() => {
    const raw = localStorage.getItem("nectar-dock-mode") || "smart";
    return raw === "auto-hide" ? "smart" : raw;
  });
  const [notchMode, setNotchMode] = useState("fixed");
  const [dockMonitorMode, setDockMonitorMode] = useState<MonitorMode>(
    () => (localStorage.getItem("nectar-dock-monitor-mode") as MonitorMode) || "primary"
  );
  const [dockMonitorId, setDockMonitorId] = useState(
    () => localStorage.getItem("nectar-dock-monitor-id") || ""
  );
  const [notchMonitorMode, setNotchMonitorMode] = useState<MonitorMode>(
    () => (localStorage.getItem("nectar-notch-monitor-mode") as MonitorMode) || "primary"
  );
  const [notchMonitorId, setNotchMonitorId] = useState(
    () => localStorage.getItem("nectar-notch-monitor-id") || ""
  );
  const [dockModeByMonitor, setDockModeByMonitor] = useState<Record<string, string>>({});
  const [notchModeByMonitor, setNotchModeByMonitor] = useState<Record<string, string>>({});
  const [notchExpandOnHover, setNotchExpandOnHover] = useState(
    () => localStorage.getItem("nectar-notch-expand-on-hover") !== "false"
  );
  const [notchHoverDelay, setNotchHoverDelay] = useState(
    () => parseInt(localStorage.getItem("nectar-notch-hover-delay") || "0", 10)
  );
  const [notchCollapseDelay, setNotchCollapseDelay] = useState(
    () => parseInt(localStorage.getItem("nectar-notch-collapse-delay") || "0", 10)
  );
  const [notchHitboxMargin, setNotchHitboxMargin] = useState(
    () => parseInt(localStorage.getItem("nectar-notch-hitbox-margin") || "0", 10)
  );
  const [notchScrollSensitivity, setNotchScrollSensitivity] = useState<"low" | "normal" | "high">(
    () => (localStorage.getItem("nectar-notch-scroll-sensitivity") as "low" | "normal" | "high") || "normal"
  );
  const [notchCollapsedWidth, setNotchCollapsedWidth] = useState(
    () => parseInt(localStorage.getItem("nectar-notch-collapsed-width") || "110", 10)
  );
  const [notchSpringBounciness, setNotchSpringBounciness] = useState(
    () => parseInt(localStorage.getItem("nectar-notch-spring-bounciness") || "40", 10)
  );
  const [notchAnimationSpeed, setNotchAnimationSpeed] = useState(
    () => parseInt(localStorage.getItem("nectar-notch-animation-speed") || "75", 10)
  );
  const [notchReduceMotion, setNotchReduceMotion] = useState(
    () => localStorage.getItem("nectar-notch-reduce-motion") === "true"
  );
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [lowBatteryThreshold, setLowBatteryThreshold] = useState(20);
  const [hasBattery, setHasBattery] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateVersion, setUpdateVersion] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [autoUpdate, setAutoUpdate] = useState(
    () => localStorage.getItem("nectar-auto-update") === "true"
  );
  const [scale, setScale] = useState(
    () => parseFloat(localStorage.getItem("nectar-scale") || "1.0")
  );
  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem("nectar-theme-mode") || "dark"
  );
  const [themeColor, setThemeColor] = useState(
    () => localStorage.getItem("nectar-theme-color") || "#007aff"
  );
  const [themeOpacity, setThemeOpacity] = useState(() => {
    const val = localStorage.getItem("nectar-theme-opacity");
    return val !== null ? parseFloat(val) : 0.8;
  });
  const [themeSaturation, setThemeSaturation] = useState(() => {
    const val = localStorage.getItem("nectar-theme-saturation");
    return val !== null ? parseFloat(val) : 0.5;
  });
  const [themeBrightness, setThemeBrightness] = useState(() => {
    const val = localStorage.getItem("nectar-theme-brightness");
    return val !== null ? parseFloat(val) : 0.15;
  });
  const [language, setLanguageState] = useState<"en" | "vi">(() => {
    const val = localStorage.getItem("nectar-language");
    return val === "vi" || val === "en" ? val : "en";
  });
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [resetStatus, setResetStatus] = useState<"idle" | "confirm" | "resetting">("idle");
  const [uninstallStatus, setUninstallStatus] = useState<"idle" | "confirm" | "uninstalling" | "error">("idle");
  const [uninstallError, setUninstallError] = useState("");

  // ── Load all settings from backend + localStorage ──
  const loadAllSettings = useCallback(async () => {
    try {
      const settings: Record<string, string> = await invoke("load_settings");
      const getVal = (key: string) => {
        const val = settings[key];
        if (val !== undefined && val !== null) return String(val);
        return localStorage.getItem(key);
      };

      const apply = <T>(val: string | null, setter: (v: T) => void, transform: (v: string) => T) => {
        if (val !== null) setter(transform(val));
      };

      apply(getVal("nectar-weather-enabled"), setWeatherEnabled, readBool);
      apply(getVal("nectar-calendar-enabled"), setCalendarEnabled, readBool);
      apply(getVal("nectar-timer-enabled") ?? getVal("nectar-calendar-enabled"), setTimerEnabled, readBool);
      apply(getVal("nectar-timer-sound-enabled"), setTimerSoundEnabled, readBool);
      apply(getVal("nectar-stopwatch-enabled") ?? getVal("nectar-calendar-enabled"), setStopwatchEnabled, readBool);
      apply(getVal("nectar-dual-clock-enabled"), setDualClockEnabled, readBool);
      apply(getVal("nectar-dual-clock-timezone"), setDualClockTimezone, normalizeTimezone);
      apply(getVal("nectar-music-mode-enabled"), setMusicModeEnabled, readBool);
      apply(getVal("nectar-music-compact-notch"), setMusicCompactNotch, readBool);
      apply(getVal("nectar-volume-overlay-enabled"), setVolumeOverlayEnabled, readBool);
      apply(getVal("nectar-brightness-overlay-enabled"), setBrightnessOverlayEnabled, readBool);
      apply(getVal("nectar-media-ambience-enabled"), setMediaAmbienceEnabled, readBool);
      apply(getVal("nectar-media-compact-glow-enabled"), setMediaCompactGlowEnabled, readBool);
      apply(getVal("nectar-corners-enabled"), setCornersEnabled, readBool);
      apply(getVal("nectar-time-format-24h"), setTimeFormat24h, readBool);
      apply(getVal("nectar-show-update-indicator"), setShowUpdateIndicator, readBool);
      apply(getVal("nectar-auto-update"), setAutoUpdate, readBool);
      apply(getVal("nectar-volume-edge-enabled"), setVolumeEdgeEnabled, readBool);
      apply(getVal("nectar-brightness-edge-enabled"), setBrightnessEdgeEnabled, readBool);
      apply(getVal("nectar-overlay-mouse-wheel"), setMouseWheelEnabled, readBool);
      apply(getVal("nectar-swap-hud-sides"), setSwapHudSides, readBool);
      apply(getVal("nectar-dock-enabled"), setDockEnabled, readBool);
      apply(getVal("nectar-dock-preview-enabled"), setDockPreviewEnabled, readBool);
      apply(getVal("nectar-dock-search-enabled"), setDockSearchEnabled, readBool);
      apply(getVal("nectar-dock-calendar-enabled"), setDockCalendarEnabled, readBool);
      apply(getVal("nectar-dock-icon-only"), setDockIconOnly, readBool);
      apply(getVal("nectar-start-icon"), setStartIcon, (v) => v);
      apply(getVal("nectar-dock-adaptive"), setDockAdaptive, readBool);
      apply(getVal("nectar-dock-win-number-enabled"), setDockWinNumberEnabled, readBool);
      apply(getVal("nectar-dock-mixed-reorder"), setDockMixedReorder, readBool);

      apply(getVal("nectar-temp-unit"), setTempUnitFahrenheit, (v) => v === "fahrenheit");
      apply(getVal("nectar-scale"), setScale, parseFloat);
      apply(getVal("nectar-low-battery-threshold"), setLowBatteryThreshold, parseInt);

      apply(getVal("nectar-notch-mode"), setNotchMode, (v) => (v === "auto-hide" ? "smart" : v));
      apply(getVal("nectar-dock-mode"), setDockMode, (v) => (v === "auto-hide" ? "smart" : v));

      apply(getVal("nectar-dock-monitor-mode"), setDockMonitorMode, (v) => v as MonitorMode);
      apply(getVal("nectar-dock-monitor-id"), setDockMonitorId, (v) => v);
      apply(getVal("nectar-notch-monitor-mode"), setNotchMonitorMode, (v) => v as MonitorMode);
      apply(getVal("nectar-notch-monitor-id"), setNotchMonitorId, (v) => v);

      const dockByMonVal = getVal("nectar-dock-mode-by-monitor");
      if (dockByMonVal) {
        try { setDockModeByMonitor(JSON.parse(dockByMonVal)); } catch {}
      }
      const notchByMonVal = getVal("nectar-notch-mode-by-monitor");
      if (notchByMonVal) {
        try { setNotchModeByMonitor(JSON.parse(notchByMonVal)); } catch {}
      }

      apply(getVal("nectar-notch-expand-on-hover"), setNotchExpandOnHover, readBool);
      apply(getVal("nectar-notch-hover-delay"), setNotchHoverDelay, parseInt);
      apply(getVal("nectar-notch-collapse-delay"), setNotchCollapseDelay, parseInt);
      apply(getVal("nectar-notch-hitbox-margin"), setNotchHitboxMargin, parseInt);
      apply(getVal("nectar-notch-scroll-sensitivity"), setNotchScrollSensitivity, (v) => v as "low" | "normal" | "high");
      apply(getVal("nectar-notch-collapsed-width"), setNotchCollapsedWidth, parseInt);
      apply(getVal("nectar-notch-spring-bounciness"), setNotchSpringBounciness, parseInt);
      apply(getVal("nectar-notch-animation-speed"), setNotchAnimationSpeed, parseInt);
      apply(getVal("nectar-notch-reduce-motion"), setNotchReduceMotion, readBool);

      const savedCity = getVal("nectar-weather-city");
      if (savedCity) setCityName(savedCity);

      apply(getVal("nectar-language"), setLanguageState, (v) => (v === "vi" ? "vi" : "en"));
      apply(getVal("nectar-theme-mode"), setThemeMode, (v) => v);
      apply(getVal("nectar-theme-color"), setThemeColor, (v) => v);
      apply(getVal("nectar-theme-opacity"), setThemeOpacity, parseFloat);
      apply(getVal("nectar-theme-saturation"), setThemeSaturation, parseFloat);
      apply(getVal("nectar-theme-brightness"), setThemeBrightness, parseFloat);

      const widgetsVal = getVal("nectar-status-widgets");
      if (widgetsVal) {
        try {
          const parsed = JSON.parse(widgetsVal);
          if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
            setStatusWidgets(parsed);
          }
        } catch {}
      }

      const panelModeVal = getVal("nectar-panel-order-mode");
      if (panelModeVal !== null) {
        setPanelOrderMode(normalizePanelOrderMode(panelModeVal));
      }
      const panelOrderVal = getVal("nectar-panel-order");
      if (panelOrderVal !== null) {
        setPanelOrder(normalizePanelOrder(panelOrderVal));
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }, []);

  // ── Initialize on mount ──
  useEffect(() => {
    loadAllSettings();

    isEnabled()
      .then(setAutostart)
      .catch(() => {});

    getVersion()
      .then((ver) => setAppVersion(ver))
      .catch(() => setAppVersion(""));

    invoke<boolean>("has_battery").then(setHasBattery).catch(() => {});

    checkForUpdates(false);
  }, []);

  useEffect(() => {
    const refreshMonitors = () => {
      invoke<MonitorInfo[]>("get_monitors").then(setMonitors).catch(() => {});
    };
    refreshMonitors();
    const unlisten = listen("monitors-changed", refreshMonitors);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ── Sync settings from other windows ──
  useSettingsSync({
    "nectar-dock-mode": setDockMode,
    "nectar-notch-mode": setNotchMode,
    "nectar-dock-monitor-mode": (v) => setDockMonitorMode(v as MonitorMode),
    "nectar-dock-monitor-id": setDockMonitorId,
    "nectar-notch-monitor-mode": (v) => setNotchMonitorMode(v as MonitorMode),
    "nectar-notch-monitor-id": setNotchMonitorId,
    "nectar-dock-mode-by-monitor": (v) => { try { setDockModeByMonitor(JSON.parse(v)); } catch {} },
    "nectar-notch-mode-by-monitor": (v) => { try { setNotchModeByMonitor(JSON.parse(v)); } catch {} },
    "nectar-dock-enabled": setDockEnabled,
    "nectar-dock-icon-only": setDockIconOnly,
    "nectar-start-icon": setStartIcon,
    "nectar-dock-adaptive": setDockAdaptive,
    "nectar-dock-win-number-enabled": setDockWinNumberEnabled,
    "nectar-dock-preview-enabled": setDockPreviewEnabled,
    "nectar-dock-search-enabled": setDockSearchEnabled,
    "nectar-dock-calendar-enabled": setDockCalendarEnabled,
    "nectar-dock-mixed-reorder": setDockMixedReorder,
    "nectar-weather-enabled": setWeatherEnabled,
    "nectar-calendar-enabled": setCalendarEnabled,
    "nectar-timer-enabled": setTimerEnabled,
    "nectar-timer-sound-enabled": setTimerSoundEnabled,
    "nectar-stopwatch-enabled": setStopwatchEnabled,
    "nectar-dual-clock-enabled": setDualClockEnabled,
    "nectar-dual-clock-timezone": (v: any) => setDualClockTimezone(normalizeTimezone(v)),
    "nectar-music-mode-enabled": setMusicModeEnabled,
    "nectar-music-compact-notch": setMusicCompactNotch,
    "nectar-media-ambience-enabled": setMediaAmbienceEnabled,
    "nectar-media-compact-glow-enabled": setMediaCompactGlowEnabled,
    "nectar-media-layout": setMediaLayout,
    "nectar-corners-enabled": setCornersEnabled,
    "nectar-show-update-indicator": setShowUpdateIndicator,
    "nectar-time-format-24h": setTimeFormat24h,
    "nectar-low-battery-threshold": setLowBatteryThreshold,
    "nectar-scale": setScale,
    "nectar-temp-unit": (v) => setTempUnitFahrenheit(v === "fahrenheit"),
    "nectar-auto-update": setAutoUpdate,
    "nectar-volume-overlay-enabled": setVolumeOverlayEnabled,
    "nectar-volume-edge-enabled": setVolumeEdgeEnabled,
    "nectar-brightness-overlay-enabled": setBrightnessOverlayEnabled,
    "nectar-brightness-edge-enabled": setBrightnessEdgeEnabled,
    "nectar-overlay-mouse-wheel": setMouseWheelEnabled,
    "nectar-swap-hud-sides": setSwapHudSides,
    "nectar-language": (v: any) => {
      if (v === "vi" || v === "en") setLanguageState(v);
    },
    "nectar-status-widgets": (v: any) => {
      try {
        const parsed = typeof v === "string" ? JSON.parse(v) : v;
        if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
          setStatusWidgets(parsed);
        }
      } catch {}
    },
    "nectar-panel-order-mode": (v: any) => setPanelOrderMode(normalizePanelOrderMode(v)),
    "nectar-panel-order": (v: any) => setPanelOrder(normalizePanelOrder(v)),
    "nectar-theme-mode": setThemeMode,
    "nectar-theme-color": setThemeColor,
    "nectar-theme-opacity": setThemeOpacity,
    "nectar-theme-saturation": setThemeSaturation,
    "nectar-theme-brightness": setThemeBrightness,
    "nectar-weather-city": (v) => setCityName(v || ""),
    "nectar-notch-expand-on-hover": setNotchExpandOnHover,
    "nectar-notch-hover-delay": setNotchHoverDelay,
    "nectar-notch-collapse-delay": setNotchCollapseDelay,
    "nectar-notch-hitbox-margin": setNotchHitboxMargin,
    "nectar-notch-scroll-sensitivity": (v) => setNotchScrollSensitivity(v as "low" | "normal" | "high"),
    "nectar-notch-collapsed-width": setNotchCollapsedWidth,
    "nectar-notch-spring-bounciness": setNotchSpringBounciness,
    "nectar-notch-animation-speed": setNotchAnimationSpeed,
    "nectar-notch-reduce-motion": setNotchReduceMotion,
  });

  // ── Listen for system accent changes (adaptive theme) ──
  useEffect(() => {
    const unlisten = listen<string>("system-accent-changed", (event) => {
      const mode = localStorage.getItem("nectar-theme-mode") || "dark";
      if (mode === "adaptive") {
        try {
          const hsl = hexToHsl(event.payload);
          setThemeSaturation(hsl.s / 100);
          setThemeBrightness(hsl.l / 100);
        } catch (e) {
          console.error("Failed to parse system accent color change HSL:", e);
        }
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ── City search debounce ──
  useEffect(() => {
    if (cityName.trim().length < 2) {
      setCitySearchResults([]);
      setShowCityDropdown(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`
        );
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          setCitySearchResults(
            data.results.map((r: any) => ({
              name: r.name,
              country: r.country || "",
              latitude: r.latitude,
              longitude: r.longitude,
            }))
          );
          setShowCityDropdown(true);
        } else {
          setCitySearchResults([]);
        }
      } catch {
        setCitySearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [cityName]);

  // ── Update checker ──
  const checkForUpdates = async (manual = true) => {
    setUpdateStatus("checking");
    try {
      const result = await invoke<UpdateCheckResult>("check_for_updates", { force: manual });
      setUpdateStatus(statusFromUpdateResult(result));
      setUpdateVersion(result.version ?? "");
    } catch (e) {
      const status = statusFromUpdateError(e);
      if (status === "error") console.error("Updater error:", e);
      setUpdateStatus(status);
    }
  };

  const installUpdate = async () => {
    try {
      setUpdateStatus("downloading");
      await invoke("install_update");
      setUpdateStatus("idle");
    } catch (e) {
      const status = statusFromUpdateError(e);
      if (status === "error") console.error(e);
      setUpdateStatus(status);
    }
  };

  // Reflect install progress triggered from any window (including auto-update).
  useEffect(() => {
    const unlisten = listen<{ status: string; progress?: number }>("auto-update-status", (event) => {
      switch (event.payload.status) {
        case "downloading":
          setUpdateStatus("downloading");
          break;
        case "installing":
          setUpdateStatus("installing");
          break;
        case "done":
          setUpdateStatus(finishUpdateActivity);
          break;
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ── Autostart ──
  const toggleAutostart = async () => {
    try {
      const currentlyEnabled = await isEnabled();
      if (currentlyEnabled) {
        await disable();
        setAutostart(false);
      } else {
        await enable();
        setAutostart(true);
      }
    } catch (err) {}
  };

  // ── Simple boolean toggles ──
  const toggleWeather = () => {
    const next = !weatherEnabled;
    setWeatherEnabled(next);
    saveSetting("nectar-weather-enabled", String(next));
  };

  const toggleCalendar = () => {
    const next = !calendarEnabled;
    setCalendarEnabled(next);
    saveSetting("nectar-calendar-enabled", String(next));
  };

  const toggleTimerEnabled = () => {
    const next = !timerEnabled;
    setTimerEnabled(next);
    saveSetting("nectar-timer-enabled", String(next));
  };

  const toggleTimerSound = () => {
    const next = !timerSoundEnabled;
    setTimerSoundEnabled(next);
    saveSetting("nectar-timer-sound-enabled", String(next));
  };

  const toggleStopwatchEnabled = () => {
    const next = !stopwatchEnabled;
    setStopwatchEnabled(next);
    saveSetting("nectar-stopwatch-enabled", String(next));
  };

  const toggleDualClockEnabled = () => {
    const next = !dualClockEnabled;
    setDualClockEnabled(next);
    saveSetting("nectar-dual-clock-enabled", String(next));
  };

  const handleDualClockTimezoneChange = (tz: string) => {
    const valid = normalizeTimezone(tz);
    setDualClockTimezone(valid);
    saveSetting("nectar-dual-clock-timezone", valid);
  };

  const toggleMusicMode = () => {
    const next = !musicModeEnabled;
    setMusicModeEnabled(next);
    saveSetting("nectar-music-mode-enabled", String(next));
  };

  const toggleMusicCompactNotch = () => {
    const next = !musicCompactNotch;
    setMusicCompactNotch(next);
    saveSetting("nectar-music-compact-notch", String(next));
  };

  const toggleMediaLayout = (layout: "classic" | "compact") => {
    setMediaLayout(layout);
    saveSetting("nectar-media-layout", layout);
  };

  const toggleVolumeOverlay = () => {
    const next = !volumeOverlayEnabled;
    setVolumeOverlayEnabled(next);
    saveSetting("nectar-volume-overlay-enabled", String(next));
  };

  const toggleVolumeEdge = () => {
    const next = !volumeEdgeEnabled;
    setVolumeEdgeEnabled(next);
    saveSetting("nectar-volume-edge-enabled", String(next));
  };

  const toggleBrightnessOverlay = () => {
    const next = !brightnessOverlayEnabled;
    setBrightnessOverlayEnabled(next);
    saveSetting("nectar-brightness-overlay-enabled", String(next));
  };

  const toggleBrightnessEdge = () => {
    const next = !brightnessEdgeEnabled;
    setBrightnessEdgeEnabled(next);
    saveSetting("nectar-brightness-edge-enabled", String(next));
  };

  const toggleMouseWheel = () => {
    const next = !mouseWheelEnabled;
    setMouseWheelEnabled(next);
    saveSetting("nectar-overlay-mouse-wheel", String(next));
  };

  const toggleSwapHudSides = () => {
    const next = !swapHudSides;
    setSwapHudSides(next);
    saveSetting("nectar-swap-hud-sides", String(next));
  };

  const toggleAmbience = () => {
    const next = !mediaAmbienceEnabled;
    setMediaAmbienceEnabled(next);
    saveSetting("nectar-media-ambience-enabled", String(next));
  };

  const toggleCompactGlow = () => {
    const next = !mediaCompactGlowEnabled;
    setMediaCompactGlowEnabled(next);
    saveSetting("nectar-media-compact-glow-enabled", String(next));
  };

  const toggleCorners = () => {
    const next = !cornersEnabled;
    setCornersEnabled(next);
    saveSetting("nectar-corners-enabled", String(next));
  };

  const toggleUpdateIndicator = () => {
    const next = !showUpdateIndicator;
    setShowUpdateIndicator(next);
    saveSetting("nectar-show-update-indicator", String(next));
  };

  const toggleTimeFormat24h = () => {
    const next = !timeFormat24h;
    setTimeFormat24h(next);
    saveSetting("nectar-time-format-24h", String(next));
  };

  const toggleTempUnit = () => {
    const next = !tempUnitFahrenheit;
    setTempUnitFahrenheit(next);
    saveSetting("nectar-temp-unit", next ? "fahrenheit" : "celsius");
  };

  const toggleDock = () => {
    const next = !dockEnabled;
    setDockEnabled(next);
    saveSetting("nectar-dock-enabled", String(next));
  };

  const toggleDockPreview = () => {
    const next = !dockPreviewEnabled;
    setDockPreviewEnabled(next);
    saveSetting("nectar-dock-preview-enabled", String(next));
  };

  const toggleDockSearch = () => {
    const next = !dockSearchEnabled;
    setDockSearchEnabled(next);
    saveSetting("nectar-dock-search-enabled", String(next));
  };

  const toggleDockCalendar = () => {
    const next = !dockCalendarEnabled;
    setDockCalendarEnabled(next);
    saveSetting("nectar-dock-calendar-enabled", String(next));
  };

  const toggleDockMixedReorder = () => {
    const next = !dockMixedReorder;
    setDockMixedReorder(next);
    saveSetting("nectar-dock-mixed-reorder", String(next));
  };

  const toggleDockIconOnly = () => {
    const next = !dockIconOnly;
    setDockIconOnly(next);
    saveSetting("nectar-dock-icon-only", String(next));
  };

  const handleStartIconChange = (icon: string) => {
    setStartIcon(icon);
    saveSetting("nectar-start-icon", icon);
  };

  const toggleDockAdaptive = () => {
    const next = !dockAdaptive;
    setDockAdaptive(next);
    saveSetting("nectar-dock-adaptive", String(next));
  };

  const toggleDockWinNumber = () => {
    const next = !dockWinNumberEnabled;
    setDockWinNumberEnabled(next);
    saveSetting("nectar-dock-win-number-enabled", String(next));
  };

  const toggleAutoUpdate = () => {
    const next = !autoUpdate;
    setAutoUpdate(next);
    saveSetting("nectar-auto-update", String(next));
  };

  // ── Value setters ──
  const setDockModeValue = (newMode: string) => {
    setDockMode(newMode);
    saveSetting("nectar-dock-mode", newMode);
  };

  const setNotchModeValue = (newMode: string) => {
    setNotchMode(newMode);
    saveSetting("nectar-notch-mode", newMode);
  };

  const setDockMonitorModeValue = (mode: MonitorMode) => {
    setDockMonitorMode(mode);
    saveSetting("nectar-dock-monitor-mode", mode);
  };

  const setDockMonitorIdValue = (id: string) => {
    setDockMonitorId(id);
    saveSetting("nectar-dock-monitor-id", id);
  };

  const setNotchMonitorModeValue = (mode: MonitorMode) => {
    setNotchMonitorMode(mode);
    saveSetting("nectar-notch-monitor-mode", mode);
  };

  const setNotchMonitorIdValue = (id: string) => {
    setNotchMonitorId(id);
    saveSetting("nectar-notch-monitor-id", id);
  };

  const setDockModeForMonitor = (monitorId: string, mode: string | null) => {
    setDockModeByMonitor((prev) => {
      const next = { ...prev };
      if (mode === null) delete next[monitorId]; else next[monitorId] = mode;
      saveSetting("nectar-dock-mode-by-monitor", JSON.stringify(next));
      return next;
    });
  };

  const replaceDockModesByMonitor = (next: Record<string, string>) => {
    setDockModeByMonitor(next);
    saveSetting("nectar-dock-mode-by-monitor", JSON.stringify(next));
  };

  const replaceNotchModesByMonitor = (next: Record<string, string>) => {
    setNotchModeByMonitor(next);
    saveSetting("nectar-notch-mode-by-monitor", JSON.stringify(next));
  };

  const setNotchModeForMonitor = (monitorId: string, mode: string | null) => {
    setNotchModeByMonitor((prev) => {
      const next = { ...prev };
      if (mode === null) delete next[monitorId]; else next[monitorId] = mode;
      saveSetting("nectar-notch-mode-by-monitor", JSON.stringify(next));
      return next;
    });
  };

  const handleThresholdChange = (val: number) => {
    setLowBatteryThreshold(val);
    saveSetting("nectar-low-battery-threshold", val.toString());
  };

  const handleScaleChange = (val: number) => {
    setScale(val);
    saveSetting("nectar-scale", val.toString());
  };

  const handleWidgetsChange = (config: WidgetConfig) => {
    setStatusWidgets(config);
    saveSetting("nectar-status-widgets", JSON.stringify(config));
  };

  const handlePanelOrderModeChange = (mode: PanelOrderMode) => {
    const valid = normalizePanelOrderMode(mode);
    setPanelOrderMode(valid);
    saveSetting("nectar-panel-order-mode", valid);
  };

  const handlePanelOrderChange = (order: NectarPanel[]) => {
    const valid = normalizePanelOrder(order);
    setPanelOrder(valid);
    saveSetting("nectar-panel-order", JSON.stringify(valid));
  };

  const resetPanelOrder = () => {
    setPanelOrder([...DEFAULT_PANEL_ORDER]);
    saveSetting("nectar-panel-order", JSON.stringify(DEFAULT_PANEL_ORDER));
  };

  // ── Theme handlers ──
  const handleThemeModeChange = async (mode: string) => {
    setThemeMode(mode);
    saveSetting("nectar-theme-mode", mode);

    if (mode === "adaptive") {
      try {
        const accentHex = await invoke<string>("get_system_accent_color");
        const hsl = hexToHsl(accentHex);
        setThemeSaturation(hsl.s / 100);
        saveSetting("nectar-theme-saturation", String(hsl.s / 100));
        setThemeBrightness(hsl.l / 100);
        saveSetting("nectar-theme-brightness", String(hsl.l / 100));
      } catch (e) {
        console.error("Failed to parse adaptive accent HSL:", e);
      }
    }
  };

  const toggleNotchExpandOnHover = () => {
    const next = !notchExpandOnHover;
    setNotchExpandOnHover(next);
    saveSetting("nectar-notch-expand-on-hover", String(next));
  };

  const handleNotchHoverDelayChange = (val: number) => {
    setNotchHoverDelay(val);
    saveSetting("nectar-notch-hover-delay", String(val));
  };

  const handleNotchCollapseDelayChange = (val: number) => {
    setNotchCollapseDelay(val);
    saveSetting("nectar-notch-collapse-delay", String(val));
  };

  const handleNotchHitboxMarginChange = (val: number) => {
    setNotchHitboxMargin(val);
    saveSetting("nectar-notch-hitbox-margin", String(val));
  };

  const handleNotchScrollSensitivityChange = (val: "low" | "normal" | "high") => {
    setNotchScrollSensitivity(val);
    saveSetting("nectar-notch-scroll-sensitivity", val);
  };

  const handleNotchCollapsedWidthChange = (val: number) => {
    setNotchCollapsedWidth(val);
    saveSetting("nectar-notch-collapsed-width", String(val));
  };

  const handleNotchSpringBouncinessChange = (val: number) => {
    setNotchSpringBounciness(val);
    saveSetting("nectar-notch-spring-bounciness", String(val));
  };

  const handleNotchAnimationSpeedChange = (val: number) => {
    setNotchAnimationSpeed(val);
    saveSetting("nectar-notch-animation-speed", String(val));
  };

  const toggleNotchReduceMotion = () => {
    const next = !notchReduceMotion;
    setNotchReduceMotion(next);
    saveSetting("nectar-notch-reduce-motion", String(next));
  };

  const resetNotchInteractionSettings = () => {
    setNotchExpandOnHover(true);
    saveSetting("nectar-notch-expand-on-hover", "true");

    setNotchHoverDelay(0);
    saveSetting("nectar-notch-hover-delay", "0");

    setNotchCollapseDelay(0);
    saveSetting("nectar-notch-collapse-delay", "0");

    setNotchHitboxMargin(0);
    saveSetting("nectar-notch-hitbox-margin", "0");

    setNotchScrollSensitivity("normal");
    saveSetting("nectar-notch-scroll-sensitivity", "normal");

    setNotchCollapsedWidth(110);
    saveSetting("nectar-notch-collapsed-width", "110");

    setNotchSpringBounciness(40);
    saveSetting("nectar-notch-spring-bounciness", "40");

    setNotchAnimationSpeed(75);
    saveSetting("nectar-notch-animation-speed", "75");

    setNotchReduceMotion(false);
    saveSetting("nectar-notch-reduce-motion", "false");
  };

  const handleLanguageChange = (lang: string) => {
    const valid = lang === "vi" ? "vi" : "en";
    setLanguageState(valid);
    saveSetting("nectar-language", valid);
  };

  const handleThemeColorChange = (color: string) => {
    setThemeColor(color);
    saveSetting("nectar-theme-color", color);

    try {
      const hsl = hexToHsl(color);
      setThemeSaturation(hsl.s / 100);
      saveSetting("nectar-theme-saturation", String(hsl.s / 100));
      setThemeBrightness(hsl.l / 100);
      saveSetting("nectar-theme-brightness", String(hsl.l / 100));
    } catch (e) {
      console.error("Failed to parse custom color HSL:", e);
    }
  };

  const handleOpacityChange = (value: number) => {
    setThemeOpacity(value);
    saveSetting("nectar-theme-opacity", String(value));
  };

  const handleSaturationChange = (value: number) => {
    setThemeSaturation(value);
    saveSetting("nectar-theme-saturation", String(value));
  };

  const handleBrightnessChange = (value: number) => {
    setThemeBrightness(value);
    saveSetting("nectar-theme-brightness", String(value));
  };

  // ── City search ──
  const selectCity = async (city: {
    name: string;
    country: string;
    latitude: number;
    longitude: number;
  }) => {
    setCityName(city.name);
    setShowCityDropdown(false);
    setCitySearchResults([]);
    localStorage.setItem("nectar-weather-city", city.name);
    localStorage.setItem("nectar-weather-lat", city.latitude.toString());
    localStorage.setItem("nectar-weather-lon", city.longitude.toString());
    await invoke("save_setting", { key: "nectar-weather-lat", value: city.latitude.toString() }).catch(() => {});
    await invoke("save_setting", { key: "nectar-weather-lon", value: city.longitude.toString() }).catch(() => {});
    await invoke("save_setting", { key: "nectar-weather-city", value: city.name }).catch(() => {});
    emit("weather-refresh", { lat: city.latitude, lon: city.longitude });
  };

  const handleCityClear = async () => {
    setCityName("");
    setShowCityDropdown(false);
    setCitySearchResults([]);
    localStorage.removeItem("nectar-weather-city");
    localStorage.removeItem("nectar-weather-lat");
    localStorage.removeItem("nectar-weather-lon");
    await invoke("save_setting", { key: "nectar-weather-lat", value: null }).catch(() => {});
    await invoke("save_setting", { key: "nectar-weather-lon", value: null }).catch(() => {});
    await invoke("save_setting", { key: "nectar-weather-city", value: null }).catch(() => {});
    emit("weather-refresh", true);
  };

  // ── Export / Import ──
  const handleExportSettings = async () => {
    setExportStatus("exporting");
    try {
      const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
      const settingsJson = await invoke<string>("export_settings");
      const filePath = await saveDialog({
        title: translate(getStoredLanguage(), "settings.about.export.dialogTitle"),
        defaultPath: "oryvia-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (filePath) {
        await invoke("write_settings_to_path", { path: filePath, content: settingsJson });
        setExportStatus("success");
        setTimeout(() => setExportStatus("idle"), 2000);
      } else {
        setExportStatus("idle");
      }
    } catch (e) {
      console.error("Export failed:", e);
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  };

  const handleImportSettings = async () => {
    setImportStatus("importing");
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const filePath = await openDialog({
        title: translate(getStoredLanguage(), "settings.about.import.dialogTitle"),
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (filePath) {
        const content = await invoke<string>("read_settings_from_path", { path: filePath as string });
        await invoke("import_settings", { settings: content });
        await loadAllSettings();
        setImportStatus("success");
        setTimeout(() => setImportStatus("idle"), 2000);
      } else {
        setImportStatus("idle");
      }
    } catch (e) {
      console.error("Import failed:", e);
      setImportStatus("error");
      setTimeout(() => setImportStatus("idle"), 3000);
    }
  };

  const handleResetSettings = async () => {
    if (resetStatus === "idle") {
      setResetStatus("confirm");
      setTimeout(() => setResetStatus((s) => (s === "confirm" ? "idle" : s)), 4000);
      return;
    }
    if (resetStatus !== "confirm") return;

    setResetStatus("resetting");
    try {
      await invoke("reset_settings");
      localStorage.clear();
      await invoke("restart_nectar");
    } catch (e) {
      console.error("Reset failed:", e);
      setResetStatus("idle");
    }
  };

  const handleUninstallNectar = async () => {
    if (uninstallStatus === "idle" || uninstallStatus === "error") {
      setUninstallStatus("confirm");
      setTimeout(() => setUninstallStatus((s) => (s === "confirm" ? "idle" : s)), 4000);
      return;
    }
    if (uninstallStatus !== "confirm") return;

    setUninstallStatus("uninstalling");
    try {
      await invoke("uninstall_nectar");
    } catch (e) {
      console.error("Uninstall failed:", e);
      setUninstallError(typeof e === "string" ? e : String((e as Error)?.message ?? e));
      setUninstallStatus("error");
      setTimeout(() => setUninstallStatus((s) => (s === "error" ? "idle" : s)), 12000);
    }
  };

  return {
    // System
    autostart,
    toggleAutostart,
    autoUpdate,
    toggleAutoUpdate,
    lowBatteryThreshold,
    handleThresholdChange,
    timeFormat24h,
    toggleTimeFormat24h,
    showUpdateIndicator,
    toggleUpdateIndicator,
    scale,
    handleScaleChange,
    cornersEnabled,
    toggleCorners,

    // Theme
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

    // Notch
    notchMode,
    setNotchModeValue,
    calendarEnabled,
    toggleCalendar,
    timerEnabled,
    toggleTimerEnabled,
    timerSoundEnabled,
    toggleTimerSound,
    stopwatchEnabled,
    toggleStopwatchEnabled,
    dualClockEnabled,
    toggleDualClockEnabled,
    dualClockTimezone,
    handleDualClockTimezoneChange,
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

    // Weather
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

    // Widgets & Panel Order
    statusWidgets,
    handleWidgetsChange,
    panelOrderMode,
    panelOrder,
    handlePanelOrderModeChange,
    handlePanelOrderChange,
    resetPanelOrder,
    hasBattery,

    // Dock
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
    startIcon,
    handleStartIconChange,
    dockAdaptive,
    toggleDockAdaptive,
    dockWinNumberEnabled,
    toggleDockWinNumber,
    dockMixedReorder,
    toggleDockMixedReorder,

    monitors,
    dockMonitorMode,
    setDockMonitorModeValue,
    dockMonitorId,
    setDockMonitorIdValue,
    notchMonitorMode,
    setNotchMonitorModeValue,
    notchMonitorId,
    setNotchMonitorIdValue,
    dockModeByMonitor,
    setDockModeForMonitor,
    replaceDockModesByMonitor,
    notchModeByMonitor,
    setNotchModeForMonitor,
    replaceNotchModesByMonitor,
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

    // Overlays
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

    // Updates
    updateStatus,
    updateVersion,
    appVersion,
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

    language,
    handleLanguageChange,

    // Utilities
    restartNectar: () => invoke("restart_nectar"),
    quitNectar: () => invoke("quit_nectar"),
  };
}
