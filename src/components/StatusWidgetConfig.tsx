import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CloudSun,
  BatteryFull,
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowUpDown,
  X,
  ArrowLeftRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useI18n } from "../i18n";

export interface WidgetConfig {
  left: string[];
  right: string[];
}

interface WidgetDef {
  id: string;
  labelKey: string;
  defaultLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;
  color: string;
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: "weather", labelKey: "widget.weather", defaultLabel: "Weather", icon: CloudSun, color: "#60a5fa" },
  { id: "battery", labelKey: "widget.battery", defaultLabel: "Battery", icon: BatteryFull, color: "#4ade80" },
  { id: "cpu", labelKey: "widget.cpu", defaultLabel: "CPU", icon: Cpu, color: "#f97316" },
  { id: "ram", labelKey: "widget.ram", defaultLabel: "RAM", icon: MemoryStick, color: "#a78bfa" },
  { id: "disk", labelKey: "widget.disk", defaultLabel: "Disk", icon: HardDrive, color: "#38bdf8" },
  { id: "net", labelKey: "widget.net", defaultLabel: "Net", icon: ArrowUpDown, color: "#2dd4bf" },
];

const DEFAULT_CONFIG: WidgetConfig = {
  left: ["weather"],
  right: ["battery"],
};

const MAX_PER_ZONE = 4;

const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return rectIntersection(args);
};

/* ── Draggable pool chip ── */
function PoolChip({ id }: { id: string }) {
  const { t } = useI18n();
  const def = WIDGET_DEFS.find((w) => w.id === id)!;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  const Icon = def.icon;
  return (
    <div
      ref={setNodeRef}
      className={`widget-pill widget-pill--available ${isDragging ? "dragging" : ""}`}
      {...listeners}
      {...attributes}
    >
      <Icon size={12} strokeWidth={2} style={{ color: def.color, flexShrink: 0 }} />
      <span>{t(def.labelKey) || def.defaultLabel}</span>
    </div>
  );
}

function SortablePlacedChip({
  id,
  idx,
  total,
  onSwap,
  onRemove,
  onMove,
}: {
  id: string;
  idx: number;
  total: number;
  onSwap: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const def = WIDGET_DEFS.find((w) => w.id === id)!;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : ("auto" as const),
  };

  const Icon = def.icon;

  return (
    <div ref={setNodeRef} style={style} className={`widget-pill widget-pill--placed ${isDragging ? "dragging" : ""}`}>
      <div {...attributes} {...listeners} className="widget-pill-drag-handle">
        <Icon size={12} strokeWidth={2} style={{ color: def.color, flexShrink: 0 }} />
        <span>{t(def.labelKey) || def.defaultLabel}</span>
      </div>
      <div className="widget-pill-btns">
        {idx > 0 && (
          <button className="widget-pill-btn" onClick={() => onMove(id, -1)}>
            <ChevronUp size={9} />
          </button>
        )}
        {idx < total - 1 && (
          <button className="widget-pill-btn" onClick={() => onMove(id, 1)}>
            <ChevronDown size={9} />
          </button>
        )}
        <button className="widget-pill-btn" title={t("widget.swapSide")} onClick={() => onSwap(id)}>
          <ArrowLeftRight size={9} />
        </button>
        <button className="widget-pill-btn widget-pill-btn--x" title={t("widget.remove")} onClick={() => onRemove(id)}>
          <X size={10} />
        </button>
      </div>
    </div>
  );
}

/* ── Droppable zone ── */
function DropZone({
  id,
  side,
  items,
  onSwap,
  onRemove,
  onMove,
}: {
  id: string;
  side: "left" | "right";
  items: string[];
  onSwap: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      id={id}
      ref={setNodeRef}
      className={`widget-config-zone ${isOver ? "widget-config-zone--over" : ""}`}
    >
      <span className="widget-config-side">{side === "left" ? t("widget.zone.left") : t("widget.zone.right")}</span>
      <div className={`widget-config-chips ${items.length >= 3 ? "widget-config-chips--grid" : ""}`}>
        <SortableContext items={items} strategy={rectSortingStrategy}>
          {items.length > 0
            ? items.map((itemId, i) => (
                <SortablePlacedChip
                  key={itemId}
                  id={itemId}
                  idx={i}
                  total={items.length}
                  onSwap={onSwap}
                  onRemove={onRemove}
                  onMove={onMove}
                />
              ))
            : <span className="widget-config-empty">{t("widget.dropHere")}</span>}
        </SortableContext>
      </div>
    </div>
  );
}

function PoolZone({ items }: { items: string[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "zone-pool" });
  if (items.length === 0) return null;
  return (
    <div
      id="zone-pool"
      ref={setNodeRef}
      className={`widget-config-pool ${isOver ? "widget-config-pool--over" : ""}`}
    >
      <div className="widget-config-pool-chips">
        {items.map((id) => (
          <PoolChip key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

/* ── Main component ── */
interface StatusWidgetConfigProps {
  value: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
  hasBattery?: boolean;
}

export function StatusWidgetConfig({ value, onChange, hasBattery = true }: StatusWidgetConfigProps) {
  const { t } = useI18n();
  const availableDefs = hasBattery ? WIDGET_DEFS : WIDGET_DEFS.filter((w) => w.id !== "battery");

  const sanitize = useCallback(
    (cfg: WidgetConfig): WidgetConfig =>
      hasBattery
        ? cfg
        : { left: cfg.left.filter((id) => id !== "battery"), right: cfg.right.filter((id) => id !== "battery") },
    [hasBattery]
  );

  const [config, setConfig] = useState<WidgetConfig>(() => sanitize(value || DEFAULT_CONFIG));
  const [activeId, setActiveId] = useState<string | null>(null);
  const draggedFromZone = useRef<"left" | "right" | null>(null);

  useEffect(() => {
    const next = sanitize(value || DEFAULT_CONFIG);
    setConfig(next);
    if (!hasBattery && value && (value.left.includes("battery") || value.right.includes("battery"))) {
      onChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, hasBattery, sanitize]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const allPlaced = new Set([...config.left, ...config.right]);
  const pool = availableDefs.filter((w) => !allPlaced.has(w.id)).map((w) => w.id);

  const emit = useCallback(
    (next: WidgetConfig) => {
      setConfig(next);
      onChange(next);
    },
    [onChange]
  );

  const remove = useCallback(
    (id: string) => {
      emit({
        left: config.left.filter((x) => x !== id),
        right: config.right.filter((x) => x !== id),
      });
    },
    [config, emit]
  );

  const swapSide = (id: string) => {
    if (config.left.includes(id)) {
      if (config.right.length >= MAX_PER_ZONE) return;
      emit({ left: config.left.filter((x) => x !== id), right: [...config.right, id] });
    } else {
      if (config.left.length >= MAX_PER_ZONE) return;
      emit({ right: config.right.filter((x) => x !== id), left: [...config.left, id] });
    }
  };

  const moveInSide = (id: string, dir: -1 | 1) => {
    for (const side of ["left", "right"] as const) {
      const arr = config[side];
      const idx = arr.indexOf(id);
      if (idx === -1) continue;
      const swap = idx + dir;
      if (swap < 0 || swap >= arr.length) return;
      emit({ ...config, [side]: arrayMove(arr, idx, swap) });
      return;
    }
  };

  const getZoneOf = (itemId: string): "left" | "right" | "pool" | null => {
    if (config.left.includes(itemId)) return "left";
    if (config.right.includes(itemId)) return "right";
    if (pool.includes(itemId)) return "pool";
    return null;
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    const zone = getZoneOf(id);
    draggedFromZone.current = zone === "pool" ? null : (zone as "left" | "right" | null);
  }, [config, pool]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      const itemId = active.id as string;
      const sourceZone = draggedFromZone.current;
      const isPoolItem = pool.includes(itemId);

      let targetZone: "left" | "right" | "pool" | null = null;
      let overId: string | null = over ? (over.id as string) : null;

      // 1. Identify target zone from overId
      if (overId === "zone-left" || config.left.includes(overId!)) {
        targetZone = "left";
      } else if (overId === "zone-right" || config.right.includes(overId!)) {
        targetZone = "right";
      } else if (overId === "zone-pool" || pool.includes(overId!)) {
        targetZone = "pool";
      }

      // 2. Fallback using drop coordinates if overId was not detected or null
      if (!targetZone && event.delta && active.rect.current.initial) {
        const cx = active.rect.current.initial.left + active.rect.current.initial.width / 2 + event.delta.x;
        const cy = active.rect.current.initial.top + active.rect.current.initial.height / 2 + event.delta.y;

        for (const side of ["left", "right"] as const) {
          const el = document.getElementById(`zone-${side}`);
          if (el) {
            const r = el.getBoundingClientRect();
            if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
              targetZone = side;
              break;
            }
          }
        }

        if (!targetZone) {
          const poolEl = document.getElementById("zone-pool");
          if (poolEl) {
            const r = poolEl.getBoundingClientRect();
            if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
              targetZone = "pool";
            }
          }
        }
      }

      // 3. Dropping placed item into pool -> remove from zone
      if (targetZone === "pool") {
        if (sourceZone) {
          remove(itemId);
        }
        return;
      }

      // 4. Pool item -> add to target zone
      if (isPoolItem && targetZone) {
        if (config[targetZone].length >= MAX_PER_ZONE) return;
        const targetArr = [...config[targetZone]];
        const insertIdx = overId ? targetArr.indexOf(overId) : -1;
        if (insertIdx >= 0) {
          targetArr.splice(insertIdx, 0, itemId);
        } else {
          targetArr.push(itemId);
        }
        emit({ ...config, [targetZone]: targetArr });
        return;
      }

      // 5. Zone item -> reorder or move between zones
      if (sourceZone && targetZone) {
        if (sourceZone === targetZone) {
          const arr = config[sourceZone];
          const oldIdx = arr.indexOf(itemId);
          let newIdx = overId ? arr.indexOf(overId) : -1;
          if (newIdx === -1 && overId === `zone-${sourceZone}`) {
            newIdx = arr.length - 1;
          }
          if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            emit({ ...config, [sourceZone]: arrayMove(arr, oldIdx, newIdx) });
          }
        } else {
          if (config[targetZone].length >= MAX_PER_ZONE) return;
          const newSource = config[sourceZone].filter((x) => x !== itemId);
          const targetArr = [...config[targetZone]];
          const insertIdx = overId ? targetArr.indexOf(overId) : -1;
          if (insertIdx >= 0) {
            targetArr.splice(insertIdx, 0, itemId);
          } else {
            targetArr.push(itemId);
          }
          emit({ ...config, [sourceZone]: newSource, [targetZone]: targetArr });
        }
        return;
      }
    },
    [config, pool, remove, emit]
  );

  const activeDef = activeId ? WIDGET_DEFS.find((w) => w.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="widget-config">
        <DropZone
          id="zone-left"
          side="left"
          items={config.left}
          onSwap={swapSide}
          onRemove={remove}
          onMove={moveInSide}
        />
        <DropZone
          id="zone-right"
          side="right"
          items={config.right}
          onSwap={swapSide}
          onRemove={remove}
          onMove={moveInSide}
        />

        <PoolZone items={pool} />
      </div>

      <DragOverlay>
        {activeDef ? (
          <div className="widget-pill widget-pill--dragging">
            <activeDef.icon size={12} strokeWidth={2} style={{ color: activeDef.color, flexShrink: 0 }} />
            <span>{t(activeDef.labelKey) || activeDef.defaultLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
