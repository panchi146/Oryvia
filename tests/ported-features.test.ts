import { describe, it, expect } from "bun:test";
import {
  normalizeTimezone,
  DEFAULT_DUAL_CLOCK_TIMEZONE,
  TIMEZONE_OPTIONS,
} from "../src/components/DualClock";
import {
  DEFAULT_PANEL_ORDER,
  normalizePanelOrder,
  normalizePanelOrderMode,
  getAvailablePanels,
  getNextPanelOnWheel,
  computeMusicDisplayModes,
} from "../src/components/PanelOrderConfig";
import { RESTING_BAR_HEIGHT } from "../src/App";
import type { NectarPanel } from "../src/settings/types";

describe("Nhóm C: Dual Clock Timezone Normalization", () => {
  it("defaults to Asia/Tokyo for empty, null, or undefined timezone", () => {
    expect(normalizeTimezone("")).toBe(DEFAULT_DUAL_CLOCK_TIMEZONE);
    expect(normalizeTimezone(null)).toBe(DEFAULT_DUAL_CLOCK_TIMEZONE);
    expect(normalizeTimezone(undefined)).toBe(DEFAULT_DUAL_CLOCK_TIMEZONE);
    expect(normalizeTimezone("   ")).toBe(DEFAULT_DUAL_CLOCK_TIMEZONE);
  });

  it("retains valid IANA timezones", () => {
    expect(normalizeTimezone("Asia/Ho_Chi_Minh")).toBe("Asia/Ho_Chi_Minh");
    expect(normalizeTimezone("UTC")).toBe("UTC");
    expect(normalizeTimezone("America/New_York")).toBe("America/New_York");
    expect(normalizeTimezone("Europe/London")).toBe("Europe/London");
  });

  it("falls back to DEFAULT_DUAL_CLOCK_TIMEZONE on invalid timezone strings", () => {
    expect(normalizeTimezone("Invalid/Not_A_Timezone")).toBe(DEFAULT_DUAL_CLOCK_TIMEZONE);
    expect(normalizeTimezone("12345")).toBe(DEFAULT_DUAL_CLOCK_TIMEZONE);
  });

  it("includes all predefined options in TIMEZONE_OPTIONS", () => {
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(15);
    const values = TIMEZONE_OPTIONS.map((o) => o.value);
    expect(values).toContain("UTC");
    expect(values).toContain("Asia/Ho_Chi_Minh");
    expect(values).toContain("Asia/Tokyo");
  });
});

describe("Nhóm D: Panel Order Normalization & Wheel Navigation", () => {
  it("normalizes undefined or empty input to DEFAULT_PANEL_ORDER", () => {
    expect(normalizePanelOrder(null)).toEqual(DEFAULT_PANEL_ORDER);
    expect(normalizePanelOrder(undefined)).toEqual(DEFAULT_PANEL_ORDER);
    expect(normalizePanelOrder("")).toEqual(DEFAULT_PANEL_ORDER);
    expect(normalizePanelOrder([])).toEqual(DEFAULT_PANEL_ORDER);
  });

  it("normalizes valid JSON string of panels", () => {
    const custom: NectarPanel[] = ["calendar", "music", "status", "command-center"];
    expect(normalizePanelOrder(JSON.stringify(custom))).toEqual(custom);
  });

  it("deduplicates panels and appends missing valid panels in order", () => {
    const input = ["music", "music", "status"];
    const normalized = normalizePanelOrder(input);
    expect(normalized[0]).toBe("music");
    expect(normalized[1]).toBe("status");
    expect(normalized).toContain("command-center");
    expect(normalized).toContain("calendar");
    expect(normalized.length).toBe(4);
    // No duplicates
    expect(new Set(normalized).size).toBe(4);
  });

  it("normalizes panelOrderMode correctly", () => {
    expect(normalizePanelOrderMode("smart")).toBe("smart");
    expect(normalizePanelOrderMode("custom")).toBe("custom");
    expect(normalizePanelOrderMode("invalid")).toBe("smart");
    expect(normalizePanelOrderMode(null)).toBe("smart");
  });

  describe("getAvailablePanels logic", () => {
    it("smart mode with music playing prioritizes music before status", () => {
      const panels = getAvailablePanels({
        mode: "smart",
        customOrder: DEFAULT_PANEL_ORDER,
        isPlayingOrGrace: true,
        hasMedia: true,
        musicModeEnabled: true,
        productivityEnabled: true,
      });
      expect(panels).toEqual(["command-center", "music", "status", "calendar"]);
    });

    it("smart mode with paused/stopped music places music after status", () => {
      const panels = getAvailablePanels({
        mode: "smart",
        customOrder: DEFAULT_PANEL_ORDER,
        isPlayingOrGrace: false,
        hasMedia: true,
        musicModeEnabled: true,
        productivityEnabled: true,
      });
      expect(panels).toEqual(["command-center", "status", "music", "calendar"]);
    });

    it("excludes music when no media or music disabled", () => {
      const panels = getAvailablePanels({
        mode: "smart",
        customOrder: DEFAULT_PANEL_ORDER,
        isPlayingOrGrace: true,
        hasMedia: false,
        musicModeEnabled: true,
        productivityEnabled: true,
      });
      expect(panels).not.toContain("music");
    });

    it("excludes calendar when productivity is disabled", () => {
      const panels = getAvailablePanels({
        mode: "smart",
        customOrder: DEFAULT_PANEL_ORDER,
        isPlayingOrGrace: false,
        hasMedia: false,
        musicModeEnabled: false,
        productivityEnabled: false,
      });
      expect(panels).toEqual(["command-center", "status"]);
    });

    it("custom mode respects custom order", () => {
      const custom: NectarPanel[] = ["calendar", "status", "music", "command-center"];
      const panels = getAvailablePanels({
        mode: "custom",
        customOrder: custom,
        isPlayingOrGrace: true,
        hasMedia: true,
        musicModeEnabled: true,
        productivityEnabled: true,
      });
      expect(panels).toEqual(custom);
    });
  });

  describe("getNextPanelOnWheel cycling", () => {
    const list: NectarPanel[] = ["command-center", "music", "status", "calendar"];

    it("cycles forward correctly (+1)", () => {
      expect(getNextPanelOnWheel("command-center", 1, list)).toBe("music");
      expect(getNextPanelOnWheel("music", 1, list)).toBe("status");
      expect(getNextPanelOnWheel("status", 1, list)).toBe("calendar");
      expect(getNextPanelOnWheel("calendar", 1, list)).toBe("command-center");
    });

    it("cycles backward correctly (-1)", () => {
      expect(getNextPanelOnWheel("command-center", -1, list)).toBe("calendar");
      expect(getNextPanelOnWheel("calendar", -1, list)).toBe("status");
      expect(getNextPanelOnWheel("status", -1, list)).toBe("music");
      expect(getNextPanelOnWheel("music", -1, list)).toBe("command-center");
    });

    it("returns current panel if available panels is empty or single", () => {
      expect(getNextPanelOnWheel("status", 1, [])).toBe("status");
      expect(getNextPanelOnWheel("status", 1, ["status"])).toBe("status");
    });
  });

  describe("computeMusicDisplayModes", () => {
    it("computes expanded vs compact music modes accurately", () => {
      const activeHovered = computeMusicDisplayModes({
        isHovered: true,
        isCalendarMode: false,
        settingsMusicModeEnabled: true,
        settingsMusicCompactNotch: true,
        nectarMode: "music",
        hasMedia: true,
        panelOrderMode: "smart",
        isPlaying: true,
        isMusicPauseGrace: false,
      });
      expect(activeHovered.isMusicMode).toBe(true);
      expect(activeHovered.isExpandedMusicMode).toBe(true);
      expect(activeHovered.isCompactMusicActive).toBe(false);

      const activeUnhovered = computeMusicDisplayModes({
        isHovered: false,
        isCalendarMode: false,
        settingsMusicModeEnabled: true,
        settingsMusicCompactNotch: true,
        nectarMode: "music",
        hasMedia: true,
        panelOrderMode: "smart",
        isPlaying: true,
        isMusicPauseGrace: false,
      });
      expect(activeUnhovered.isMusicMode).toBe(true);
      expect(activeUnhovered.isExpandedMusicMode).toBe(false);
      expect(activeUnhovered.isCompactMusicActive).toBe(true);
    });
  });
});

describe("Nhóm F: Visualizer Constants", () => {
  it("RESTING_BAR_HEIGHT is 0.2 to prevent micro-shrink and abrupt collapse", () => {
    expect(RESTING_BAR_HEIGHT).toBe(0.2);
  });
});
