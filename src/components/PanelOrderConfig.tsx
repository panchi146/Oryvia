import { useState, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SlidersHorizontal,
  FolderKanban,
  Music,
  CalendarClock,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useI18n } from "../i18n";
import type { NectarPanel, PanelOrderMode } from "../settings/types";

export const DEFAULT_PANEL_ORDER: NectarPanel[] = [
  "command-center",
  "status",
  "music",
  "calendar",
];

const VALID_PANELS = new Set<NectarPanel>(DEFAULT_PANEL_ORDER);

/**
 * Validates and normalizes an arbitrary input (array or JSON string) into a complete,
 * deduplicated 4-element NectarPanel array. Any missing panels are appended in default order.
 */
export function normalizePanelOrder(input: unknown): NectarPanel[] {
  let rawList: unknown[] = [];
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) rawList = parsed;
      } catch {
        rawList = [];
      }
    } else if (trimmed.includes(",")) {
      rawList = trimmed.split(",").map((s) => s.trim());
    } else if (VALID_PANELS.has(trimmed as NectarPanel)) {
      rawList = [trimmed];
    }
  } else if (Array.isArray(input)) {
    rawList = input;
  }

  const seen = new Set<NectarPanel>();
  const result: NectarPanel[] = [];

  for (const item of rawList) {
    if (typeof item === "string" && VALID_PANELS.has(item as NectarPanel)) {
      const panel = item as NectarPanel;
      if (!seen.has(panel)) {
        seen.add(panel);
        result.push(panel);
      }
    }
  }

  for (const fallback of DEFAULT_PANEL_ORDER) {
    if (!seen.has(fallback)) {
      seen.add(fallback);
      result.push(fallback);
    }
  }

  return result;
}

export function normalizePanelOrderMode(input: unknown): PanelOrderMode {
  return input === "custom" ? "custom" : "smart";
}

export interface PanelNavigationContext {
  mode: PanelOrderMode;
  customOrder: NectarPanel[];
  isPlayingOrGrace: boolean;
  hasMedia: boolean;
  musicModeEnabled: boolean;
  productivityEnabled: boolean;
}

/**
 * Computes the ordered list of currently available panels for wheel scrolling.
 */
export function getAvailablePanels(ctx: PanelNavigationContext): NectarPanel[] {
  let baseOrder: NectarPanel[];
  if (ctx.mode === "custom") {
    baseOrder = normalizePanelOrder(ctx.customOrder);
  } else {
    const musicBeforeStatus = ctx.isPlayingOrGrace && ctx.hasMedia && ctx.musicModeEnabled;
    baseOrder = musicBeforeStatus
      ? ["command-center", "music", "status", "calendar"]
      : ["command-center", "status", "music", "calendar"];
  }

  return baseOrder.filter((panel) => {
    if (panel === "music") {
      if (ctx.mode === "custom") {
        return ctx.musicModeEnabled;
      }
      return ctx.musicModeEnabled && ctx.hasMedia;
    }
    if (panel === "calendar" && !ctx.productivityEnabled) return false;
    return true;
  });
}

export interface MusicDisplayParams {
  isHovered: boolean;
  isCalendarMode: boolean;
  settingsMusicModeEnabled: boolean;
  settingsMusicCompactNotch: boolean;
  nectarMode: NectarPanel;
  hasMedia: boolean;
  panelOrderMode: PanelOrderMode;
  isPlaying: boolean;
  isMusicPauseGrace: boolean;
}

export interface MusicDisplayModes {
  isExpandedMusicMode: boolean;
  isCompactMusicActive: boolean;
  isMusicMode: boolean;
}

/**
 * Computes the separate display modes for Music:
 * - `isExpandedMusicMode`: strictly for the full expanded music layout when hovered
 * - `isCompactMusicActive`: strictly for the compact pill (visualizer + album art) when collapsed,
 *   active only when media is playing or within the 5s pause grace period.
 * - `isMusicMode`: unified boolean matching expanded when hovered, or compact when collapsed.
 */
export function computeMusicDisplayModes(params: MusicDisplayParams): MusicDisplayModes {
  const isExpandedMusicMode =
    params.isHovered &&
    !params.isCalendarMode &&
    params.settingsMusicModeEnabled &&
    params.nectarMode === "music" &&
    (params.hasMedia || params.panelOrderMode === "custom");

  const isCompactMusicActive =
    !params.isHovered &&
    params.settingsMusicModeEnabled &&
    params.settingsMusicCompactNotch &&
    params.hasMedia &&
    (params.isPlaying || params.isMusicPauseGrace);

  const isMusicMode = params.isHovered ? isExpandedMusicMode : isCompactMusicActive;

  return {
    isExpandedMusicMode,
    isCompactMusicActive,
    isMusicMode,
  };
}

/**
 * Computes the next panel when scrolling in `direction` (+1 or -1).
 * Handles cyclic wrap-around and safe recovery when `currentPanel` is no longer in `availablePanels`.
 */
export function getNextPanelOnWheel(
  currentPanel: NectarPanel,
  direction: 1 | -1,
  availablePanels: NectarPanel[]
): NectarPanel {
  if (availablePanels.length === 0) return "status";
  if (availablePanels.length === 1) return availablePanels[0];

  const currentIndex = availablePanels.indexOf(currentPanel);
  if (currentIndex === -1) {
    return direction > 0 ? availablePanels[0] : availablePanels[availablePanels.length - 1];
  }

  const nextIndex = (currentIndex + direction + availablePanels.length) % availablePanels.length;
  return availablePanels[nextIndex];
}

interface PanelDef {
  id: NectarPanel;
  labelKey: string;
  descKey: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;
  color: string;
}

const PANEL_DEFS: PanelDef[] = [
  {
    id: "command-center",
    labelKey: "settings.notch.panelOrder.item.commandCenter",
    descKey: "settings.notch.panelOrder.item.commandCenterDesc",
    icon: SlidersHorizontal,
    color: "#38bdf8",
  },
  {
    id: "status",
    labelKey: "settings.notch.panelOrder.item.status",
    descKey: "settings.notch.panelOrder.item.statusDesc",
    icon: FolderKanban,
    color: "#a78bfa",
  },
  {
    id: "music",
    labelKey: "settings.notch.panelOrder.item.music",
    descKey: "settings.notch.panelOrder.item.musicDesc",
    icon: Music,
    color: "#f472b6",
  },
  {
    id: "calendar",
    labelKey: "settings.notch.panelOrder.item.calendar",
    descKey: "settings.notch.panelOrder.item.calendarDesc",
    icon: CalendarClock,
    color: "#4ade80",
  },
];

function SortablePanelItem({
  id,
  index,
  disabled,
}: {
  id: NectarPanel;
  index: number;
  total?: number;
  disabled: boolean;
  onMove?: (id: NectarPanel, dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const def = PANEL_DEFS.find((p) => p.id === id) || PANEL_DEFS[0];
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 30 : ("auto" as const),
  };

  const Icon = def.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`panel-order-item ${isDragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
    >
      <div
        className="panel-order-drag-handle"
        {...(!disabled ? attributes : {})}
        {...(!disabled ? listeners : {})}
      >
        <GripVertical size={13} strokeWidth={2} className="panel-order-grip" />
        <span className="panel-order-index">{index + 1}</span>
        <div className="panel-order-icon" style={{ color: def.color }}>
          <Icon size={14} strokeWidth={2} />
        </div>
        <div className="panel-order-text">
          <span className="panel-order-name">{t(def.labelKey)}</span>
          <span className="panel-order-sub">{t(def.descKey)}</span>
        </div>
      </div>
    </div>
  );
}

interface PanelOrderConfigProps {
  mode: PanelOrderMode;
  order: NectarPanel[];
  onModeChange: (mode: PanelOrderMode) => void;
  onOrderChange: (order: NectarPanel[]) => void;
  onReset: () => void;
}

export function PanelOrderConfig({
  mode,
  order,
  onModeChange,
  onOrderChange,
  onReset,
}: PanelOrderConfigProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<NectarPanel[]>(() => normalizePanelOrder(order));

  useEffect(() => {
    setItems(normalizePanelOrder(order));
  }, [order]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.indexOf(active.id as NectarPanel);
    const newIndex = items.indexOf(over.id as NectarPanel);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    onOrderChange(next);
  };

  const isDefaultOrder =
    items.length === DEFAULT_PANEL_ORDER.length &&
    items.every((val, i) => val === DEFAULT_PANEL_ORDER[i]);

  return (
    <div className="panel-order-config">
      <div className="panel-order-header">
        <div className="panel-order-mode-info">
          <span className="panel-order-mode-title">{t("settings.notch.panelOrder.modeLabel")}</span>
          <span className="panel-order-mode-desc">
            {mode === "smart"
              ? t("settings.notch.panelOrder.smartDesc")
              : t("settings.notch.panelOrder.customDesc")}
          </span>
        </div>
        <div className="unit-toggle-minimal wide">
          <span
            className={mode === "smart" ? "active" : ""}
            onClick={() => onModeChange("smart")}
          >
            {t("settings.notch.panelOrder.modeSmart")}
          </span>
          <span
            className={mode === "custom" ? "active" : ""}
            onClick={() => onModeChange("custom")}
          >
            {t("settings.notch.panelOrder.modeCustom")}
          </span>
        </div>
      </div>

      {mode === "custom" && (
        <div className="panel-order-body">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              <div className="panel-order-list">
                {items.map((panelId, index) => (
                  <SortablePanelItem
                    key={panelId}
                    id={panelId}
                    index={index}
                    disabled={false}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="panel-order-footer">
            <button
              type="button"
              className="panel-order-reset-btn"
              disabled={isDefaultOrder}
              onClick={onReset}
            >
              <RotateCcw size={11} strokeWidth={2} />
              <span>{t("settings.notch.panelOrder.resetBtn")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
