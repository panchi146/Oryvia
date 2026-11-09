import { motion, AnimatePresence, useAnimation, type Transition } from "framer-motion";
import { useEffect, useState, useCallback, useRef, memo, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { UpdateCheckResult } from "./updater";
import "./App.css";
import { initTheme } from "./theme";
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, VolumeLowIcon, MusicNoteIcon, AudioOutputIcon } from "./icons";
import { CompactMediaPlayer } from "./CompactMediaPlayer";
import { useWeather } from "./hooks/useWeather";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { useTrailingThrottle } from "./hooks/useTrailingThrottle";
import { useCaldav } from "./hooks/useCaldav";
import { useI18n } from "./i18n";
import { NotchCalendar } from "./components/NotchCalendar";
import { NotchClock, StopwatchReadout } from "./components/NotchClock";
import { DualClock, DEFAULT_DUAL_CLOCK_TIMEZONE, normalizeTimezone } from "./components/DualClock";
import { ShortcutsBar } from "./components/ShortcutsBar";
import { ConnectionsView } from "./components/ConnectionsView";
import { useStopwatch } from "./hooks/useStopwatch";
import type { WidgetConfig } from "./components/StatusWidgetConfig";
import {
  computeMusicDisplayModes,
  getAvailablePanels,
  getNextPanelOnWheel,
  normalizePanelOrder,
  normalizePanelOrderMode,
} from "./components/PanelOrderConfig";
import type { NectarPanel, PanelOrderMode } from "./settings/types";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowUpDown,
  Activity,
  ClipboardList,
  Scissors,
  Settings,
  SlidersHorizontal,
  Network,
  ShieldCheck,
  Moon,
  Sun,
  Bell,
} from "lucide-react";

// Timer chime, synthesized with Web Audio so there's no asset. The context is made on the
// Start click so autoplay lets it play when the timer ends.
let timerChimeCtx: AudioContext | null = null;

const getTimerChimeCtx = (): AudioContext | null => {
  try {
    if (!timerChimeCtx) timerChimeCtx = new AudioContext();
    if (timerChimeCtx.state === "suspended") timerChimeCtx.resume().catch(() => {});
    return timerChimeCtx;
  } catch {
    return null;
  }
};

const playTimerChime = () => {
  const ctx = getTimerChimeCtx();
  if (!ctx) return;
  const start = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(ctx.destination);

  // Rising bell (A5, C#6, E6) with a quiet harmonic.
  const notes = [
    { freq: 880.0, at: 0 },
    { freq: 1108.73, at: 0.18 },
    { freq: 1318.51, at: 0.36 },
  ];
  notes.forEach(({ freq, at }) => {
    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const harmonicGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    harmonic.type = "sine";
    harmonic.frequency.value = freq * 2.01;
    harmonicGain.gain.value = 0.12;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.32, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 1.4);
    osc.connect(gain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(gain);
    gain.connect(master);
    osc.start(start + at);
    harmonic.start(start + at);
    osc.stop(start + at + 1.5);
    harmonic.stop(start + at + 1.5);
  });
};

// Simple SVG icons
function WifiIcon({ enabled, connected }: { enabled: boolean; connected: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={!enabled ? 0.4 : connected ? 1 : 0.7}>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

function TrayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
    </svg>
  );
}

function BatteryIcon({ charging, level, threshold = 20 }: { charging: boolean; level: number; threshold?: number }) {
  const percentage = Math.min(Math.max(level, 0), 100);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      position: 'relative',
      height: '14px',
      justifyContent: 'center'
    }}>
      <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
        {/* Battery Shell - Centered at 9px within 20px width, ignoring the tip's offset */}
        <rect
          x="2" y="0.75" width="14" height="8.5" rx="2.4"
          stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.1"
        />
        {/* Battery Tip */}
        <path
          d="M17.5 3.5V6.5"
          stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.2" strokeLinecap="round"
        />
        {/* Fill */}
        <rect
          x="3.8" y="2.5"
          width={Math.max(0.5, (percentage / 100) * 10.4)}
          height="5" rx="1"
          fill={charging ? "#32D74B" : (percentage <= threshold ? "#FF453A" : "white")}
        />
      </svg>
      {/* Charging Bolt - Centered on the battery body */}
      {charging && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '9px',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          filter: 'drop-shadow(0px 0px 1.5px rgba(0,0,0,0.8))'
        }}>
          <svg width="7" height="10" viewBox="0 0 8 12" fill="currentColor">
            <path d="M4.5 0L0 7H3.5L2.5 12L8 5H4.5L5.5 0H4.5Z" />
          </svg>
        </div>
      )}
    </div>
  );
}

function GreenDownArrowIcon() {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: 'rgba(50, 215, 75, 0.15)',
      border: '1px solid rgba(50, 215, 75, 0.35)',
      boxShadow: '0 0 8px rgba(50, 215, 75, 0.25)',
      flexShrink: 0,
      verticalAlign: 'middle'
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#32D74B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="4" x2="12" y2="16"></line>
        <polyline points="18 10 12 16 6 10"></polyline>
        <line x1="6" y1="20" x2="18" y2="20"></line>
      </svg>
    </div>
  );
}

export const RESTING_BAR_HEIGHT = 0.2;

export const Visualizer = memo(function Visualizer({ isPlaying, bars = 5, height = 20 }: { isPlaying: boolean; bars?: number; height?: number }) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const targetsRef = useRef<number[]>(Array(bars).fill(RESTING_BAR_HEIGHT));
  const currentRef = useRef<number[]>(Array(bars).fill(RESTING_BAR_HEIGHT));
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let unlistenFn: (() => void) | null = null;

    if (!isPlaying) {
      // Smooth decay down to uniform resting level (0.2) when paused, then stop rAF for 0% CPU consumption
      targetsRef.current.fill(RESTING_BAR_HEIGHT);

      const decayToRest = () => {
        if (isCancelled) return;
        const current = currentRef.current;
        const refs = barRefs.current;
        let hasMovement = false;

        for (let i = 0; i < bars; i++) {
          const cur = current[i];
          const diff = RESTING_BAR_HEIGHT - cur;
          if (Math.abs(diff) > 0.003) {
            current[i] = cur + diff * 0.32;
            hasMovement = true;
            const el = refs[i];
            if (el) {
              el.style.transform = `scaleY(${current[i].toFixed(3)})`;
            }
          } else if (cur !== RESTING_BAR_HEIGHT) {
            current[i] = RESTING_BAR_HEIGHT;
            const el = refs[i];
            if (el) {
              el.style.transform = `scaleY(${RESTING_BAR_HEIGHT})`;
            }
          }
        }

        if (hasMovement) {
          rafIdRef.current = requestAnimationFrame(decayToRest);
        } else {
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = requestAnimationFrame(decayToRest);

      return () => {
        isCancelled = true;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
    }

    listen<{ frequencies: number[] }>("audio-visualization", (event) => {
      if (isCancelled) return;
      const data = event.payload?.frequencies;
      if (!data) return;
      const count = Math.min(bars, data.length);
      const targets = targetsRef.current;
      for (let i = 0; i < count; i++) {
        targets[i] = Math.max(RESTING_BAR_HEIGHT, data[i]);
      }
    }).then((fn) => {
      if (isCancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    const updateVisualizer = () => {
      if (isCancelled) return;
      const current = currentRef.current;
      const targets = targetsRef.current;
      const refs = barRefs.current;
      const count = bars;

      for (let i = 0; i < count; i++) {
        const cur = current[i];
        const tgt = targets[i];
        const diff = tgt - cur;
        if (Math.abs(diff) > 0.002) {
          // Critically damped smoothing matching the previous spring feel (stiffness: 600, damping: 30)
          current[i] = cur + diff * 0.32;
          const el = refs[i];
          if (el) {
            el.style.transform = `scaleY(${current[i].toFixed(3)})`;
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(updateVisualizer);
    };

    rafIdRef.current = requestAnimationFrame(updateVisualizer);

    return () => {
      isCancelled = true;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [isPlaying, bars]);

  return (
    <div className="visualizer-horizontal" style={{ height: `${height}px`, width: `${bars * 6}px` }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { barRefs.current[i] = el; }}
          className="bar-horizontal"
          style={{
            transform: `scaleY(${currentRef.current[i] || RESTING_BAR_HEIGHT})`,
            opacity: 0.95,
          }}
        />
      ))}
    </div>
  );
});

function UpdateActivity() {
  return (
    <div className="update-activity">
      <motion.div
        className="update-activity-glow"
        animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1, 0.9] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#32D74B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v11" />
          <path d="M6 12l6 6 6-6" />
        </svg>
      </motion.div>
    </div>
  );
}

interface WifiStatus {
  enabled: boolean;
  connected: boolean;
}

interface MediaInfo {
  title: string;
  artist: string;
  is_playing: boolean;
  has_media: boolean;
  artwork?: string[];
  position_ms?: number;
  duration_ms?: number;
  seek_enabled?: boolean;
  position_updated_at?: number;
  is_timeline_update?: boolean;
}

interface MediaTimelineUpdate {
  title: string;
  artist: string;
  position_ms: number;
  duration_ms: number;
  position_updated_at: number;
}

const MARQUEE_SPEED = 30; // px/s — constant for all titles
const MARQUEE_MIN_DURATION = 5; // floor so short titles don't flicker

const TitleMarquee = ({ title }: { title: string }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [scrollDistance, setScrollDistance] = useState(0);
  const [scrollDuration, setScrollDuration] = useState(8);

  useEffect(() => {
    const check = () => {
      if (textRef.current && containerRef.current) {
        const textWidth = textRef.current.scrollWidth;
        const containerWidth = containerRef.current.clientWidth;
        const overflow = textWidth > containerWidth;
        setIsOverflowing(overflow);
        if (overflow) {
          const distance = textWidth - containerWidth;
          setScrollDistance(distance);
          setScrollDuration(Math.max(distance / MARQUEE_SPEED, MARQUEE_MIN_DURATION));
        }
      }
    };
    check();
    const observer = new ResizeObserver(check);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [title]);

  return (
    <div ref={containerRef} className="premium-title-wrap" style={{ width: '100%', overflow: 'hidden' }}>
      <span
        ref={textRef}
        className={`premium-title ${isOverflowing ? 'marquee' : ''}`}
        style={{
          '--scroll-distance': isOverflowing ? `-${scrollDistance}px` : undefined,
          '--scroll-duration': `${scrollDuration}s`,
        } as React.CSSProperties}
      >
        {title}
      </span>
    </div>
  );
};




function App() {
  const { t } = useI18n();
  useEffect(() => {
    return initTheme();
  }, []);

  const [time, setTime] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [scale, setScale] = useState(() => parseFloat(localStorage.getItem("nectar-scale") || "1.0"));
  const [timeFormat24h, setTimeFormat24h] = useState(() => localStorage.getItem("nectar-time-format-24h") === "true");


  const [batteryLevel, setBatteryLevel] = useState(100);
  const [isCharging, setIsCharging] = useState(false);
  const [hasBattery, setHasBattery] = useState(true);
  const [showPowerPulse, setShowPowerPulse] = useState(false);
  const [showLowBatteryPulse, setShowLowBatteryPulse] = useState(false);
  const [lowBatteryThreshold, setLowBatteryThreshold] = useState(() => parseInt(localStorage.getItem("nectar-low-battery-threshold") || "20"));
  const prevChargingRef = useRef<boolean | null>(null);
  const powerPulseTimeoutRef = useRef<any>(null);
  const lowBatteryPulseShownRef = useRef<boolean>(false);

  const [eventPeek, setEventPeek] = useState(false);
  const eventPeekTimeoutRef = useRef<any>(null);
  const updatePulseTimerRef = useRef<any>(null);
  const triggerEventPeek = useCallback((duration = 3000) => {
    setEventPeek(true);
    if (eventPeekTimeoutRef.current) clearTimeout(eventPeekTimeoutRef.current);
    eventPeekTimeoutRef.current = setTimeout(() => setEventPeek(false), duration);
  }, []);

  const [notchMode, setNotchMode] = useState(() => {
    const raw = localStorage.getItem("nectar-notch-mode") || "fixed";
    if (raw === "auto-hide") return "smart";
    return raw;
  });


  useEffect(() => {
    if (hasBattery && isReady && prevChargingRef.current !== null && prevChargingRef.current !== isCharging) {
      setShowPowerPulse(true);
      if (notchMode === 'peek') triggerEventPeek(4000);
      if (powerPulseTimeoutRef.current) clearTimeout(powerPulseTimeoutRef.current);
      powerPulseTimeoutRef.current = setTimeout(() => {
        setShowPowerPulse(false);
      }, 4000);
    }
    prevChargingRef.current = isCharging;
  }, [isCharging, isReady, notchMode, triggerEventPeek, hasBattery]);

  useEffect(() => {
    // Trigger pulse when dropping below threshold while discharging
    if (hasBattery && isReady && batteryLevel <= lowBatteryThreshold && !isCharging && !lowBatteryPulseShownRef.current) {
      setShowLowBatteryPulse(true);
      if (notchMode === 'peek') triggerEventPeek(5000);
      lowBatteryPulseShownRef.current = true;
      setTimeout(() => setShowLowBatteryPulse(false), 5000);
    }

    // Reset the "shown" state if battery is charged or threshold is lowered
    if (isCharging || batteryLevel > lowBatteryThreshold) {
      lowBatteryPulseShownRef.current = false;
    }
  }, [batteryLevel, isCharging, lowBatteryThreshold, isReady, notchMode, triggerEventPeek, hasBattery]);

  // Weather state (managed by useWeather hook)

  // Media state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicPauseGrace, setIsMusicPauseGrace] = useState(false);
  const isMusicPauseGraceRef = useRef(false);
  const setIsMusicPauseGraceSync = useCallback((val: boolean) => {
    isMusicPauseGraceRef.current = val;
    setIsMusicPauseGrace(val);
  }, []);
  const [isMusicFadingOut, setIsMusicFadingOut] = useState(false);
  const pauseGraceTimerRef = useRef<any>(null);
  const pauseFadeTimerRef = useRef<any>(null);
  const prevPlayingRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo>({
    title: "",
    artist: "",
    is_playing: false,
    has_media: false
  });
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [albumArtKey, setAlbumArtKey] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const lastNonZeroVolumeRef = useRef(0.5);
  // Sliders show 0 while muted, like the overlay.
  const displayVolume = isMuted ? 0 : volume;
  // null until the first fetch so the pill doesn't flash a wrong default.
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const wifiEnabled = wifiStatus?.enabled ?? false;
  const wifiConnected = wifiStatus?.connected ?? false;
  const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
  const [batterySaverEnabled, setBatterySaverEnabled] = useState(false);
  const [currentBrightness, setCurrentBrightness] = useState(50);

  // System metrics for status widgets
  const [cpuUsage, setCpuUsage] = useState(0);
  const [ramUsage, setRamUsage] = useState(0);
  const [diskSpace, setDiskSpace] = useState(0);
  const [netUpSpeed, setNetUpSpeed] = useState(0);
  const [netDownSpeed, setNetDownSpeed] = useState(0);
  const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({ left: ["weather"], right: ["battery"] });
  const [panelOrderMode, setPanelOrderMode] = useState<PanelOrderMode>(() =>
    normalizePanelOrderMode(localStorage.getItem("nectar-panel-order-mode"))
  );
  const [panelOrder, setPanelOrder] = useState<NectarPanel[]>(() =>
    normalizePanelOrder(localStorage.getItem("nectar-panel-order"))
  );
  const panelOrderModeRef = useRef<PanelOrderMode>(panelOrderMode);
  const panelOrderRef = useRef<NectarPanel[]>(panelOrder);

  useEffect(() => {
    panelOrderModeRef.current = panelOrderMode;
  }, [panelOrderMode]);

  useEffect(() => {
    panelOrderRef.current = panelOrder;
  }, [panelOrder]);

  const [windowLabel, setWindowLabel] = useState<string>("");
  useEffect(() => {
    setWindowLabel(getCurrentWebviewWindow().label);
  }, []);
  const isNotchWindow = windowLabel === 'main' || windowLabel.startsWith('main-');
  // Update state
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showUpdateIndicator, setShowUpdateIndicator] = useState(() => localStorage.getItem("nectar-show-update-indicator") !== "false");
  const [showUpdatePulse, setShowUpdatePulse] = useState(false);
  const hasTriggeredStartupUpdatePulseRef = useRef(false);
  const showUpdateIndicatorRef = useRef(showUpdateIndicator);
  useEffect(() => {
    showUpdateIndicatorRef.current = showUpdateIndicator;
    if (!showUpdateIndicator) {
      setShowUpdatePulse(false);
      if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
    }
  }, [showUpdateIndicator]);
  const notchModeRef = useRef(notchMode);
  useEffect(() => {
    notchModeRef.current = notchMode;
  }, [notchMode]);

  const triggerUpdateNotification = useCallback(() => {
    if (!showUpdateIndicatorRef.current) return;
    setShowUpdatePulse(true);
    if (notchModeRef.current === 'peek') triggerEventPeek(6000);
    if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
    updatePulseTimerRef.current = setTimeout(() => {
      setShowUpdatePulse(false);
    }, 6000);
  }, [triggerEventPeek]);

  useEffect(() => {
    if (windowLabel !== 'main') return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    listen<UpdateCheckResult>("update-available", (event) => {
      const isAvail = Boolean(event.payload?.available);
      setUpdateAvailable(isAvail);
      if (!isAvail) {
        setShowUpdatePulse(false);
        if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
        return;
      }
      if (!hasTriggeredStartupUpdatePulseRef.current) {
        hasTriggeredStartupUpdatePulseRef.current = true;
        triggerUpdateNotification();
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    invoke<UpdateCheckResult>("get_update_state")
      .then((state) => {
        const isAvail = Boolean(state?.available);
        setUpdateAvailable(isAvail);
        if (isAvail && !hasTriggeredStartupUpdatePulseRef.current) {
          hasTriggeredStartupUpdatePulseRef.current = true;
          triggerUpdateNotification();
        }
      })
      .catch((e) => console.error("Failed to read update state:", e));

    return () => {
      disposed = true;
      unlisten?.();
      if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
    };
  }, [windowLabel, triggerUpdateNotification]);

  const [isVisible, setIsVisible] = useState(true);
  const [isImpacted, setIsImpacted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [startupAnimating, setStartupAnimating] = useState(false);

  const [dockMode, setDockMode] = useState(() => {
    const raw = localStorage.getItem("nectar-dock-mode") || "smart";
    if (raw === "auto-hide") return "smart";
    return raw;
  });
  const [dndActive, setDndActive] = useState(false);
  const [dockEnabled, setDockEnabled] = useState(() => localStorage.getItem("nectar-dock-enabled") === "true");
  const [isNotchHovered, setIsNotchHovered] = useState(false);

  // Notch Interaction & Effects settings
  const [settingsNotchExpandOnHover, setSettingsNotchExpandOnHover] = useState(() => localStorage.getItem("nectar-notch-expand-on-hover") !== "false");
  const [settingsNotchHoverDelay, setSettingsNotchHoverDelay] = useState(() => parseInt(localStorage.getItem("nectar-notch-hover-delay") || "0", 10));
  const [settingsNotchCollapseDelay, setSettingsNotchCollapseDelay] = useState(() => parseInt(localStorage.getItem("nectar-notch-collapse-delay") || "0", 10));
  const [settingsNotchHitboxMargin, setSettingsNotchHitboxMargin] = useState(() => parseInt(localStorage.getItem("nectar-notch-hitbox-margin") || "0", 10));
  const [settingsNotchScrollSensitivity, setSettingsNotchScrollSensitivity] = useState<'low' | 'normal' | 'high'>(() => (localStorage.getItem("nectar-notch-scroll-sensitivity") as 'low' | 'normal' | 'high') || 'normal');
  const [settingsNotchCollapsedWidth, setSettingsNotchCollapsedWidth] = useState(() => parseInt(localStorage.getItem("nectar-notch-collapsed-width") || "110", 10));
  const [settingsNotchSpringBounciness, setSettingsNotchSpringBounciness] = useState(() => parseInt(localStorage.getItem("nectar-notch-spring-bounciness") || "40", 10));
  const [settingsNotchAnimationSpeed, setSettingsNotchAnimationSpeed] = useState(() => parseInt(localStorage.getItem("nectar-notch-animation-speed") || "75", 10));
  const [settingsNotchReduceMotion, setSettingsNotchReduceMotion] = useState(() => localStorage.getItem("nectar-notch-reduce-motion") === "true");

  const isHoverPreview = !settingsNotchExpandOnHover && !isHovered && isNotchHovered && !settingsNotchReduceMotion;

  const [isEdgeHovered, setIsEdgeHovered] = useState(false);
  const [isOverlapped, setIsOverlapped] = useState(false);
  const [interactionState, setInteractionState] = useState<'active' | 'grace' | 'none'>('none');
  const nectarRef = useRef<HTMLDivElement>(null);
  const dockEnabledInitial = useRef(true);
  const dockModeInitial = useRef(true);
  const notchModeInitial = useRef(true);
  const isForceCompactRef = useRef(false);
  const isDevPinnedRef = useRef(false);
  const ipcCountSinceLastTransitionRef = useRef(0);

  const isAnyInteraction = isHovered || isNotchHovered || isEdgeHovered;
  const isHidden = !startupAnimating && (
    (notchMode === 'smart' && isOverlapped && interactionState === 'none' && !isDevPinnedRef.current) ||
    (notchMode === 'peek' && interactionState === 'none' && !eventPeek && !isDevPinnedRef.current)
  );

  useEffect(() => {
    if (isAnyInteraction) {
      setInteractionState('active');
    } else if (interactionState !== 'none') {
      setInteractionState('grace');
      const timer = setTimeout(() => setInteractionState('none'), 800);
      return () => clearTimeout(timer);
    }
  }, [isAnyInteraction]);

  useEffect(() => {
    if (isNotchWindow) {
      invoke('set_notch_hovered', { hovered: isNotchHovered }).catch(() => { });
    }
  }, [isNotchHovered, isNotchWindow]);

  // Tell the backend when the notch is hidden (smart/peek) so it stays click-through.
  useEffect(() => {
    if (isNotchWindow) {
      invoke('set_notch_hidden', { hidden: !isVisible || isHidden }).catch(() => { });
    }
  }, [isVisible, isHidden, isNotchWindow]);

  useEffect(() => {
    let lastSent = "";
    const updateRect = () => {
      if (nectarRef.current && isNotchWindow) {
        const rect = nectarRef.current.getBoundingClientRect();

        let targetWidth = Math.round(rect.width);
        let targetHeight = Math.round(rect.height);
        let targetX = Math.round(rect.x);
        let targetY = Math.round(rect.y);

        if (isForceCompactRef.current) {
          if (targetHeight <= 38 * scale) {
            isForceCompactRef.current = false;
          } else {
            targetHeight = Math.round(36 * scale);
            targetWidth = Math.min(targetWidth, Math.round(settingsNotchCollapsedWidth * scale));
            targetX = Math.round((window.innerWidth - targetWidth) / 2);
            targetY = 0;
          }
        } else if (isHoverPreview) {
          targetWidth = Math.round(settingsNotchCollapsedWidth * scale);
          targetHeight = Math.round(36 * scale);
          targetX = Math.round((window.innerWidth - targetWidth) / 2);
          targetY = 0;
        }

        const next = {
          x: targetX,
          y: targetY,
          width: targetWidth,
          height: targetHeight
        };
        const key = `${next.x},${next.y},${next.width},${next.height}`;
        if (key === lastSent) return;
        lastSent = key;
        if (import.meta.env.DEV) {
          ipcCountSinceLastTransitionRef.current++;
        }
        invoke('update_notch_rect', { rect: next }).catch(() => { lastSent = ""; });
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    const observer = new ResizeObserver(updateRect);
    if (nectarRef.current) observer.observe(nectarRef.current);

    let rafId: number;
    const chaseStart = performance.now();
    const chase = () => {
      updateRect();
      if (performance.now() - chaseStart < 700) {
        rafId = requestAnimationFrame(chase);
      }
    };
    rafId = requestAnimationFrame(chase);

    const poll = setInterval(updateRect, 500);

    return () => {
      window.removeEventListener('resize', updateRect);
      observer.disconnect();
      clearInterval(poll);
      cancelAnimationFrame(rafId);
    };
  }, [isExpanded, isHidden, windowLabel, scale]);

  useEffect(() => {
    if (!windowLabel) return;

    // Only animate the main top-bar
    if (windowLabel !== 'main') {
      setIsReady(true);
      setIsImpacted(true);
      setIsExpanded(true);
      return;
    }

    const proceedWithStartup = () => {
      const checkVisibility = async () => {
        try {
          const win = getCurrentWebviewWindow();
          const visible = await win.isVisible();
          if (visible) {
            setStartupAnimating(true);
            setIsReady(true);
            setTimeout(() => {
              setIsImpacted(true);
              setIsExpanded(true);
            }, 240);
            setTimeout(() => setStartupAnimating(false), 1500);
            return true;
          }
        } catch (e) { }
        return false;
      };

      const interval = setInterval(async () => {
        if (await checkVisibility()) clearInterval(interval);
      }, 100);

      checkVisibility();
      return interval;
    };

    const DOCK_SYNC_DELAY_MS = 400;
    const waitForSplash = () => {
      let started = false;
      let interval: any;
      let syncTimer: any;
      const begin = () => {
        if (started) return;
        started = true;
        syncTimer = setTimeout(() => { interval = proceedWithStartup(); }, DOCK_SYNC_DELAY_MS);
      };
      const unlistenSplash = listen("splash-done", () => {
        begin();
        unlistenSplash.then(fn => fn());
      });
      const safetyTimer = setTimeout(() => {
        begin();
        unlistenSplash.then(fn => fn());
      }, 6000);
      return () => {
        clearTimeout(safetyTimer);
        clearTimeout(syncTimer);
        if (interval) clearInterval(interval);
        unlistenSplash.then(fn => fn());
      };
    };

    return waitForSplash();
  }, [windowLabel]);

  // Settings state
  const [settingsWeatherEnabled, setSettingsWeatherEnabled] = useState(() => localStorage.getItem("nectar-weather-enabled") !== "false");
  const [settingsCalendarEnabled, setSettingsCalendarEnabled] = useState(() => localStorage.getItem("nectar-calendar-enabled") !== "false");
  const [settingsTimerEnabled, setSettingsTimerEnabled] = useState(
    () => (localStorage.getItem("nectar-timer-enabled") ?? localStorage.getItem("nectar-calendar-enabled")) !== "false",
  );
  const [settingsTimerSoundEnabled, setSettingsTimerSoundEnabled] = useState(
    () => localStorage.getItem("nectar-timer-sound-enabled") !== "false",
  );
  const [settingsStopwatchEnabled, setSettingsStopwatchEnabled] = useState(
    () => (localStorage.getItem("nectar-stopwatch-enabled") ?? localStorage.getItem("nectar-calendar-enabled")) !== "false",
  );
  const [settingsDualClockEnabled, setSettingsDualClockEnabled] = useState(
    () => localStorage.getItem("nectar-dual-clock-enabled") === "true",
  );
  const [settingsDualClockTimezone, setSettingsDualClockTimezone] = useState(
    () => normalizeTimezone(localStorage.getItem("nectar-dual-clock-timezone") || DEFAULT_DUAL_CLOCK_TIMEZONE),
  );
  const showClockColumn = settingsTimerEnabled || settingsStopwatchEnabled;
  const productivityEnabled = settingsCalendarEnabled || showClockColumn || settingsDualClockEnabled;
  const [settingsMusicModeEnabled, setSettingsMusicModeEnabled] = useState(() => localStorage.getItem("nectar-music-mode-enabled") !== "false");
  const settingsMusicModeEnabledRef = useRef(settingsMusicModeEnabled);
  useEffect(() => {
    settingsMusicModeEnabledRef.current = settingsMusicModeEnabled;
  }, [settingsMusicModeEnabled]);
  const [settingsMusicCompactNotch, setSettingsMusicCompactNotch] = useState(() => localStorage.getItem("nectar-music-compact-notch") !== "false");
  const [settingsVisualizerEnabled, setSettingsVisualizerEnabled] = useState(() => localStorage.getItem("nectar-visualizer-enabled") !== "false");
  const [settingsAlbumArtEnabled, setSettingsAlbumArtEnabled] = useState(() => localStorage.getItem("nectar-media-album-art-enabled") !== "false");
  const [settingsAmbienceEnabled, setSettingsAmbienceEnabled] = useState(() => localStorage.getItem("nectar-media-ambience-enabled") !== "false");
  const [settingsCompactGlowEnabled, setSettingsCompactGlowEnabled] = useState(() => localStorage.getItem("nectar-media-compact-glow-enabled") !== "false");
  const [settingsCornersEnabled, setSettingsCornersEnabled] = useState(() => localStorage.getItem("nectar-corners-enabled") === "true");
  const [mediaLayout, setMediaLayout] = useState<'classic' | 'compact'>(() => (localStorage.getItem("nectar-media-layout") as 'classic' | 'compact') || 'classic');
  const [compactVolumeExpanded, setCompactVolumeExpanded] = useState(false);



  const hoverTimeoutRef = useRef<any>(null);
  const collapseTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    };
  }, []);

  // Weather hook
  const { temperature, weatherCondition, weatherIcon: WeatherIcon, cityName, tempUnit } = useWeather(settingsWeatherEnabled);

  const refreshNotchMode = () => {
    invoke<string>('get_notch_mode_for_window').then(setNotchMode).catch(() => {});
  };

  useEffect(() => {
    const unlisten = listen("monitors-changed", refreshNotchMode);
    return () => { unlisten.then(f => f()); };
  }, []);

  useEffect(() => {
    if (!windowLabel) return;

    invoke("load_settings").then((settings: any) => {
      const getVal = (key: string, fallback: string | null = null) => {
        const val = settings[key];
        if (val !== undefined && val !== null) return String(val);
        const local = localStorage.getItem(key);
        if (local !== null) return local;
        return fallback;
      };

      setSettingsWeatherEnabled(getVal("nectar-weather-enabled", "true") !== "false");
      setSettingsCalendarEnabled(getVal("nectar-calendar-enabled", "true") !== "false");
      setSettingsTimerEnabled((getVal("nectar-timer-enabled") ?? getVal("nectar-calendar-enabled", "true")) !== "false");
      setSettingsTimerSoundEnabled(getVal("nectar-timer-sound-enabled", "true") !== "false");
      setSettingsStopwatchEnabled((getVal("nectar-stopwatch-enabled") ?? getVal("nectar-calendar-enabled", "true")) !== "false");
      setSettingsDualClockEnabled(getVal("nectar-dual-clock-enabled", "false") === "true");
      setSettingsDualClockTimezone(normalizeTimezone(getVal("nectar-dual-clock-timezone", DEFAULT_DUAL_CLOCK_TIMEZONE)));
      setSettingsMusicModeEnabled(getVal("nectar-music-mode-enabled", "true") !== "false");
      setSettingsMusicCompactNotch(getVal("nectar-music-compact-notch", "true") !== "false");
      const viz = getVal("nectar-media-visualizer-enabled") ?? getVal("nectar-visualizer-enabled", "true");
      setSettingsVisualizerEnabled(viz !== "false");
      setSettingsAlbumArtEnabled(getVal("nectar-media-album-art-enabled", "true") !== "false");
      setSettingsAmbienceEnabled(getVal("nectar-media-ambience-enabled", "true") !== "false");
      setSettingsCompactGlowEnabled(getVal("nectar-media-compact-glow-enabled", "true") !== "false");
      setSettingsCornersEnabled(getVal("nectar-corners-enabled", "false") === "true");
      setTimeFormat24h(getVal("nectar-time-format-24h") === "true");

      const thresholdStr = getVal("nectar-low-battery-threshold", "20");
      if (thresholdStr) setLowBatteryThreshold(parseInt(thresholdStr as string));

      refreshNotchMode();

      if (windowLabel === 'main') {
        const firstRun = localStorage.getItem("nectar-first-run") === null;
        if (firstRun) {
          import("@tauri-apps/plugin-autostart").then(({ enable, isEnabled }) => {
            isEnabled().then(enabled => {
              if (!enabled) enable().catch(() => { });
            });
          });
          localStorage.setItem("nectar-first-run", "done");
        }
        const rawDockMode = getVal("nectar-dock-mode", "smart") as string;
        const dockMode = rawDockMode === "auto-hide" ? "smart" : rawDockMode;
        const syncWindows = async () => {
          const dockEnabled = getVal("nectar-dock-enabled", "false") === "true";
          const resolvedNotchMode = await invoke<string>('get_notch_mode_for_window').catch(() => "fixed");
          await Promise.all([
            dockEnabled ? invoke("init_dock", { mode: dockMode }) : Promise.resolve(),
            invoke("change_notch_mode", { mode: resolvedNotchMode }),
          ]);
          await invoke("sync_appbar");
        };

        const dockEnabled = getVal("nectar-dock-enabled", "false") === "true";
        const runDockInit = () => {
          // 1. Snappy initial sync
          setTimeout(syncWindows, 400);
          // 2. Safety-net dock retry
          if (dockEnabled) {
            setTimeout(() => invoke("init_dock", { mode: dockMode }).catch(() => {}), 1500);
          }
          // 3. Layout corrections
          setTimeout(() => invoke("sync_appbar"), 1000);
          setTimeout(() => invoke("sync_appbar"), 2500);
          setTimeout(() => invoke("sync_appbar"), 5000);
        };

        const runDockInitAfterSplash = () => {
          let dockStarted = false;
          const unlistenDock = listen("splash-done", () => {
            if (dockStarted) return;
            dockStarted = true;
            runDockInit();
            unlistenDock.then(fn => fn());
          });
          setTimeout(() => {
            if (dockStarted) return;
            dockStarted = true;
            runDockInit();
            unlistenDock.then(fn => fn());
          }, 6000);
        };

        runDockInitAfterSplash();
      }

      const scaleVal = getVal("nectar-scale");
      if (scaleVal !== null) setScale(parseFloat(scaleVal));

      const widgetsVal = getVal("nectar-status-widgets");
      if (widgetsVal) {
        try {
          const parsed = JSON.parse(widgetsVal);
          if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
            setStatusWidgets(parsed);
          }
        } catch {}
      }

      const panelModeVal = settings["nectar-panel-order-mode"] ?? localStorage.getItem("nectar-panel-order-mode");
      if (panelModeVal !== null && panelModeVal !== undefined) {
        const mode = normalizePanelOrderMode(panelModeVal);
        panelOrderModeRef.current = mode;
        setPanelOrderMode(mode);
      }
      const panelOrderVal = settings["nectar-panel-order"] ?? localStorage.getItem("nectar-panel-order");
      if (panelOrderVal !== null && panelOrderVal !== undefined) {
        const order = normalizePanelOrder(panelOrderVal);
        panelOrderRef.current = order;
        setPanelOrder(order);
      }
    }).catch(console.error);
  }, [windowLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Disable context menu globally
    const preventContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', preventContext);

    const unlistenVisibility = listen<boolean>("visibility-change", (event) => {
      setIsVisible(event.payload);
    });

    // Only this notch's events, the other monitor's notch shouldn't react.
    const thisWindow = getCurrentWebviewWindow();

    const unlistenNotchOverlap = thisWindow.listen<boolean>("notch-overlap", (event) => {
      setIsOverlapped(event.payload);
    });

    const unlistenNotchEdgeHover = thisWindow.listen<boolean>("notch-edge-hover", (event) => {
      setIsEdgeHovered(event.payload);
    });

    const unlistenSettingsReset = listen("settings-reset", () => {
      localStorage.clear();
      window.location.reload();
    });

    return () => {
      unlistenVisibility.then(f => f());
      unlistenNotchOverlap.then(f => f());
      unlistenNotchEdgeHover.then(f => f());
      unlistenSettingsReset.then(f => f());
      document.removeEventListener('contextmenu', preventContext);
    };
  }, [windowLabel]);

  // Settings sync — consolidated dispatch for all settings events
  useSettingsSync(
    {
      "nectar-weather-enabled": setSettingsWeatherEnabled,
      "nectar-calendar-enabled": setSettingsCalendarEnabled,
      "nectar-timer-enabled": setSettingsTimerEnabled,
      "nectar-timer-sound-enabled": setSettingsTimerSoundEnabled,
      "nectar-stopwatch-enabled": setSettingsStopwatchEnabled,
      "nectar-dual-clock-enabled": (v) => setSettingsDualClockEnabled(v === "true" || v === true),
      "nectar-dual-clock-timezone": (v) => setSettingsDualClockTimezone(normalizeTimezone(v)),
      "nectar-music-mode-enabled": setSettingsMusicModeEnabled,
      "nectar-music-compact-notch": setSettingsMusicCompactNotch,
      "nectar-media-visualizer-enabled": setSettingsVisualizerEnabled,
      "nectar-visualizer-enabled": setSettingsVisualizerEnabled,
      "nectar-media-album-art-enabled": setSettingsAlbumArtEnabled,
      "nectar-media-ambience-enabled": setSettingsAmbienceEnabled,
      "nectar-media-compact-glow-enabled": setSettingsCompactGlowEnabled,
      "nectar-media-layout": setMediaLayout,
      "nectar-corners-enabled": setSettingsCornersEnabled,
      "nectar-scale": setScale,
      "nectar-low-battery-threshold": setLowBatteryThreshold,
      "nectar-dock-enabled": setDockEnabled,
      "nectar-dock-mode": setDockMode,
      "nectar-notch-mode": refreshNotchMode,
      "nectar-notch-mode-by-monitor": refreshNotchMode,
      "nectar-notch-monitor-mode": refreshNotchMode,
      "nectar-notch-monitor-id": refreshNotchMode,
      "nectar-status-widgets": (value) => {
        try {
          const parsed = JSON.parse(value);
          if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
            setStatusWidgets(parsed);
          }
        } catch {}
      },
      "nectar-panel-order-mode": (value) => {
        const mode = normalizePanelOrderMode(value);
        panelOrderModeRef.current = mode;
        setPanelOrderMode(mode);
      },
      "nectar-panel-order": (value) => {
        const order = normalizePanelOrder(value);
        panelOrderRef.current = order;
        setPanelOrder(order);
      },
      "nectar-show-update-indicator": (value) => setShowUpdateIndicator(String(value) === "true"),
      "nectar-time-format-24h": setTimeFormat24h,
      "nectar-notch-expand-on-hover": (v) => setSettingsNotchExpandOnHover(v !== "false" && v !== false),
      "nectar-notch-hover-delay": (v) => setSettingsNotchHoverDelay(parseInt(String(v), 10) || 0),
      "nectar-notch-collapse-delay": (v) => setSettingsNotchCollapseDelay(parseInt(String(v), 10) || 0),
      "nectar-notch-hitbox-margin": (v) => setSettingsNotchHitboxMargin(parseInt(String(v), 10) || 0),
      "nectar-notch-scroll-sensitivity": (v) => setSettingsNotchScrollSensitivity((v as 'low' | 'normal' | 'high') || 'normal'),
      "nectar-notch-collapsed-width": (v) => setSettingsNotchCollapsedWidth(parseInt(String(v), 10) || 110),
      "nectar-notch-spring-bounciness": (v) => setSettingsNotchSpringBounciness(Number.isFinite(parseInt(String(v), 10)) ? parseInt(String(v), 10) : 40),
      "nectar-notch-animation-speed": (v) => setSettingsNotchAnimationSpeed(Number.isFinite(parseInt(String(v), 10)) ? parseInt(String(v), 10) : 75),
      "nectar-notch-reduce-motion": (v) => setSettingsNotchReduceMotion(v === "true" || v === true),
    },
    [windowLabel]
  );

  // Side effects: dock-enabled (skip first render — startup code handles initial state)
  useEffect(() => {
    if (windowLabel !== 'main') return;
    if (dockEnabledInitial.current) { dockEnabledInitial.current = false; return; }
    if (dockEnabled) {
      invoke("init_dock", { mode: localStorage.getItem("nectar-dock-mode") || "smart" });
    } else {
      invoke("toggle_dock", { enable: false });
    }
    setTimeout(() => invoke("sync_appbar"), 200);
  }, [dockEnabled, windowLabel]);

  // Side effects: dock-mode (skip first render)
  useEffect(() => {
    if (windowLabel !== 'main') return;
    if (dockModeInitial.current) { dockModeInitial.current = false; return; }
    invoke("change_dock_mode", { mode: dockMode });
    setTimeout(() => invoke("sync_appbar"), 200);
  }, [dockMode, windowLabel]);

  // Side effects: notch-mode (skip first render)
  useEffect(() => {
    if (windowLabel !== 'main') return;
    if (notchModeInitial.current) { notchModeInitial.current = false; return; }
    invoke("change_notch_mode", { mode: notchMode });
  }, [notchMode, windowLabel]);

  const [nectarMode, setNectarMode] = useState<'music' | 'calendar' | 'command-center' | 'status'>('status');
  const [ccView, setCcView] = useState<'main' | 'wifi' | 'bluetooth'>('main');
  const isKeyboardFocusActiveRef = useRef(false);
  const isPairingActiveRef = useRef(false);
  useEffect(() => {
    if (!isHovered || nectarMode !== 'command-center') {
      if (isKeyboardFocusActiveRef.current) {
        isKeyboardFocusActiveRef.current = false;
        invoke("set_window_keyboard_focus", { enabled: false, seq: null }).catch(() => {});
      }
      invoke("bluetooth_stop_discovery").catch(() => {});
      setCcView('main');
    }
  }, [isHovered, nectarMode]);

  useEffect(() => {
    // Safe reset of keyboard focus on mount and browser/webview unload/reload
    invoke("set_window_keyboard_focus", { enabled: false, seq: null }).catch(() => {});
    const onBeforeUnload = () => {
      invoke("set_window_keyboard_focus", { enabled: false, seq: null }).catch(() => {});
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  const [isShortcutsEmpty, setIsShortcutsEmpty] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("nectar-shortcuts");
      if (saved) {
        const parsed = JSON.parse(saved);
        return !Array.isArray(parsed) || parsed.length === 0;
      }
    } catch {
      // fallback
    }
    return true;
  });
  const caldav = useCaldav();
  const isPickerActiveRef = useRef(false);
  const isDraggingFileRef = useRef(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const isAddMenuOpenRef = useRef(false);
  const [isDevPinned, setIsDevPinned] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [pendingDropPaths, setPendingDropPaths] = useState<string[] | null>(null);
  const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpenedByDragRef = useRef(false);
  const dragPreModeRef = useRef<'music' | 'calendar' | 'command-center' | 'status' | null>(null);
  const leaveGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCursorPosRef = useRef<{ x: number; y: number } | null>(null);

  // Track pointer coordinates across the webview window
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      lastCursorPosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  const checkMouseAndCollapseIfNeeded = useCallback(() => {
    if (isPickerActiveRef.current || isDraggingFileRef.current || isAddMenuOpenRef.current || isDevPinnedRef.current || isKeyboardFocusActiveRef.current || isPairingActiveRef.current) {
      return;
    }

    let isMouseInside = false;
    if (nectarRef.current) {
      const rect = nectarRef.current.getBoundingClientRect();
      if (lastCursorPosRef.current) {
        const { x, y } = lastCursorPosRef.current;
        const margin = settingsNotchHitboxMargin;
        isMouseInside = (
          x >= (rect.left - margin) &&
          x <= (rect.right + margin) &&
          y >= (rect.top - margin) &&
          y <= (rect.bottom + margin)
        );
      }
      if (!isMouseInside) {
        isMouseInside = nectarRef.current.matches(':hover');
      }
    }

    if (!isMouseInside) {
      setIsHovered(false);
      setIsNotchHovered(false);
      isHoveredRef.current = false;
      const targetMode = mediaInfo.has_media && (isPlaying || isMusicPauseGraceRef.current) && settingsMusicCompactNotch ? 'music' : 'status';
      setNectarMode(targetMode);
    }
  }, [mediaInfo.has_media, isPlaying, settingsMusicCompactNotch]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (!isPickerActiveRef.current && !isAddMenuOpenRef.current && !isDraggingFileRef.current && !isDevPinnedRef.current && !isKeyboardFocusActiveRef.current && !isPairingActiveRef.current) {
        setTimeout(checkMouseAndCollapseIfNeeded, 60);
      }
    };
    const handleWindowBlur = () => {
      if (isKeyboardFocusActiveRef.current) {
        isKeyboardFocusActiveRef.current = false;
        invoke("set_window_keyboard_focus", { enabled: false, seq: null }).catch(() => {});
        setTimeout(checkMouseAndCollapseIfNeeded, 60);
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [checkMouseAndCollapseIfNeeded]);

  // DEV ONLY: Toggle Pin Shortcuts open with Alt+P, F8, or Ctrl+Shift+P (protected by feature flag)
  useEffect(() => {
    const isDevToolsEnabled = Boolean(
      import.meta.env.DEV &&
      (import.meta.env.VITE_NECTAR_SHOW_DEV_TOOLS === "1" ||
       (typeof window !== "undefined" && window.localStorage?.getItem("nectar-dev-tools") === "true"))
    );
    if (!isDevToolsEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') || (e.altKey && e.key.toLowerCase() === 'p') || e.key === 'F8') {
        e.preventDefault();
        setIsDevPinned((prev) => {
          const next = !prev;
          isDevPinnedRef.current = next;
          if (next) {
            setNectarMode('status');
            setIsHovered(true);
            console.log('[DEV_PIN] Shortcuts PINNED OPEN (Alt+P/F8). Hitbox active.');
          } else {
            console.log('[DEV_PIN] Shortcuts UNPINNED.');
            setTimeout(checkMouseAndCollapseIfNeeded, 60);
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [checkMouseAndCollapseIfNeeded]);

  const launchExternalQuickAction = useCallback((action: string | (() => void)) => {
    isForceCompactRef.current = true;
    setIsHovered(false);
    setIsNotchHovered(false);
    const targetMode = (mediaInfo.has_media && (isPlaying || isMusicPauseGraceRef.current) && settingsMusicCompactNotch) ? 'music' : 'status';
    setNectarMode(targetMode);

    if (nectarRef.current && isNotchWindow) {
      const compactWidth = Math.round(settingsNotchCollapsedWidth * scale);
      const compactHeight = Math.round(36 * scale);
      const compactX = Math.round((window.innerWidth - compactWidth) / 2);
      invoke('update_notch_rect', {
        rect: {
          x: compactX,
          y: 0,
          width: compactWidth,
          height: compactHeight,
        }
      }).catch(() => {});
      invoke('set_notch_hovered', { hovered: false }).catch(() => {});
    }

    if (typeof action === 'string') {
      if (action === 'open_notification_center') {
        invoke('open_notification_center').catch(console.error);
      } else {
        invoke("run_quick_action", { action }).catch(console.error);
      }
    } else {
      action();
    }
  }, [mediaInfo.has_media, isPlaying, settingsMusicCompactNotch, isNotchWindow]);

  const isInsideNotchRect = useCallback((pos: { x: number; y: number }, padX = 24, padY = 16) => {
    if (!nectarRef.current) return false;
    const rect = nectarRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssX = pos.x / dpr;
    const cssY = pos.y / dpr;

    const effectivePadX = (isHoveredRef.current || wasOpenedByDragRef.current) ? 40 : padX;
    const effectivePadY = (isHoveredRef.current || wasOpenedByDragRef.current) ? 32 : padY;

    return (
      cssX >= rect.left - effectivePadX &&
      cssX <= rect.right + effectivePadX &&
      cssY >= rect.top - 8 &&
      cssY <= rect.bottom + effectivePadY
    );
  }, []);

  const isHoveredRef = useRef(isHovered);
  useEffect(() => {
    isHoveredRef.current = isHovered;
  }, [isHovered]);

  const nectarModeRef = useRef(nectarMode);
  useEffect(() => {
    nectarModeRef.current = nectarMode;
  }, [nectarMode]);

  // Unified native Drag & Drop listener at App root level for Dynamic Island
  useEffect(() => {
    if (!isNotchWindow) return;

    let unlisten: (() => void) | undefined;
    let isSubscribed = true;

    const setupDragDrop = async () => {
      try {
        const webview = getCurrentWebview();
        invoke('register_notch_drag_drop').catch(() => {});
        if (import.meta.env.DEV) {
          console.log('[DRAG_DIAG] Registering onDragDropEvent for:', webview.label);
          invoke('save_setting', {
            key: 'nectar-drag-diag-status',
            value: JSON.stringify({ status: 'registered', label: webview.label, timestamp: Date.now() })
          }).catch(() => {});
        }

        let lastLogOverTime = 0;
        unlisten = await webview.onDragDropEvent((event) => {
          if (!isSubscribed) return;
          const payload = event.payload;

          if (import.meta.env.DEV) {
            const now = Date.now();
            const pos = 'position' in payload ? payload.position : null;
            const paths = 'paths' in payload ? payload.paths : null;

            if (payload.type === 'enter' || payload.type === 'drop' || payload.type === 'leave') {
              invoke('log_dev_drag_event', {
                windowLabel: 'main',
                eventType: payload.type,
                x: pos ? (pos as any).x : null,
                y: pos ? (pos as any).y : null,
                count: paths ? paths.length : null
              }).catch(() => {});
            }

            if (payload.type === 'enter' || payload.type === 'drop' || payload.type === 'leave') {
              const pos = 'position' in payload ? payload.position : null;
              const paths = 'paths' in payload ? payload.paths : null;
              const dpr = window.devicePixelRatio || 1;
              const diag = {
                type: payload.type,
                pos,
                cssPos: pos ? {
                  x: Math.round(pos.x / dpr),
                  y: Math.round(pos.y / dpr)
                } : null,
                isHovered: isHoveredRef.current,
                isDevPinned: isDevPinnedRef.current,
                mode: nectarModeRef.current,
                pathsCount: paths ? paths.length : 0,
                time: now
              };
              console.log('[DRAG_DIAG]', diag);
              invoke('save_setting', {
                key: 'nectar-drag-diag-last',
                value: JSON.stringify(diag)
              }).catch(() => {});
            } else if (payload.type === 'over') {
              // Minimal console-only logging for over (no settings.json writes to prevent disk spam)
              if (now - lastLogOverTime > 600) {
                lastLogOverTime = now;
                console.log('[DRAG_DIAG] over at:', payload.position);
              }
            }
          }

          if (payload.type === 'enter' || payload.type === 'over') {
            // Cancel any pending collapse grace timer as new native drag motion is active
            if (leaveGraceTimerRef.current) {
              clearTimeout(leaveGraceTimerRef.current);
              leaveGraceTimerRef.current = null;
            }

            const inside = isInsideNotchRect(payload.position);

            if (inside) {
              isDraggingFileRef.current = true;

              if (wasOpenedByDragRef.current) {
                // Keep Expanded state rock-solid during drag movement
                setIsHovered(true);
                setIsDropTargetActive(true);
              } else if (!isHoveredRef.current) {
                // If island is currently Compact (not hovered)
                if (!dragExpandTimerRef.current) {
                  dragExpandTimerRef.current = setTimeout(() => {
                    dragExpandTimerRef.current = null;
                    wasOpenedByDragRef.current = true;
                    dragPreModeRef.current = nectarModeRef.current;
                    setNectarMode('status');
                    setIsHovered(true);
                    setIsDropTargetActive(true);
                  }, 300); // 250-350ms per specification
                }
              } else {
                if (nectarModeRef.current === 'status') {
                  setIsDropTargetActive(true);
                }
              }
            } else {
              if (dragExpandTimerRef.current) {
                clearTimeout(dragExpandTimerRef.current);
                dragExpandTimerRef.current = null;
              }
              setIsDropTargetActive(false);

              // If already opened by drag, do not collapse instantly; schedule a 220ms grace period
              if (wasOpenedByDragRef.current && !leaveGraceTimerRef.current) {
                leaveGraceTimerRef.current = setTimeout(() => {
                  leaveGraceTimerRef.current = null;
                  isDraggingFileRef.current = false;
                  setIsDropTargetActive(false);
                  wasOpenedByDragRef.current = false;
                  setIsHovered(false);
                  if (dragPreModeRef.current) {
                    setNectarMode(dragPreModeRef.current);
                    dragPreModeRef.current = null;
                  }
                }, 220);
              }
            }
          } else if (payload.type === 'leave') {
            if (dragExpandTimerRef.current) {
              clearTimeout(dragExpandTimerRef.current);
              dragExpandTimerRef.current = null;
            }
            setIsDropTargetActive(false);

            if (!wasOpenedByDragRef.current) {
              isDraggingFileRef.current = false;
            } else {
              // Grace period: allow 220ms before collapsing to absorb transient leave events
              if (!leaveGraceTimerRef.current) {
                leaveGraceTimerRef.current = setTimeout(() => {
                  leaveGraceTimerRef.current = null;
                  isDraggingFileRef.current = false;
                  setIsDropTargetActive(false);
                  wasOpenedByDragRef.current = false;
                  setIsHovered(false);
                  if (dragPreModeRef.current) {
                    setNectarMode(dragPreModeRef.current);
                    dragPreModeRef.current = null;
                  }
                }, 220);
              }
            }
          } else if (payload.type === 'drop') {
            if (dragExpandTimerRef.current) {
              clearTimeout(dragExpandTimerRef.current);
              dragExpandTimerRef.current = null;
            }
            if (leaveGraceTimerRef.current) {
              clearTimeout(leaveGraceTimerRef.current);
              leaveGraceTimerRef.current = null;
            }

            const inside = isInsideNotchRect(payload.position);
            isDraggingFileRef.current = false;
            setIsDropTargetActive(false);

            if (inside && payload.paths && payload.paths.length > 0) {
              setNectarMode('status');
              setIsHovered(true);
              wasOpenedByDragRef.current = false;
              dragPreModeRef.current = null;

              setPendingDropPaths(payload.paths);
              window.dispatchEvent(
                new CustomEvent('nectar-drop-shortcuts', {
                  detail: { paths: payload.paths }
                })
              );
            } else {
              if (wasOpenedByDragRef.current) {
                wasOpenedByDragRef.current = false;
                setIsHovered(false);
                if (dragPreModeRef.current) {
                  setNectarMode(dragPreModeRef.current);
                  dragPreModeRef.current = null;
                }
              }
            }
          }
        });
      } catch (err) {
        console.error('Failed to setup drag and drop listener in App:', err);
        if (import.meta.env.DEV) {
          invoke('save_setting', {
            key: 'nectar-drag-diag-status',
            value: JSON.stringify({ status: 'error', error: String(err), timestamp: Date.now() })
          }).catch(() => {});
        }
      }
    };

    setupDragDrop();

    return () => {
      isSubscribed = false;
      if (dragExpandTimerRef.current) {
        clearTimeout(dragExpandTimerRef.current);
        dragExpandTimerRef.current = null;
      }
      if (leaveGraceTimerRef.current) {
        clearTimeout(leaveGraceTimerRef.current);
        leaveGraceTimerRef.current = null;
      }
      if (unlisten) unlisten();
    };
  }, [isNotchWindow, isInsideNotchRect]);

  // Window height is now kept constant to prevent rendering layout lag and sharp corners

  const wheelAccumRef = useRef(0);
  const wheelIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelStepThreshold = settingsNotchScrollSensitivity === 'high' ? 30 : (settingsNotchScrollSensitivity === 'low' ? 100 : 60);
  const WHEEL_IDLE_RESET_MS = 180;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('.cal-scroll') ||
      target.closest('.shortcuts-scroll-area') ||
      target.closest('.cv-root') ||
      target.closest('.cv-container') ||
      target.closest('.cv-list')
    ) {
      return;
    }

    if (!isHovered && nectarMode !== 'calendar') return;

    // Use absolute values to detect horizontal swipe gestures on trackpad
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 2) return; // Ignore near-zero noise

    wheelAccumRef.current += delta;
    if (wheelIdleTimeoutRef.current) clearTimeout(wheelIdleTimeoutRef.current);
    wheelIdleTimeoutRef.current = setTimeout(() => { wheelAccumRef.current = 0; }, WHEEL_IDLE_RESET_MS);

    if (Math.abs(wheelAccumRef.current) < wheelStepThreshold) return;
    const direction = wheelAccumRef.current > 0 ? 1 : -1;
    wheelAccumRef.current = 0;

    // Compute available panels in Smart or Custom order
    const currentMode = panelOrderModeRef.current;
    const currentOrder = panelOrderRef.current;
    const availableModes = getAvailablePanels({
      mode: currentMode,
      customOrder: currentOrder,
      isPlayingOrGrace: Boolean(isPlaying || isMusicPauseGraceRef.current),
      hasMedia: mediaInfo.has_media,
      musicModeEnabled: settingsMusicModeEnabled,
      productivityEnabled,
    });
    if (availableModes.length <= 1) return;

    setIsHovered(true);
    const nextMode = getNextPanelOnWheel(nectarMode, direction, availableModes);
    manualMusicRef.current = nextMode === 'music';
    setNectarMode(nextMode);
  }, [isHovered, nectarMode, isPlaying, mediaInfo.has_media, settingsMusicModeEnabled, productivityEnabled, settingsNotchScrollSensitivity, panelOrderMode, panelOrder]);



  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isCompactTimerVisible, setIsCompactTimerVisible] = useState(false);
  const [isTimerFinished, setIsTimerFinished] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerTargetEndMsRef = useRef<number | null>(null);

  const formatTimerTime = (totalSeconds: number) => {
    const mins = Math.floor(Math.abs(totalSeconds) / 60);
    const secs = Math.abs(totalSeconds) % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startTimerSeconds = (seconds: number) => {
    // Unlock audio on this click so the chime can play later.
    getTimerChimeCtx();
    const safeSeconds = Math.max(1, Math.floor(seconds));
    timerTargetEndMsRef.current = Date.now() + safeSeconds * 1000;
    setTimerSeconds(safeSeconds);
    setIsTimerRunning(true);
    setIsTimerFinished(false);
  };

  const toggleTimer = () => {
    if (!isTimerRunning) {
      if (timerSeconds <= 0) return;
      getTimerChimeCtx();
      timerTargetEndMsRef.current = Date.now() + timerSeconds * 1000;
      setIsTimerRunning(true);
    } else {
      if (timerTargetEndMsRef.current !== null) {
        const remaining = Math.max(0, Math.ceil((timerTargetEndMsRef.current - Date.now()) / 1000));
        setTimerSeconds(remaining);
      }
      timerTargetEndMsRef.current = null;
      setIsTimerRunning(false);
    }
  };
  const resetTimer = () => {
    timerTargetEndMsRef.current = null;
    setIsTimerRunning(false);
    setTimerSeconds(0);
    setIsTimerFinished(false);
  };

  const stopwatch = useStopwatch();

  useEffect(() => {
    if (!settingsTimerEnabled) resetTimer();
  }, [settingsTimerEnabled]);

  useEffect(() => {
    if (!settingsStopwatchEnabled) stopwatch.reset();
  }, [settingsStopwatchEnabled]);

  useEffect(() => {
    if (!isTimerRunning) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    if (timerSeconds <= 0) {
      timerTargetEndMsRef.current = null;
      setIsTimerRunning(false);
      setIsTimerFinished(true);
      return;
    }

    if (timerTargetEndMsRef.current === null) {
      timerTargetEndMsRef.current = Date.now() + timerSeconds * 1000;
    }

    const syncTimerRemaining = () => {
      if (timerTargetEndMsRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((timerTargetEndMsRef.current - Date.now()) / 1000));
      if (remaining <= 0) {
        timerTargetEndMsRef.current = null;
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setTimerSeconds(0);
        setIsTimerRunning(false);
        setIsTimerFinished(true);
      } else {
        setTimerSeconds(prev => (prev !== remaining ? remaining : prev));
      }
    };

    timerIntervalRef.current = setInterval(syncTimerRemaining, 250);
    window.addEventListener("focus", syncTimerRemaining);
    document.addEventListener("visibilitychange", syncTimerRemaining);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      window.removeEventListener("focus", syncTimerRemaining);
      document.removeEventListener("visibilitychange", syncTimerRemaining);
    };
  }, [isTimerRunning]);

  // On finish: chime, and peek the notch.
  const prevTimerFinishedRef = useRef(false);
  useEffect(() => {
    if (isTimerFinished && !prevTimerFinishedRef.current) {
      if (settingsTimerSoundEnabled) playTimerChime();
      if (notchMode === 'peek') triggerEventPeek(6000);
    }
    prevTimerFinishedRef.current = isTimerFinished;
  }, [isTimerFinished, settingsTimerSoundEnabled, notchMode, triggerEventPeek]);

  const lastTrackRef = useRef<string | null>(null);
  const lastPlayingRef = useRef<boolean>(false);
  const manualMusicRef = useRef<boolean>(false);

  // Auto-switch to music mode only when a *new* track starts while playing,
  // or when playback transitions from paused to playing.
  useEffect(() => {
    const isNewTrackWhilePlaying = mediaInfo.title !== lastTrackRef.current && isPlaying;
    const justStartedPlaying = isPlaying && !lastPlayingRef.current;

    // Peek notch on media events (play start or track change)
    if (notchMode === 'peek' && (isNewTrackWhilePlaying || justStartedPlaying)) {
      triggerEventPeek(3000);
    }

    // Only auto-switch if music mode is enabled
    if (settingsMusicModeEnabled && mediaInfo.has_media && isPlaying && nectarMode !== 'calendar' && (isNewTrackWhilePlaying || justStartedPlaying)) {
      // In Custom mode, protect active manual interaction: if user is hovered and viewing another panel, do not hijack
      if (panelOrderModeRef.current === 'custom' && isHovered && nectarMode !== 'music') {
        // do not switch away from current panel in Custom mode
      } else if ((settingsMusicCompactNotch || isHovered) && !isPickerActiveRef.current && !isDraggingFileRef.current && !isAddMenuOpen) {
        manualMusicRef.current = false;
        setNectarMode('music');
      }
    }

    lastTrackRef.current = mediaInfo.title;
    lastPlayingRef.current = isPlaying;
  }, [mediaInfo.has_media, isPlaying, mediaInfo.title, settingsMusicModeEnabled, settingsMusicCompactNotch, isHovered, nectarMode, notchMode, triggerEventPeek, isAddMenuOpen]);
  // Manage 5-second pause grace period + smooth in-place fade-out before width collapse
  useEffect(() => {
    const wasPlaying = prevPlayingRef.current;
    prevPlayingRef.current = isPlaying;

    const clearAllTimers = () => {
      if (pauseGraceTimerRef.current) {
        clearTimeout(pauseGraceTimerRef.current);
        pauseGraceTimerRef.current = null;
      }
      if (pauseFadeTimerRef.current) {
        clearTimeout(pauseFadeTimerRef.current);
        pauseFadeTimerRef.current = null;
      }
    };

    // Transition from Playing -> Paused
    if (wasPlaying && !isPlaying && mediaInfo.has_media && settingsMusicModeEnabled) {
      clearAllTimers();
      setIsMusicFadingOut(false);
      setIsMusicPauseGraceSync(true);

      pauseGraceTimerRef.current = setTimeout(() => {
        // Step 1: After 5s grace period, trigger in-place fade-out (visualizer and album art fade out without shifting)
        // Island width is maintained because isMusicPauseGrace is still true
        setIsMusicFadingOut(true);

        pauseFadeTimerRef.current = setTimeout(() => {
          // Step 2: Once fade-out finishes (200ms), end grace period and transition to status mode
          setIsMusicFadingOut(false);
          setIsMusicPauseGraceSync(false);
          if (!isHoveredRef.current) {
            setNectarMode((cur) => (cur === 'music' ? 'status' : cur));
          } else if (panelOrderModeRef.current !== 'custom' && !manualMusicRef.current) {
            setNectarMode((cur) => (cur === 'music' ? 'status' : cur));
          }
        }, 200);
      }, 5000);
    } else if (isPlaying) {
      // Resumed playback: clear pause grace & fade-out immediately
      clearAllTimers();
      setIsMusicFadingOut(false);
      setIsMusicPauseGraceSync(false);
    } else if (!mediaInfo.has_media) {
      // Media session ended: only clear immediately if we are NOT in active pause grace period
      // to protect against transient empty session packets from Windows GSMTC during pause transitions
      if (!isMusicPauseGraceRef.current) {
        clearAllTimers();
        setIsMusicFadingOut(false);
        setIsMusicPauseGraceSync(false);
        if (!isHoveredRef.current) {
          setNectarMode((cur) => (cur === 'music' ? 'status' : cur));
        } else if (panelOrderModeRef.current !== 'custom' && !manualMusicRef.current) {
          setNectarMode((cur) => (cur === 'music' ? 'status' : cur));
        }
      }
    }
  }, [isPlaying, mediaInfo.has_media, settingsMusicModeEnabled, setIsMusicPauseGraceSync]);

  useEffect(() => {
    return () => {
      if (pauseGraceTimerRef.current) clearTimeout(pauseGraceTimerRef.current);
      if (pauseFadeTimerRef.current) clearTimeout(pauseFadeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!productivityEnabled && nectarMode === 'calendar') {
      setNectarMode('status');
    }
  }, [productivityEnabled, nectarMode]);

  useEffect(() => {
    if (!settingsMusicModeEnabled && nectarMode === 'music') {
      setIsMusicPauseGraceSync(false);
      setIsMusicFadingOut(false);
      if (pauseGraceTimerRef.current) {
        clearTimeout(pauseGraceTimerRef.current);
        pauseGraceTimerRef.current = null;
      }
      if (pauseFadeTimerRef.current) {
        clearTimeout(pauseFadeTimerRef.current);
        pauseFadeTimerRef.current = null;
      }
      setNectarMode('status');
    }
  }, [settingsMusicModeEnabled, nectarMode, setIsMusicPauseGraceSync]);

  useEffect(() => {
    if (!settingsMusicCompactNotch && nectarMode === 'music' && !isHovered) {
      setNectarMode('status');
    }
  }, [settingsMusicCompactNotch, nectarMode, isHovered]);

  useEffect(() => {
    if (isPickerActiveRef.current || isDraggingFileRef.current || isAddMenuOpen) return;
    if (settingsMusicModeEnabled && settingsMusicCompactNotch && mediaInfo.has_media && isPlaying && nectarMode === 'status' && !isHovered) {
      setNectarMode('music');
    }
  }, [settingsMusicModeEnabled, settingsMusicCompactNotch, mediaInfo.has_media, isPlaying, nectarMode, isHovered, isAddMenuOpen]);

  // Update time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: !timeFormat24h,
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    // Toggle compact timer view every 5 seconds if running
    let timerToggleInterval: any;
    if ((isTimerRunning || stopwatch.running) && nectarMode !== 'calendar') {
      timerToggleInterval = setInterval(() => {
        setIsCompactTimerVisible(prev => !prev);
      }, 5000);
    } else {
      setIsCompactTimerVisible(false);
    }

    return () => {
      clearInterval(interval);
      if (timerToggleInterval) clearInterval(timerToggleInterval);
    };
  }, [isTimerRunning, stopwatch.running, nectarMode, timeFormat24h]);

  // Battery API
  useEffect(() => {
    let battery: any = null;

    const initBattery = async () => {
      try {
        battery = await (navigator as any).getBattery();

        const updateBattery = () => {
          setBatteryLevel(Math.round(battery.level * 100));
          setIsCharging(battery.charging);
        };

        updateBattery();

        battery.addEventListener("levelchange", updateBattery);
        battery.addEventListener("chargingchange", updateBattery);

        return () => {
          battery.removeEventListener("levelchange", updateBattery);
          battery.removeEventListener("chargingchange", updateBattery);
        };
      } catch (e) {
        // Battery API not supported
      }
    };

    initBattery();
  }, []);

  // Listen for Volume Changes
  useEffect(() => {
    const unlisten = listen<{ volume: number; is_muted: boolean }>("volume-change", (event) => {
      setVolume(event.payload.volume);
      if (event.payload.volume > 0) {
        lastNonZeroVolumeRef.current = event.payload.volume;
      }
      setIsMuted(event.payload.is_muted);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Wi-Fi has three states (off, on, connected) and the radio state can't tell them apart.
  // Returns false so startup can retry.
  const refreshWifiStatus = useCallback(async (): Promise<boolean> => {
    try {
      setWifiStatus(await invoke<WifiStatus>("get_wifi_status"));
      return true;
    } catch {
      return false;
    }
  }, []);

  // Seed the Wi-Fi pill. The first call can fail while the WLAN service is starting, so retry.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const initializeWifiStatus = async (attempt: number) => {
      const loaded = await refreshWifiStatus();
      if (!loaded && !cancelled && attempt < 3) {
        retryTimer = setTimeout(() => void initializeWifiStatus(attempt + 1), (attempt + 1) * 1000);
      }
    };
    void initializeWifiStatus(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refreshWifiStatus]);

  // Keep Wi-Fi fresh while the command center is open (keyboard toggle, Windows quick settings).
  useEffect(() => {
    if (nectarMode !== 'command-center') return;
    void refreshWifiStatus();
    const interval = setInterval(() => void refreshWifiStatus(), 5000);
    return () => clearInterval(interval);
  }, [nectarMode, refreshWifiStatus]);

  // Load bluetooth/volume/brightness state on mount
  useEffect(() => {
    invoke<boolean>("get_bluetooth_state").then(setBluetoothEnabled).catch(() => { });
    invoke<boolean>("get_battery_saver_state").then(setBatterySaverEnabled).catch(() => { });
    invoke<boolean>("has_battery").then(setHasBattery).catch(() => { });
    invoke<{ volume: number; is_muted: boolean }>("get_volume_state")
      .then((state) => {
        setVolume(state.volume);
        if (state.volume > 0) {
          lastNonZeroVolumeRef.current = state.volume;
        }
        setIsMuted(state.is_muted);
      })
      .catch(() => { });
    invoke<number>("get_brightness").then(setCurrentBrightness).catch(() => { });

    // Poll battery saver state every 5s (since we can't listen for changes)
    const interval = setInterval(() => {
      invoke<boolean>("get_battery_saver_state").then(setBatterySaverEnabled).catch(() => { });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Poll system metrics for status widgets
  useEffect(() => {
    const fetchMetrics = () => {
      invoke<number>("get_cpu_usage").then(setCpuUsage).catch((e) => console.warn("CPU:", e));
      invoke<number>("get_ram_usage").then(setRamUsage).catch((e) => console.warn("RAM:", e));
      invoke<number>("get_disk_space").then(setDiskSpace).catch((e) => console.warn("Disk:", e));
      invoke<[number, number]>("get_network_speed").then(([up, down]) => {
        setNetUpSpeed(up);
        setNetDownSpeed(down);
      }).catch(() => {});
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen for brightness changes
  useEffect(() => {
    const unlisten = listen<{ brightness: number }>("brightness-change", (event) => {
      setCurrentBrightness(event.payload.brightness);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Native Windows Media Controls - Listen for updates from background worker
  useEffect(() => {
    const unlistenUpdate = listen<MediaInfo>("media-update", (event) => {
      const info = event.payload;
      if (!info) return;

      if (import.meta.env.DEV) {
        mediaIpcMetricsRef.current.mediaUpdateCount++;
        const artLen = info.artwork?.[0]?.length ?? 0;
        if (artLen > 0) {
          mediaIpcMetricsRef.current.artworkPayloadCount++;
          mediaIpcMetricsRef.current.approxBytesReceived += artLen;
        }
        mediaIpcMetricsRef.current.approxBytesReceived += 300;
      }

      setMediaInfo(prev => {
        // If this is marked as a timeline-only update
        if (info.is_timeline_update) {
          if (prev.title !== info.title || prev.artist !== info.artist) {
            return prev; // Ignore stale timeline update from different track
          }
          if (prev.position_ms === info.position_ms && prev.duration_ms === info.duration_ms && prev.is_playing === info.is_playing) {
            return prev;
          }
          return {
            ...prev,
            position_ms: info.position_ms,
            duration_ms: info.duration_ms,
            position_updated_at: info.position_updated_at,
            is_playing: info.is_playing,
          };
        }

        // Full metadata update:
        // Find if artwork changed by checking the first element
        const prevArt = prev.artwork?.[0];
        const nextArt = info.artwork?.[0];
        const artChanged = prevArt !== nextArt;

        if (prev.title === info.title &&
          prev.artist === info.artist &&
          prev.is_playing === info.is_playing &&
          prev.has_media === info.has_media &&
          !artChanged &&
          prev.position_ms === info.position_ms &&
          prev.duration_ms === info.duration_ms) {
          return prev;
        }

        // Update playing state separately for the hook triggers
        const wasPlaying = isPlayingRef.current;
        const nextPlaying = info.is_playing;
        if (wasPlaying && !nextPlaying && (info.has_media || prev.has_media) && settingsMusicModeEnabledRef.current) {
          // Synchronously activate pause grace in same batch to prevent 1-render flicker / unmount
          setIsMusicPauseGraceSync(true);
        }
        setIsPlaying(info.is_playing);

        if (info.artwork && info.artwork.length > 0) {
          const newArt = info.artwork[0];
          setAlbumArtUrl(prev => {
            if (prev !== newArt) {
              setAlbumArtKey(k => k + 1);
              return newArt;
            }
            return prev;
          });
        } else if (!info.has_media || prev.title !== info.title || prev.artist !== info.artist) {
          // Only clear artwork if media was removed or we actually switched to a track with no art
          setAlbumArtUrl(null);
        }

        return {
          ...info,
          // If artwork is omitted for the same track, keep previous artwork
          artwork: (info.artwork && info.artwork.length > 0) ? info.artwork : (prev.title === info.title && prev.artist === info.artist ? prev.artwork : undefined)
        };
      });
    });

    const unlistenTimeline = listen<MediaTimelineUpdate>("media-timeline", (event) => {
      const timeline = event.payload;
      if (!timeline) return;

      if (import.meta.env.DEV) {
        mediaIpcMetricsRef.current.mediaTimelineCount++;
        mediaIpcMetricsRef.current.approxBytesReceived += 120;
      }

      setMediaInfo(prev => {
        // Guard against out-of-order timeline packets from a previous track
        if (prev.title !== timeline.title || prev.artist !== timeline.artist) {
          return prev;
        }
        if (prev.position_ms === timeline.position_ms && prev.duration_ms === timeline.duration_ms) {
          return prev;
        }
        return {
          ...prev,
          position_ms: timeline.position_ms,
          duration_ms: timeline.duration_ms,
          position_updated_at: timeline.position_updated_at,
        };
      });
    });

    return () => {
      unlistenUpdate.then(fn => fn());
      unlistenTimeline.then(fn => fn());
    };
  }, []);

  // Media controls via Tauri commands
  /* Unused saveAndBroadcast removed to fix TS build error */
  const togglePlayPause = useCallback(async () => {
    try {
      if (isPlaying && mediaInfo.has_media && settingsMusicModeEnabled) {
        setIsMusicPauseGraceSync(true);
      }
      await invoke("media_play_pause");
      setIsPlaying(!isPlaying);
    } catch (e) {
      console.error("Failed to toggle play/pause:", e);
    }
  }, [isPlaying, mediaInfo.has_media, settingsMusicModeEnabled, setIsMusicPauseGraceSync]);


  const skipNext = useCallback(async () => {
    try {
      await invoke("media_next");
    } catch (e) {
      console.error("Failed to skip next:", e);
    }
  }, []);

  const skipPrevious = useCallback(async () => {
    try {
      await invoke("media_previous");
    } catch (e) {
      console.error("Failed to skip previous:", e);
    }
  }, []);

  // Slide-push animation for prev/next buttons
  const prevFront = useAnimation();
  const prevBack = useAnimation();
  const nextFront = useAnimation();
  const nextBack = useAnimation();

  const animatePrev = useCallback(async () => {
    prevFront.set({ x: 0 });
    prevBack.set({ x: 30 });
    prevFront.start({ x: -30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
    await prevBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
    skipPrevious();
  }, [skipPrevious, prevFront, prevBack]);

  const animateNext = useCallback(async () => {
    nextFront.set({ x: 0 });
    nextBack.set({ x: -30 });
    nextFront.start({ x: 30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
    await nextBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
    skipNext();
  }, [skipNext, nextFront, nextBack]);

  const sendVolume = useTrailingThrottle((newVol: number) => {
    invoke("set_volume", { volume: newVol }).catch(() => {});
  }, 50);

  const handleVolumeChange = useCallback((newVol: number) => {
    setVolume(newVol);
    if (newVol > 0) {
      lastNonZeroVolumeRef.current = newVol;
    }
    // set_volume unmutes for any non-zero level.
    setIsMuted(newVol === 0);
    sendVolume(newVol);
  }, [sendVolume]);

  const toggleMute = useCallback(() => {
    if (displayVolume === 0) {
      handleVolumeChange(lastNonZeroVolumeRef.current || 0.3);
    } else {
      if (volume > 0) {
        lastNonZeroVolumeRef.current = volume;
      }
      handleVolumeChange(0);
    }
  }, [displayVolume, volume, handleVolumeChange]);


  // Open WiFi settings
  const openWifiSettings = useCallback(async () => {
    try {
      await invoke("open_wifi_settings");
    } catch (e) {
      console.error("Failed to open WiFi settings:", e);
    }
  }, []);

  // WiFi toggle
  const toggleWifi = useCallback(async () => {
    const previous = wifiStatus;
    const newState = !(previous?.enabled ?? false);
    setWifiStatus({ enabled: newState, connected: newState ? (previous?.connected ?? false) : false });
    try {
      await invoke("set_wifi_state", { enabled: newState });
      // The radio and association take a moment to settle.
      setTimeout(() => void refreshWifiStatus(), 800);
    } catch (e) {
      setWifiStatus(previous);
      console.error("Failed to toggle WiFi:", e);
    }
  }, [wifiStatus, refreshWifiStatus]);

  // Bluetooth toggle
  const toggleBluetooth = useCallback(async () => {
    const newState = !bluetoothEnabled;
    setBluetoothEnabled(newState);
    try {
      await invoke("set_bluetooth_state", { enabled: newState });
    } catch (e) {
      setBluetoothEnabled(!newState);
      console.error("Failed to toggle Bluetooth:", e);
    }
  }, [bluetoothEnabled]);

  // Battery Saver - opens settings (no public API to toggle without admin)
  const openBatterySaverSettings = useCallback(async () => {
    try {
      await invoke("open_battery_saver_settings");
    } catch (e) {
      console.error("Failed to open Battery Saver settings:", e);
    }
  }, []);
  void [batterySaverEnabled, openBatterySaverSettings, openWifiSettings];


  // Brightness change with throttling
  const sendBrightness = useTrailingThrottle((newVal: number) => {
    invoke("set_brightness", { brightness: newVal }).catch(() => {});
  }, 50);

  const handleBrightnessChange = useCallback((newVal: number) => {
    setCurrentBrightness(newVal);
    sendBrightness(newVal);
  }, [sendBrightness]);

  const openSettingsWindow = useCallback(async () => {
    try {
      await invoke("open_settings_window");
    } catch (e) {
      console.error("Failed to open settings window:", e);
    }
  }, []);

  const handleWifiRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCcView('wifi');
  }, []);

  const toggleDockModeSetting = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMode = dockMode === "fixed" ? "smart" : dockMode === "smart" ? "peek" : "fixed";
    setDockMode(nextMode);
    localStorage.setItem("nectar-dock-mode", nextMode);
    invoke("save_setting", { key: "nectar-dock-mode", value: nextMode }).catch(console.error);
    try {
      await invoke("change_dock_mode", { mode: nextMode });
    } catch (err) {
      console.error("Failed to change dock mode:", err);
    }
  }, [dockMode]);

  const toggleNotchModeSetting = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMode = notchMode === "fixed" ? "smart" : notchMode === "smart" ? "peek" : "fixed";
    setNotchMode(nextMode);
    try {
      await invoke("set_notch_mode_for_window", { mode: nextMode });
      await invoke("change_notch_mode", { mode: nextMode });
    } catch (err) {
      console.error("Failed to change notch mode:", err);
    }
  }, [notchMode]);

  const handleBluetoothRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCcView('bluetooth');
  }, []);



  const toggleCalendarMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTimerFinished) {
      resetTimer();
      return;
    }
    if (!productivityEnabled) return;

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    if (nectarMode === 'calendar') {
      if (!settingsNotchExpandOnHover) {
        setIsHovered(false);
      }
      // Return to music mode if media is present and playing and music mode is enabled, otherwise status
      const targetMode = (settingsMusicModeEnabled && mediaInfo.has_media && (isPlaying || isMusicPauseGraceRef.current)) ? 'music' : 'status';
      setNectarMode(targetMode);
    } else {
      setIsHovered(true);
      setNectarMode('calendar');
    }
  };

  // Render a status widget by ID
  const renderStatusWidget = (id: string) => {
    switch (id) {
      case "weather":
        if (!settingsWeatherEnabled || temperature === null) return null;
        return (
          <div className="passive-feature" key="weather" data-tooltip={cityName ? `${weatherCondition} — ${cityName}` : weatherCondition}>
            <WeatherIcon size={12} strokeWidth={2.2} />
            <span className="label">{temperature}°{tempUnit === "fahrenheit" ? "F" : "C"}</span>
          </div>
        );
      case "battery":
        if (!hasBattery) return null;
        return (
          <div className="passive-feature" key="battery">
            <BatteryIcon charging={isCharging} level={batteryLevel} threshold={lowBatteryThreshold} />
            <span className="label">{batteryLevel}%</span>
          </div>
        );
      case "cpu":
        return (
          <div className="passive-feature" key="cpu" data-tooltip={t("widget.cpuUsage")}>
            <Cpu size={12} strokeWidth={2} />
            <span className="label">{cpuUsage}%</span>
          </div>
        );
      case "ram":
        return (
          <div className="passive-feature" key="ram" data-tooltip={t("widget.ramUsage")}>
            <MemoryStick size={12} strokeWidth={2} />
            <span className="label">{Math.round(ramUsage)}%</span>
          </div>
        );
      case "disk":
        return (
          <div className="passive-feature" key="disk" data-tooltip={t("widget.diskFree")}>
            <HardDrive size={12} strokeWidth={2} />
            <span className="label">{diskSpace}GB</span>
          </div>
        );
      case "net":
        return (
          <div className="passive-feature" key="net" data-tooltip={t("widget.netSpeed")}>
            <ArrowUpDown size={12} strokeWidth={2} />
            <span className="label">↑{formatBytes(netUpSpeed)} ↓{formatBytes(netDownSpeed)}</span>
          </div>
        );
      default:
        return null;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  };

  const isCalendarMode = nectarMode === 'calendar';

  // Music display modes: separates expanded music player vs collapsed compact notch music
  const { isExpandedMusicMode, isCompactMusicActive, isMusicMode } = useMemo(() => {
    return computeMusicDisplayModes({
      isHovered,
      isCalendarMode,
      settingsMusicModeEnabled,
      settingsMusicCompactNotch,
      nectarMode,
      hasMedia: mediaInfo.has_media,
      panelOrderMode,
      isPlaying,
      isMusicPauseGrace,
    });
  }, [
    isHovered,
    isCalendarMode,
    settingsMusicModeEnabled,
    settingsMusicCompactNotch,
    nectarMode,
    mediaInfo.has_media,
    panelOrderMode,
    isPlaying,
    isMusicPauseGrace,
  ]);

  const isCompactUpdateIndicatorAllowed = useMemo(() => {
    if (isHovered) return true;
    const clockNeedsMoreSpace = !timeFormat24h || isCompactTimerVisible;
    const minWidthRequired = clockNeedsMoreSpace ? 150 : 135;
    return settingsNotchCollapsedWidth >= minWidthRequired;
  }, [isHovered, timeFormat24h, isCompactTimerVisible, settingsNotchCollapsedWidth]);

  // Calculate width dynamically based on enabled features
  const getDynamicWidth = () => {
    if (isCalendarMode && isHovered) return settingsCalendarEnabled && showClockColumn ? 480 : settingsCalendarEnabled ? 310 : 270;
    if (nectarMode === 'command-center' && isHovered) return 580;
    if (nectarMode === 'status' && isHovered) {
      const totalWidgets = statusWidgets.left.length + statusWidgets.right.length;
      const minW = isShortcutsEmpty ? 380 : 360;
      return Math.max(minW, Math.min(220 + totalWidgets * 65, 480));
    }
    if (isExpandedMusicMode) return mediaLayout === 'compact' ? 300 : 340;
    if ((showPowerPulse || showLowBatteryPulse || showUpdatePulse) && !isHovered) return 200;

    let w = settingsNotchCollapsedWidth;
    if (isCompactMusicActive) {
      if (settingsVisualizerEnabled && (isPlaying || isMusicPauseGrace)) w += 30;
      if (settingsAlbumArtEnabled) w += 30;
    }

    return w;
  };

  const getDynamicHeight = () => {
    if (!isExpanded || isHidden) {
      return isImpacted ? 28.9 : 44.2;
    }
    if (nectarMode === 'calendar') {
      if (!isHovered) return 36;
      const dualClockBonus = settingsDualClockEnabled ? 46 : 0;
      if (settingsCalendarEnabled) return (caldav.connected ? 350 : 310) + dualClockBonus;
      if (showClockColumn) return 262 + dualClockBonus;
      return 124;
    }
    if (nectarMode === 'command-center') return isHovered ? 312 : 36;
    if (nectarMode === 'status') return isHovered ? (isShortcutsEmpty ? 210 : 108) : 36;
    if (isExpandedMusicMode) {
      const hasProgressBar = (mediaInfo.duration_ms ?? 0) > 0;
      let h = mediaLayout === 'compact' ? (hasProgressBar ? 132 : 116) : 120;
      if (mediaLayout === 'compact') {
        if (compactVolumeExpanded) h += 36;
      }
      return h;
    }
    return 36;
  };

  // DEV-ONLY Instrumentation refs & state for tracking exit lifecycle and state snapshots
  const outerExitStartRef = useRef(0);
  const outerExitCompleteRef = useRef(0);
  const innerExitStartRef = useRef(0);
  const innerExitCompleteRef = useRef(0);
  const latestSnapshotRef = useRef<any>(null);
  const lastHoverEndRef = useRef<{ timestamp: number; collapseDelay: number; timeoutCreated: boolean } | null>(null);
  const transitionPerfRef = useRef<{
    lastModeChangeTime: number;
    ipcCount: number;
    fpsFrames: number;
    slowFrames: number;
    maxFrameDurationMs: number;
    avgFps: number;
  }>({
    lastModeChangeTime: 0,
    ipcCount: 0,
    fpsFrames: 0,
    slowFrames: 0,
    maxFrameDurationMs: 0,
    avgFps: 60,
  });

  const mediaIpcMetricsRef = useRef<{
    mediaUpdateCount: number;
    mediaTimelineCount: number;
    artworkPayloadCount: number;
    approxBytesReceived: number;
    startTime: number;
  }>({
    mediaUpdateCount: 0,
    mediaTimelineCount: 0,
    artworkPayloadCount: 0,
    approxBytesReceived: 0,
    startTime: performance.now(),
  });

  const takeDiagnosticSnapshot = useCallback(() => {
    if (!import.meta.env.DEV) return null;
    const actualRect = nectarRef.current?.getBoundingClientRect();
    const domViews: string[] = [];
    if (document.querySelector('.expanded-music-container')) domViews.push('expanded-music');
    if (document.querySelector('.main-row')) domViews.push('main-row');
    if (document.querySelector('.command-center-content-minimal')) domViews.push('command-center-panel');
    if (document.querySelector('.calendar-timer-content')) domViews.push('calendar-panel');
    if (document.querySelector('.shortcuts-bar') || document.querySelector('.shortcuts-scroll-area')) domViews.push('shortcuts-row');
    if (document.querySelector('.compact-album-glow-wrapper')) domViews.push('compact-glow-wrapper');

    const now = performance.now();
    const outerExitPendingDuration = outerExitStartRef.current > outerExitCompleteRef.current
      ? Math.round(now - outerExitStartRef.current)
      : null;
    const isStandardViewMounted = domViews.includes('main-row');
    const innerExitPendingDuration = (isStandardViewMounted && innerExitStartRef.current > innerExitCompleteRef.current)
      ? Math.round(now - innerExitStartRef.current)
      : null;

    // Distinguish normal pending exit (< 500ms) from stuck exit (> 600ms)
    const outerExitStuck = outerExitPendingDuration !== null && outerExitPendingDuration > 600;
    const innerExitStuck = innerExitPendingDuration !== null && innerExitPendingDuration > 600;

    const targetW = getDynamicWidth();
    const targetH = getDynamicHeight();
    const actualW = actualRect ? Math.round(actualRect.width) : null;
    const actualH = actualRect ? Math.round(actualRect.height) : null;

    const domMismatchSettled = (
      (nectarMode !== 'music' && domViews.includes('expanded-music')) ||
      (nectarMode === 'music' && isHovered && !domViews.includes('expanded-music')) ||
      (nectarMode === 'command-center' && isHovered && domViews.includes('shortcuts-row')) ||
      (nectarMode === 'calendar' && isHovered && domViews.includes('shortcuts-row'))
    );
    const heightMismatchSettled = actualH !== null && Math.abs(actualH - targetH) > 15;

    const snap = {
      timestamp: new Date().toLocaleTimeString(),
      nectarMode,
      isHovered,
      isMusicMode,
      isCalendarMode,
      collapseDelay: settingsNotchCollapseDelay,
      hasPendingCollapseTimeout: collapseTimeoutRef.current !== null,
      lastHoverEnd: lastHoverEndRef.current,
      targetDimensions: { width: targetW, height: targetH },
      actualDimensions: { width: actualW, height: actualH },
      domViews,
      outerExit: {
        animatePresenceBypassed: true,
        currentBranch: (isHovered && isMusicMode && !isCalendarMode) ? 'expanded-music' : 'standard-view-group',
        rawPendingDurationMs: outerExitPendingDuration,
        isStuckRecorded: outerExitStuck,
      },
      innerExit: {
        isPending: innerExitPendingDuration !== null,
        pendingDurationMs: innerExitPendingDuration,
        isStuck: innerExitStuck,
        lastStartedMsAgo: innerExitStartRef.current ? Math.round(now - innerExitStartRef.current) : null,
        lastCompletedMsAgo: innerExitCompleteRef.current ? Math.round(now - innerExitCompleteRef.current) : null,
      },
      analysis: {
        domMismatchSettled,
        heightMismatchSettled,
        exitStuckDetected: innerExitStuck,
      },
      transitionPerf: transitionPerfRef.current,
      mediaIpc: {
        mediaUpdateCount: mediaIpcMetricsRef.current.mediaUpdateCount,
        mediaTimelineCount: mediaIpcMetricsRef.current.mediaTimelineCount,
        artworkPayloadCount: mediaIpcMetricsRef.current.artworkPayloadCount,
        approxBytesReceived: mediaIpcMetricsRef.current.approxBytesReceived,
        eventsPerMinute: Math.round(((mediaIpcMetricsRef.current.mediaUpdateCount + mediaIpcMetricsRef.current.mediaTimelineCount) / Math.max(0.1, (now - mediaIpcMetricsRef.current.startTime) / 60000)) * 10) / 10,
        bytesPerMinute: Math.round(mediaIpcMetricsRef.current.approxBytesReceived / Math.max(0.1, (now - mediaIpcMetricsRef.current.startTime) / 60000)),
        visualizerEngine: "direct-raf-lerp-zero-render",
      },
    };

    latestSnapshotRef.current = snap;
    (window as any).__NECTAR_DEBUG_SNAPSHOT__ = snap;
    try {
      localStorage.setItem('nectar_debug_snapshot', JSON.stringify(snap, null, 2));
    } catch {}

    return snap;
  }, [nectarMode, isHovered, isMusicMode, isCalendarMode, settingsNotchCollapseDelay]);

  // Deliberate user action to copy snapshot (NO automatic clipboard overwriting)
  const copySnapshotToClipboard = useCallback(() => {
    if (!import.meta.env.DEV) return;
    const snap = takeDiagnosticSnapshot();
    if (!snap) return;
    const text = JSON.stringify(snap, null, 2);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        console.info('[Nectar Debug] Snapshot successfully copied to clipboard');
      }).catch((err) => {
        console.warn('[Nectar Debug] Clipboard writeText failed:', err);
      });
    }
  }, [takeDiagnosticSnapshot]);

  // Track outer branch transition start
  const outerBranchKey = isExpandedMusicMode ? 'expanded-music' : 'standard-view-group';
  const prevOuterBranchRef = useRef(outerBranchKey);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (prevOuterBranchRef.current !== outerBranchKey) {
      outerExitStartRef.current = performance.now();
      prevOuterBranchRef.current = outerBranchKey;
    }
  }, [outerBranchKey]);

  // Track inner branch transition start
  const innerBranchKey = (nectarMode === 'status' && isHovered)
    ? 'shortcuts-row'
    : (nectarMode === 'command-center' && isHovered)
    ? 'command-center-panel'
    : (productivityEnabled && isCalendarMode && isHovered)
    ? 'calendar-panel'
    : 'none';
  const prevInnerBranchRef = useRef(innerBranchKey);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (prevInnerBranchRef.current !== innerBranchKey) {
      innerExitStartRef.current = performance.now();
      prevInnerBranchRef.current = innerBranchKey;
    }
  }, [innerBranchKey]);

  // DEV-ONLY Transition Frame Pacing and IPC Monitor
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const startTime = performance.now();
    ipcCountSinceLastTransitionRef.current = 0;
    let frameCount = 0;
    let slowCount = 0;
    let maxDelta = 0;
    let lastFrameTime = startTime;
    let active = true;

    const measure = (now: number) => {
      if (!active) return;
      frameCount++;
      const delta = now - lastFrameTime;
      lastFrameTime = now;
      if (delta > maxDelta) maxDelta = delta;
      if (delta > 16.67) slowCount++;

      if (now - startTime < 350) {
        requestAnimationFrame(measure);
      } else {
        const elapsed = now - startTime;
        transitionPerfRef.current = {
          lastModeChangeTime: Math.round(startTime),
          ipcCount: ipcCountSinceLastTransitionRef.current,
          fpsFrames: frameCount,
          slowFrames: slowCount,
          maxFrameDurationMs: Math.round(maxDelta * 10) / 10,
          avgFps: Math.round((frameCount / (elapsed / 1000)) * 10) / 10,
        };
      }
    };
    const raf = requestAnimationFrame(measure);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [nectarMode, isHovered]);

  // 1-second settled snapshot after mode or hover change
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const timer = setTimeout(() => {
      takeDiagnosticSnapshot();
    }, 1000);
    return () => clearTimeout(timer);
  }, [nectarMode, isHovered, isMusicMode, takeDiagnosticSnapshot]);

  // User gesture triggers on .nectar: Middle-Click (wheel click) or Ctrl+Click
  // Does NOT require window keyboard focus
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const el = nectarRef.current;
    if (!el) return;

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) { // Middle click (scroll wheel click)
        e.preventDefault();
        e.stopPropagation();
        copySnapshotToClipboard();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (e.ctrlKey && e.button === 0) { // Ctrl + Left Click
        e.preventDefault();
        e.stopPropagation();
        copySnapshotToClipboard();
      }
    };

    el.addEventListener('auxclick', handleAuxClick);
    el.addEventListener('pointerdown', handlePointerDown);
    return () => {
      el.removeEventListener('auxclick', handleAuxClick);
      el.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [copySnapshotToClipboard]);

  // Keyboard shortcut Ctrl+Shift+D as secondary trigger when window has focus
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        copySnapshotToClipboard();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySnapshotToClipboard]);

  // Close compact media player expansions when notch is unhovered or mode changes
  useEffect(() => {
    if (mediaLayout === 'compact') {
      setCompactVolumeExpanded(false);
    }
  }, [isHovered, mediaLayout, nectarMode]);

  const triggerExpand = useCallback(() => {
    const wasCollapsed = !isHoveredRef.current;
    setIsHovered(true);
    if (isPickerActiveRef.current || isAddMenuOpenRef.current || isDraggingFileRef.current) {
      return;
    }
    if (!wasCollapsed) {
      return;
    }

    if (panelOrderModeRef.current === 'custom') {
      const availablePanels = getAvailablePanels({
        mode: 'custom',
        customOrder: panelOrderRef.current,
        isPlayingOrGrace: Boolean(isPlaying || isMusicPauseGraceRef.current),
        hasMedia: mediaInfo.has_media,
        musicModeEnabled: settingsMusicModeEnabled,
        productivityEnabled,
      });
      const firstPanel = availablePanels[0] || 'status';
      manualMusicRef.current = firstPanel === 'music';
      setNectarMode(firstPanel);
    } else {
      setNectarMode(prev => {
        if (prev === 'status' || prev === 'calendar' || prev === 'command-center') {
          return prev;
        }
        return (mediaInfo.has_media && (isPlaying || isMusicPauseGraceRef.current)) ? 'music' : 'status';
      });
    }
  }, [isPlaying, mediaInfo.has_media, settingsMusicModeEnabled, productivityEnabled]);

  const triggerCollapse = useCallback(() => {
    if (isPickerActiveRef.current || isDraggingFileRef.current || isAddMenuOpenRef.current || isDevPinnedRef.current || isKeyboardFocusActiveRef.current || isPairingActiveRef.current) return;
    setIsHovered(false);
    setIsNotchHovered(false);
    isHoveredRef.current = false;
    const targetMode = mediaInfo.has_media && (isPlaying || isMusicPauseGraceRef.current) && settingsMusicCompactNotch ? 'music' : 'status';
    if (nectarMode === 'music') {
      setNectarMode(targetMode);
    } else if (nectarMode === 'command-center' || nectarMode === 'calendar' || nectarMode === 'status') {
      setNectarMode(targetMode);
    }
  }, [isPlaying, mediaInfo.has_media, settingsMusicCompactNotch, nectarMode]);

  const speedFactor = Math.max(0.2, (settingsNotchAnimationSpeed || 100) / 100);
  const bounceFactor = Math.max(0.2, 1.0 + (50 - (settingsNotchSpringBounciness ?? 50)) * 0.011);
  const sqrtSpeed = Math.sqrt(speedFactor);

  const notchTransition = useMemo<Transition>(() => {
    if (settingsNotchReduceMotion) {
      return {
        type: "tween" as const,
        duration: 0.06,
        ease: "easeOut",
      };
    }
    const geomSpring = {
      type: "spring" as const,
      stiffness: Math.round(400 * speedFactor),
      damping: Math.round(34 * bounceFactor * sqrtSpeed),
    };
    return {
      width: geomSpring,
      height: geomSpring,
      y: { type: "spring" as const, stiffness: Math.round(450 * speedFactor), damping: Math.round(42 * bounceFactor * sqrtSpeed), mass: 1, restDelta: 0.01 },
      scaleX: isHoverPreview
        ? { duration: 0.24, times: [0, 0.55, 1], ease: ["easeOut", "easeInOut"] }
        : { duration: 0.15, ease: "easeOut" },
      scaleY: isHoverPreview
        ? { duration: 0.24, times: [0, 0.55, 1], ease: ["easeOut", "easeInOut"] }
        : { duration: 0.15, ease: "easeOut" },
      scale: isHoverPreview
        ? { duration: 0.24, times: [0, 0.55, 1], ease: ["easeOut", "easeInOut"] }
        : { duration: 0.15, ease: "easeOut" },
      opacity: { duration: 0.15 },
      borderTopLeftRadius: geomSpring,
      borderTopRightRadius: geomSpring,
      borderBottomLeftRadius: geomSpring,
      borderBottomRightRadius: geomSpring,
      "--radius-bottom": geomSpring,
      default: geomSpring,
    };
  }, [settingsNotchReduceMotion, speedFactor, bounceFactor, sqrtSpeed, isHoverPreview]);




  return (
    <div className="screen" style={{ overflow: 'hidden' }}>
      {/* Screen Corners (Top) */}
      <AnimatePresence>
        {isVisible && settingsCornersEnabled && (
          <>
            <motion.div
              className="screen-corner top-left"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(10px)" }}
            />
            <motion.div
              className="screen-corner top-right"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(10px)" }}
            />
          </>
        )}
      </AnimatePresence>

      <div style={{ zoom: scale, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <motion.div
          ref={nectarRef}
          className={`nectar ${isHovered ? 'expanded' : ''} ${isImpacted ? 'is-impacted' : ''}`}
          onMouseEnter={() => {
          if (collapseTimeoutRef.current) {
            clearTimeout(collapseTimeoutRef.current);
            collapseTimeoutRef.current = null;
          }
          setIsNotchHovered(true);
        }}
        onMouseLeave={() => {
          if (settingsNotchCollapseDelay > 0 && isHovered) {
            // Keep isNotchHovered until collapse finishes
          } else {
            setIsNotchHovered(false);
          }
        }}
        onWheel={handleWheel}
        initial={{ y: 250, width: 30.6, height: 44.2, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, "--radius-bottom": "18px", scaleX: 1, scaleY: 1, opacity: 0 }}
        animate={{
          y: !isReady ? 250 : (isHidden ? -100 : 0),
          width: !isReady ? 34 : (isExpanded && !isHidden ? getDynamicWidth() : (isImpacted ? 39.1 : 30.6)),
          height: !isReady ? 34 : getDynamicHeight(),
          opacity: isReady ? 1 : 0,
          scaleX: isHoverPreview ? [1, 1.08, 1.05] : 1,
          scaleY: isHoverPreview ? [1, 1.08, 1.05] : 1,
          borderTopLeftRadius: isImpacted ? 0 : 18,
          borderTopRightRadius: isImpacted ? 0 : 18,
          borderBottomLeftRadius: isCalendarMode ? 28 : (nectarMode === 'status' && isHovered ? (isShortcutsEmpty ? 28 : 24) : 18),
          borderBottomRightRadius: isCalendarMode ? 28 : (nectarMode === 'status' && isHovered ? (isShortcutsEmpty ? 28 : 24) : 18),
          "--radius-bottom": (isCalendarMode ? 28 : (nectarMode === 'status' && isHovered ? (isShortcutsEmpty ? 28 : 24) : 18)) + 'px',
          pointerEvents: 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!isHovered) {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
            triggerExpand();
          }
        }}
        onHoverStart={() => {
          if (collapseTimeoutRef.current) {
            clearTimeout(collapseTimeoutRef.current);
            collapseTimeoutRef.current = null;
          }
          if (settingsNotchExpandOnHover) {
            if (settingsNotchHoverDelay > 0) {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = setTimeout(() => {
                triggerExpand();
              }, settingsNotchHoverDelay);
            } else {
              triggerExpand();
            }
          }
        }}
        onHoverEnd={() => {
          if (import.meta.env.DEV) {
            lastHoverEndRef.current = {
              timestamp: Date.now(),
              collapseDelay: settingsNotchCollapseDelay,
              timeoutCreated: settingsNotchCollapseDelay > 0
            };
          }
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
          if ( isPickerActiveRef.current || isDraggingFileRef.current || isAddMenuOpenRef.current || isKeyboardFocusActiveRef.current || isPairingActiveRef.current) return;
          if (settingsNotchCollapseDelay > 0) {
            if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
            collapseTimeoutRef.current = setTimeout(() => {
              triggerCollapse();
            }, settingsNotchCollapseDelay);
          } else {
            triggerCollapse();
          }
        }}
        style={{ originY: 0 }}
        transition={notchTransition}
      >
        {settingsNotchHitboxMargin > 0 && (
          <div
            style={{
              position: 'absolute',
              top: -settingsNotchHitboxMargin,
              bottom: -settingsNotchHitboxMargin,
              left: -settingsNotchHitboxMargin,
              right: -settingsNotchHitboxMargin,
              pointerEvents: 'auto',
              zIndex: -1,
            }}
            aria-hidden="true"
          />
        )}

        <AnimatePresence>
          {isExpandedMusicMode && settingsAmbienceEnabled && albumArtUrl && (
            <motion.div
              className="notch-ambient-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <motion.img
                key={albumArtUrl}
                src={albumArtUrl}
                alt=""
                draggable={false}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1.8 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Compact album-art glow — contained in overflow-hidden wrapper to prevent top edge bleeding */}
        <div className="compact-album-glow-wrapper" aria-hidden="true">
          <AnimatePresence>
            {isCompactMusicActive && albumArtUrl && settingsCompactGlowEnabled && settingsAlbumArtEnabled && (
              <motion.img
                key="compact-glow"
                className="compact-album-glow"
                src={albumArtUrl}
                alt=""
                draggable={false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait">
          {isExpanded && (
            <motion.div
              key="nectar-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', borderRadius: 'inherit', overflow: 'hidden' }}
            >
              {/* Outer Branch: Direct React switching without AnimatePresence exit queue */}
              {isExpandedMusicMode ? (
                <motion.div
                  key="expanded-music"
                  className="expanded-music-container"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.08, ease: "easeOut" } }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                    {mediaLayout === 'compact' ? (
                      <CompactMediaPlayer
                        mediaInfo={mediaInfo}
                        albumArtUrl={albumArtUrl}
                        albumArtKey={albumArtKey}
                        isPlaying={isPlaying}
                        volume={displayVolume}
                        volumeExpanded={compactVolumeExpanded}
                        onVolumeExpandedChange={setCompactVolumeExpanded}
                        onTogglePlayPause={togglePlayPause}
                        onVolumeChange={handleVolumeChange}
                        prevFront={prevFront}
                        prevBack={prevBack}
                        nextFront={nextFront}
                        nextBack={nextBack}
                        onAnimatePrev={animatePrev}
                        onAnimateNext={animateNext}
                        onLayoutChange={(layout) => {
                          setMediaLayout(layout);
                          localStorage.setItem("nectar-media-layout", layout);
                          window.dispatchEvent(new CustomEvent("settings-changed", { detail: { key: "media-layout", value: layout } }));
                        }}
                      />
                    ) : (
                    <div className="compact-premium-layout">
                      <div className="album-art-section">
                        <motion.div
                          className="premium-album-art"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaLayout('compact');
                            localStorage.setItem("nectar-media-layout", "compact");
                            window.dispatchEvent(new CustomEvent("settings-changed", { detail: { key: "media-layout", value: "compact" } }));
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            {albumArtUrl ? (
                              <motion.img
                                key={`art-${albumArtKey}`}
                                src={albumArtUrl}
                                alt="Art"
                                initial={{ rotateY: 90, opacity: 0 }}
                                animate={{ rotateY: 0, opacity: 1 }}
                                exit={{ rotateY: -90, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <motion.div
                                key="placeholder"
                                className="art-placeholder-mini"
                                initial={{ rotateY: 90, opacity: 0 }}
                                animate={{ rotateY: 0, opacity: 1 }}
                                exit={{ rotateY: -90, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                              >
                                <MusicNoteIcon size={32} className="music-placeholder-svg" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </div>

                      <div className="metadata-controls-section-middle">
                        <div className="track-header-row">
                          <div className="track-info-middle">
                            <TitleMarquee title={mediaInfo.title || t("notch.music.noMedia")} />
                            <span className="premium-artist">{mediaInfo.artist}</span>
                          </div>
                          <div className="header-actions-wrap">
                            <div className="header-visualizer" aria-hidden="true">
                              <Visualizer isPlaying={isPlaying} bars={5} height={18} />
                            </div>
                            <motion.button
                              type="button"
                              className="classic-audio-output-btn"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                invoke('open_audio_output_picker').catch(() => {
                                  invoke('open_sound_settings').catch(() => {});
                                });
                              }}
                              whileHover={{ scale: 1.12 }}
                              whileTap={{ scale: 0.9 }}
                              aria-label={t("notch.music.audioOutput")}
                            >
                              <AudioOutputIcon size={18} />
                            </motion.button>
                          </div>
                        </div>

                        <div className="controls-row-sleek">
                          <motion.button
                            className="sleek-btn previous-btn"
                            onClick={(e) => { e.stopPropagation(); animatePrev(); }}
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          >
                            <div style={{ position: 'relative', width: 32, height: 16, overflow: 'hidden' }}>
                              <motion.div animate={prevBack} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipBackIcon size={32} />
                              </motion.div>
                              <motion.div animate={prevFront} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipBackIcon size={32} />
                              </motion.div>
                            </div>
                          </motion.button>

                          <motion.button
                            className="sleek-btn play-pause-btn-floating"
                            onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.div
                                key={isPlaying ? "pause" : "play"}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.15 }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                {isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
                              </motion.div>
                            </AnimatePresence>
                          </motion.button>

                          <motion.button
                            className="sleek-btn next-btn"
                            onClick={(e) => { e.stopPropagation(); animateNext(); }}
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          >
                            <div style={{ position: 'relative', width: 32, height: 16, overflow: 'hidden' }}>
                              <motion.div animate={nextBack} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipForwardIcon size={32} />
                              </motion.div>
                              <motion.div animate={nextFront} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipForwardIcon size={32} />
                              </motion.div>
                            </div>
                          </motion.button>
                        </div>

                        <div className="volume-slider-container">
                          <motion.button
                            type="button"
                            className="volume-mute-btn"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMute();
                            }}
                            whileTap={{ scale: 0.85 }}
                            aria-label={t("notch.music.volume")}
                          >
                            <VolumeLowIcon size={12} style={{ opacity: displayVolume === 0 ? 0.35 : 0.65 }} />
                          </motion.button>
                          <div className="slider-track-premium">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={displayVolume}
                              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className="premium-slider"
                              aria-label={t("notch.music.volume")}
                            />
                            <div className="slider-progress-fill" style={{ width: `${displayVolume * 100}%` }} />
                          </div>
                        </div>
                      </div>

                    </div>
                    )}
                </motion.div>
              ) : (
                <motion.div
                  key="standard-view-group"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6, transition: { duration: 0.08, ease: "easeOut" } }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    style={{ width: '100%', height: '100%', position: 'relative' }}
                  >
                    <div className="main-row">
                      <AnimatePresence mode="wait">
                        {(showPowerPulse || showLowBatteryPulse || showUpdatePulse) && !isHovered ? (
                          showUpdatePulse ? (
                            <motion.div
                              key="update-pulse-view"
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 1.04 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="power-pulse-content"
                            >
                              <GreenDownArrowIcon />
                              <span className="label" style={{ color: "#32D74B" }}>
                                Update Available
                              </span>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="pulse-view"
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 1.04 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="power-pulse-content"
                            >
                              {updateAvailable && <GreenDownArrowIcon />}
                              <BatteryIcon charging={isCharging} level={batteryLevel} threshold={lowBatteryThreshold} />
                              <span className="label" style={{ color: showLowBatteryPulse ? "#FF453A" : "inherit" }}>
                                {showLowBatteryPulse ? "Low Battery" : (isCharging ? "Charging" : "On Battery")} • {batteryLevel}%
                              </span>
                            </motion.div>
                          )
                        ) : (
                          <motion.div
                            key="standard-view"
                            className="main-row-inner"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            {/* Left: update activity (takes priority), visualizer (music), or weather (command-center, calendar) */}
                            <div className="side-content left">
                              {updateAvailable && showUpdateIndicator && isCompactUpdateIndicatorAllowed ? (
                                <AnimatePresence>
                                  <motion.div
                                    key="update-activity"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                  >
                                    <UpdateActivity />
                                  </motion.div>
                                </AnimatePresence>
                              ) : isCompactMusicActive && settingsVisualizerEnabled ? (
                                <AnimatePresence>
                                  {settingsVisualizerEnabled && (
                                    <motion.div
                                      key="visualizer"
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: isMusicFadingOut ? 0 : 1 }}
                                      exit={{ opacity: 0 }}
                                      transition={{ duration: 0.2, ease: "easeInOut" }}
                                    >
                                      <Visualizer isPlaying={isPlaying} />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              ) : (!isCompactMusicActive && isHovered && statusWidgets.left.length > 0) ? (
                                <motion.div
                                  key="left-widgets"
                                  className="passive-features-group"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  {statusWidgets.left.map(renderStatusWidget)}
                                </motion.div>
                              ) : null}
                            </div>

                            {/* Center - Time (always visible) */}
                            <div className="time-center">
                              <div className="time-flip-container" onClick={toggleCalendarMode}>
                                <AnimatePresence initial={false}>
                                  {isCompactTimerVisible || isTimerFinished ? (
                                    <motion.span
                                      key="timer"
                                      className={`time compact-timer ${isTimerFinished ? 'timer-finished' : ''}`}
                                      initial={{ rotateX: -90, opacity: 0 }}
                                      animate={{ rotateX: 0, opacity: 1 }}
                                      exit={{ rotateX: 90, opacity: 0 }}
                                      transition={{ type: "spring", stiffness: 600, damping: 30 }}
                                    >
                                      {isTimerRunning || isTimerFinished
                                        ? formatTimerTime(timerSeconds)
                                        : <StopwatchReadout base={stopwatch.base} startedAt={stopwatch.startedAt} precise={false} />}
                                    </motion.span>
                                  ) : (
                                    <motion.span
                                      key="clock"
                                      className="time"
                                      initial={{ rotateX: -90, opacity: 0 }}
                                      animate={{ rotateX: 0, opacity: 1 }}
                                      exit={{ rotateX: 90, opacity: 0 }}
                                      transition={{ type: "spring", stiffness: 600, damping: 30 }}
                                    >
                                      {time}
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>

                            {/* Right: album art (music) or battery (command-center, calendar) */}
                            <div className="side-content right">
                              {isCompactMusicActive && settingsAlbumArtEnabled ? (
                                <AnimatePresence mode="wait">
                                  <motion.div
                                    key="album-art"
                                    className="album-art-glow-wrapper"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: isMusicFadingOut ? 0 : 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2, ease: "easeInOut" }}
                                  >
                                    {albumArtUrl && settingsCompactGlowEnabled && (
                                      <img
                                        src={albumArtUrl}
                                        alt=""
                                        className="album-art-glow-bg"
                                        draggable={false}
                                      />
                                    )}
                                    <button
                                      className={`album-art${isHovered ? ' album-art-large' : ''}${!isPlaying ? ' paused' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePlayPause();
                                      }}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        skipNext();
                                      }}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        skipPrevious();
                                      }}
                                    >
                                      <div className="album-art-inner">
                                        <AnimatePresence mode="wait" initial={false}>
                                          {albumArtUrl ? (
                                            <motion.img
                                              key={`compact-art-${albumArtKey}`}
                                              src={albumArtUrl}
                                              alt="Art"
                                              draggable={false}
                                              initial={{ rotateY: 90, opacity: 0 }}
                                              animate={{ rotateY: 0, opacity: 1 }}
                                              exit={{ rotateY: -90, opacity: 0 }}
                                              transition={{ duration: 0.25, ease: "easeInOut" }}
                                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                          ) : (
                                            <motion.div
                                              key="compact-placeholder"
                                              className="album-art-placeholder"
                                              initial={{ rotateY: 90, opacity: 0 }}
                                              animate={{ rotateY: 0, opacity: 1 }}
                                              exit={{ rotateY: -90, opacity: 0 }}
                                              transition={{ duration: 0.25, ease: "easeInOut" }}
                                            >
                                              <MusicNoteIcon className="music-placeholder-svg-small" />
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                      <div className="album-art-overlay">
                                        <div className="control-icon-small">
                                          {isPlaying ? <PauseIcon /> : <PlayIcon />}
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                  </motion.div>
                                </AnimatePresence>
                              ) : (!isCompactMusicActive && isHovered && statusWidgets.right.length > 0) ? (
                                <motion.div
                                  key="right-widgets"
                                  className="passive-features-group"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  {statusWidgets.right.map(renderStatusWidget)}
                                </motion.div>
                              ) : null}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Mode Panel Area: Shortcuts, Command Center, or Calendar */}
                    <AnimatePresence
                      mode="wait"
                      onExitComplete={() => {
                        if (import.meta.env.DEV) {
                          innerExitCompleteRef.current = performance.now();
                        }
                      }}
                    >
                      {nectarMode === 'status' && isHovered && (
                        <motion.div
                          key="shortcuts-row"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4, transition: { duration: 0.08, ease: "easeOut" } }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                          style={{ width: '100%' }}
                        >
                          <ShortcutsBar
                            onEmptyChange={setIsShortcutsEmpty}
                            onPickerActiveChange={(active) => {
                              isPickerActiveRef.current = active;
                              if (!active) {
                                setTimeout(checkMouseAndCollapseIfNeeded, 60);
                              }
                            }}
                            onAddMenuOpenChange={(open) => {
                              isAddMenuOpenRef.current = open;
                              setIsAddMenuOpen(open);
                              if (!open) {
                                setTimeout(checkMouseAndCollapseIfNeeded, 50);
                              }
                            }}
                            onDragActiveChange={(active) => {
                              isDraggingFileRef.current = active;
                            }}
                            isDropTargetActive={isDropTargetActive}
                            pendingDropPaths={pendingDropPaths}
                            onClearPendingDropPaths={() => setPendingDropPaths(null)}
                            isDevPinned={isDevPinned}
                            onToggleDevPin={() => {
                              setIsDevPinned((prev) => {
                                const next = !prev;
                                isDevPinnedRef.current = next;
                                if (next) {
                                  setNectarMode('status');
                                  setIsHovered(true);
                                  console.log('[DEV_PIN] Shortcuts PINNED OPEN (Button).');
                                } else {
                                  console.log('[DEV_PIN] Shortcuts UNPINNED (Button).');
                                  setTimeout(checkMouseAndCollapseIfNeeded, 60);
                                }
                                return next;
                              });
                            }}
                          />
                        </motion.div>
                      )}

                      {nectarMode === 'command-center' && isHovered && (
                        <motion.div
                          key="command-center-panel"
                          className="command-center-content-minimal"
                          onClick={e => e.stopPropagation()}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4, transition: { duration: 0.08, ease: "easeOut" } }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        >
                    {/* Pills Grid */}
                    <div style={{ display: ccView !== 'main' ? 'none' : 'contents' }}>
                    <div className="cc-pills-grid">
                      {/* Wi-Fi Pill */}
                      <div
                        className={`cc-pill-tile ${wifiEnabled ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleWifi(); }}
                        onContextMenu={handleWifiRightClick}
                      >
                        <div className="cc-pill-icon-wrapper">
                          <WifiIcon enabled={wifiEnabled} connected={wifiConnected} />
                        </div>
                        <div className="cc-pill-info">
                          <span className="cc-pill-title">Wi-Fi</span>
                          <span className="cc-pill-status">{wifiStatus === null ? '…' : !wifiEnabled ? t('notch.cc.status.off') : wifiConnected ? t('notch.cc.status.connected') : t('notch.cc.status.notConnected')}</span>
                        </div>
                        <button
                          type="button"
                          className="cc-pill-gear-btn"
                          title={t("notch.cc.btn.wifi")}
                          onClick={(e) => {
                            e.stopPropagation();
                            launchExternalQuickAction("wifi_settings");
                          }}
                        >
                          <Settings size={12} />
                        </button>
                        <button
                          type="button"
                          className="cc-pill-more"
                          title={t("notch.cc.btn.wifiList")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCcView('wifi');
                          }}
                        >
                          ›
                        </button>
                      </div>

                      {/* Dock Mode Pill */}
                      <div
                        className={`cc-pill-tile ${dockMode === 'fixed' ? 'active' : ''}`}
                        onClick={toggleDockModeSetting}
                      >
                        <div className="cc-pill-icon-wrapper">
                          <DockIcon />
                        </div>
                        <div className="cc-pill-info">
                          <span className="cc-pill-title">{t("notch.cc.tile.dock")}</span>
                          <span className="cc-pill-status">{dockMode === 'fixed' ? t('notch.cc.status.fixed') : dockMode === 'smart' ? t('notch.cc.status.smart') : t('notch.cc.status.peek')}</span>
                        </div>
                      </div>

                      {/* Bluetooth Pill */}
                      <div
                        className={`cc-pill-tile ${bluetoothEnabled ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleBluetooth(); }}
                        onContextMenu={handleBluetoothRightClick}
                      >
                        <div className="cc-pill-icon-wrapper">
                          <BluetoothIcon />
                        </div>
                        <div className="cc-pill-info">
                          <span className="cc-pill-title">{t("notch.cc.tile.bluetooth")}</span>
                          <span className="cc-pill-status">{bluetoothEnabled ? t('notch.cc.status.on') : t('notch.cc.status.off')}</span>
                        </div>
                        <button
                          type="button"
                          className="cc-pill-gear-btn"
                          title={t("notch.cc.btn.bluetooth")}
                          onClick={(e) => {
                            e.stopPropagation();
                            launchExternalQuickAction("bluetooth_settings");
                          }}
                        >
                          <Settings size={12} />
                        </button>
                        <button
                          type="button"
                          className="cc-pill-more"
                          title={t("notch.cc.btn.bluetoothList")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCcView('bluetooth');
                          }}
                        >
                          ›
                        </button>
                      </div>

                      {/* Notch Mode Pill */}
                      <div
                        className={`cc-pill-tile ${notchMode === 'fixed' ? 'active' : ''}`}
                        onClick={toggleNotchModeSetting}
                      >
                        <div className="cc-pill-icon-wrapper">
                          <NotchIcon />
                        </div>
                        <div className="cc-pill-info">
                          <span className="cc-pill-title">{t("notch.cc.tile.notch")}</span>
                          <span className="cc-pill-status">{notchMode === 'fixed' ? t('notch.cc.status.fixed') : notchMode === 'smart' ? t('notch.cc.status.smart') : t('notch.cc.status.peek')}</span>
                        </div>
                      </div>
                    </div>

                    {/* 12 Quick Actions Grid (3 rows x 4 columns) */}
                    <div className="cc-actions-grid">
                      {/* Row 1 */}
                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.devmgmt.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("devmgmt");
                        }}
                      >
                        <Cpu size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.devmgmt")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.taskmgr.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("taskmgr");
                        }}
                      >
                        <Activity size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.taskmgr")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.clipboard.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("clipboard");
                        }}
                      >
                        <ClipboardList size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.clipboard")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.snipping.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("snipping");
                        }}
                      >
                        <Scissors size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.snipping")}</span>
                      </button>

                      {/* Row 2 */}
                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.settings.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("settings");
                        }}
                      >
                        <Settings size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.settings")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.controlPanel.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("control_panel");
                        }}
                      >
                        <SlidersHorizontal size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.controlPanel")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.network.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("network_connections");
                        }}
                      >
                        <Network size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.network")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.security.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("security");
                        }}
                      >
                        <ShieldCheck size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.security")}</span>
                      </button>

                      {/* Row 3 */}
                      <button
                        type="button"
                        className={`cc-qa-btn ${dndActive ? 'active' : ''}`}
                        title={t("notch.cc.qa.dnd.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDndActive(prev => !prev);
                        }}
                      >
                        <Moon size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.dnd")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.nightLight.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("night_light");
                        }}
                      >
                        <Sun size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.nightLight")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.notifications.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction("open_notification_center");
                        }}
                      >
                        <Bell size={13} className="cc-qa-icon" />
                        <span className="cc-qa-label">{t("notch.cc.qa.notifications")}</span>
                      </button>

                      <button
                        type="button"
                        className="cc-qa-btn"
                        title={t("notch.cc.qa.nectar.tooltip")}
                        onClick={(e) => {
                          e.stopPropagation();
                          launchExternalQuickAction(() => openSettingsWindow());
                        }}
                      >
                        <div className="cc-qa-svg-wrap">
                          <SettingsIcon />
                        </div>
                        <span className="cc-qa-label">{t("notch.cc.qa.nectar")}</span>
                      </button>
                    </div>

                    {/* Classic Sliders Area */}
                    <div className="cc-classic-sliders-area">
                      {/* Volume Slider */}
                      <div className="cc-classic-slider-row">
                        <div className="cc-classic-slider-label">
                          <VolumeLowIcon style={{ opacity: 0.5 }} />
                          <span>{t("notch.cc.slider.volume")}</span>
                        </div>
                        <div className="cc-classic-slider-track">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={displayVolume}
                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="cc-classic-input"
                          />
                          <div className="cc-classic-fill" style={{ width: `${displayVolume * 100}%` }} />
                        </div>
                        <span className="cc-classic-percentage">{Math.round(displayVolume * 100)}%</span>
                      </div>

                      {/* Brightness Slider */}
                      <div className="cc-classic-slider-row">
                        <div className="cc-classic-slider-label">
                          <BrightnessLowIcon />
                          <span>{t("notch.cc.slider.brightness")}</span>
                        </div>
                        <div className="cc-classic-slider-track">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={currentBrightness}
                            onChange={(e) => handleBrightnessChange(parseInt(e.target.value))}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="cc-classic-input"
                          />
                          <div className="cc-classic-fill" style={{ width: `${currentBrightness}%` }} />
                        </div>
                        <span className="cc-classic-percentage">{currentBrightness}%</span>
                      </div>
                    </div>
                    </div>
                    {ccView !== 'main' && (
                      <ConnectionsView
                        kind={ccView}
                        onBack={() => setCcView('main')}
                        onOpenWindowsSettings={() => {
                          const action = ccView === 'wifi' ? 'wifi_settings' : 'bluetooth_settings';
                          if (isKeyboardFocusActiveRef.current) {
                            isKeyboardFocusActiveRef.current = false;
                            invoke("set_window_keyboard_focus", { enabled: false, seq: null }).catch(() => {});
                          }
                          setCcView('main');
                          launchExternalQuickAction(action);
                        }}
                        onWifiChanged={() => { refreshWifiStatus(); }}
                        onKeyboardFocusChange={(focused) => {
                          isKeyboardFocusActiveRef.current = focused;
                        }}
                        onPairingChange={(pairing) => {
                          isPairingActiveRef.current = pairing;
                        }}
                      />
                    )}
                  </motion.div>
                )}

                {/* Calendar & Timer Split View */}
                {productivityEnabled && isCalendarMode && isHovered && (
                  <motion.div
                    key="calendar-panel"
                    className={`calendar-timer-content split-view${settingsDualClockEnabled ? ' has-dual-clock' : ''}`}
                    onClick={e => e.stopPropagation()} /* Block mode switches when clicking inside */
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4, transition: { duration: 0.08, ease: "easeOut" } }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {settingsDualClockEnabled && (
                      <DualClock
                        timezone={settingsDualClockTimezone}
                        timeFormat24h={timeFormat24h}
                        standalone={!settingsCalendarEnabled && !showClockColumn}
                      />
                    )}

                    {(settingsCalendarEnabled || showClockColumn) && (
                      <div className="calendar-timer-columns">
                        {settingsCalendarEnabled && (
                          <div className="calendar-column">
                            <NotchCalendar caldav={caldav} hour12={!timeFormat24h} />
                          </div>
                        )}

                        {showClockColumn && (
                          <NotchClock
                            timerEnabled={settingsTimerEnabled}
                            stopwatchEnabled={settingsStopwatchEnabled}
                            solo={!settingsCalendarEnabled}
                            timerSeconds={timerSeconds}
                            isTimerRunning={isTimerRunning}
                            formatTimerTime={formatTimerTime}
                            onStartTimer={startTimerSeconds}
                            onToggleTimer={toggleTimer}
                            onResetTimer={resetTimer}
                            stopwatch={stopwatch}
                          />
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
      </motion.div>
    )}
  </AnimatePresence>

      </motion.div>
    </div>

    </div>
  );
}

function BluetoothIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function BrightnessLowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function DockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="10" y1="18" x2="10.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="14" y1="18" x2="14.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="18" y1="18" x2="18.01" y2="18" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function NotchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M9 9v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V9" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function BatterySaverIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <path d="M22 11v2" />
      <path d="M6 12h4l2-3v6l-2-3H6" />
    </svg>
  );
}

void [TrayIcon, MoonIcon, BellIcon, ReloadIcon, BatterySaverIcon];

export default App;
