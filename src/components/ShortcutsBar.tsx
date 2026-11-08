import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Plus,
  X,
  Folder,
  FolderPlus,
  FilePlus2,
  FileUp,
  AppWindow,
  AlertCircle,
  ArrowDownToLine,
  Pin,
  PinOff
} from "lucide-react";
import { useI18n } from "../i18n";
import "./ShortcutsBar.css";

export interface ShortcutItem {
  id: string;
  name: string;
  path: string;
  isFolder?: boolean;
  icon?: string;
}

interface ShortcutsBarProps {
  onPickerActiveChange?: (active: boolean) => void;
  onAddMenuOpenChange?: (open: boolean) => void;
  isDropTargetActive?: boolean;
  onDragActiveChange?: (active: boolean) => void;
  pendingDropPaths?: string[] | null;
  onClearPendingDropPaths?: () => void;
  isDevPinned?: boolean;
  onToggleDevPin?: () => void;
  onEmptyChange?: (isEmpty: boolean) => void;
}

export const SHOW_DEV_TOOLS = Boolean(
  import.meta.env.DEV &&
  (import.meta.env.VITE_NECTAR_SHOW_DEV_TOOLS === "1" ||
   (typeof window !== "undefined" && window.localStorage?.getItem("nectar-dev-tools") === "true"))
);

const STORAGE_KEY = "nectar-shortcuts";

export const ShortcutsBar: React.FC<ShortcutsBarProps> = ({
  onPickerActiveChange,
  onAddMenuOpenChange,
  isDropTargetActive = false,
  onDragActiveChange: _onDragActiveChange,
  pendingDropPaths,
  onClearPendingDropPaths,
  isDevPinned = false,
  onToggleDevPin,
  onEmptyChange
}) => {
  const { t } = useI18n();
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse shortcuts from localStorage", e);
    }
    return [];
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [devTestWinStatus, setDevTestWinStatus] = useState<string | null>(null);
  const [isDevUnmaskActive, setIsDevUnmaskActive] = useState(false);
  const lastProcessedDropTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!SHOW_DEV_TOOLS) return;
    invoke<boolean>("get_drag_hitbox_diag")
      .then((val) => setIsDevUnmaskActive(!!val))
      .catch(() => {});

    let unlisten: (() => void) | null = null;
    listen<boolean>("dev-unmask-changed", (event) => {
      setIsDevUnmaskActive(!!event.payload);
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wheelAccumRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);

  // Notify parent of empty state for Dynamic Island height animation
  useEffect(() => {
    onEmptyChange?.(shortcuts.length === 0);
  }, [shortcuts.length, onEmptyChange]);

  // Cleanup requestAnimationFrame on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const closeAddMenu = useCallback(() => {
    setShowAddMenu(false);
    onAddMenuOpenChange?.(false);
  }, [onAddMenuOpenChange]);

  // Close add menu on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        addBtnRef.current &&
        !addBtnRef.current.contains(target)
      ) {
        closeAddMenu();
      }
    };

    if (showAddMenu) {
      window.addEventListener("pointerdown", handleOutsideClick);
    }
    return () => {
      window.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, [showAddMenu, closeAddMenu]);

  // Auto clear error message after 3.5s
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Load missing icons on mount
  useEffect(() => {
    let isMounted = true;
    const fetchMissingIcons = async () => {
      let changed = false;
      const updated = await Promise.all(
        shortcuts.map(async (item) => {
          if (!item.icon) {
            try {
              const iconData = await invoke<string | null>("get_app_icon", {
                path: item.path,
                name: item.name
              });
              if (iconData) {
                changed = true;
                return { ...item, icon: iconData };
              }
            } catch {
              // Ignore failure, fallback icon is used
            }
          }
          return item;
        })
      );

      if (changed && isMounted) {
        setShortcuts(updated);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error("Failed to update icon cache to storage", e);
        }
      }
    };

    if (shortcuts.some((s) => !s.icon)) {
      fetchMissingIcons();
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const addShortcutsFromPaths = async (paths: string[], forceFolder?: boolean) => {
    if (!paths || paths.length === 0) return;

    const newItems: ShortcutItem[] = [];

    for (const filePath of paths) {
      if (!filePath || typeof filePath !== "string") continue;

      // Check duplicates against current list and newly added in this batch
      const exists =
        shortcuts.some((s) => s.path.toLowerCase() === filePath.toLowerCase()) ||
        newItems.some((s) => s.path.toLowerCase() === filePath.toLowerCase());
      if (exists) continue;

      let isFolder = forceFolder ?? false;
      if (forceFolder === undefined) {
        try {
          isFolder = await invoke<boolean>("is_directory_path", { path: filePath });
        } catch {
          isFolder = !filePath.includes(".") || filePath.endsWith("/") || filePath.endsWith("\\");
        }
      }

      const normalized = filePath.replace(/\\/g, "/");
      const segments = normalized.split("/").filter(Boolean);
      let baseName = segments[segments.length - 1] || filePath;

      if (!isFolder) {
        baseName = baseName.replace(/\.(exe|lnk|url)$/i, "");
      }

      let iconBase64: string | undefined = undefined;
      try {
        const fetchedIcon = await invoke<string | null>("get_app_icon", {
          path: filePath,
          name: baseName
        });
        if (fetchedIcon) {
          iconBase64 = fetchedIcon;
        }
      } catch (e) {
        console.warn("Could not fetch icon for path:", filePath, e);
      }

      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: baseName,
        path: filePath,
        isFolder,
        icon: iconBase64
      });
    }

    if (newItems.length > 0) {
      setShortcuts((prev) => {
        const existingLower = new Set(prev.map((s) => s.path.toLowerCase()));
        const uniqueNew = newItems.filter((item) => !existingLower.has(item.path.toLowerCase()));
        const updated = [...prev, ...uniqueNew];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error("Failed to save shortcuts to localStorage:", e);
        }
        return updated;
      });
    }
  };

  const handleDropPaths = async (paths: string[]) => {
    if (!paths || paths.length === 0) return;

    const now = Date.now();
    if (now - lastProcessedDropTimeRef.current < 500) {
      return;
    }
    lastProcessedDropTimeRef.current = now;

    if (paths.length > 1) {
      setErrorMessage(t("shortcuts.error.singleFileOnly"));
      return;
    }

    const filePath = paths[0];
    if (!filePath || typeof filePath !== "string") {
      setErrorMessage(t("shortcuts.error.invalid"));
      return;
    }

    const normalizedTarget = filePath.replace(/\\/g, "/").toLowerCase();
    const alreadyExists = shortcuts.some(
      (s) => s.path.replace(/\\/g, "/").toLowerCase() === normalizedTarget
    );
    if (alreadyExists) {
      setErrorMessage(t("shortcuts.error.duplicate"));
      return;
    }

    let isFolder = false;
    try {
      isFolder = await invoke<boolean>("is_directory_path", { path: filePath });
    } catch {
      isFolder = !filePath.includes(".") || filePath.endsWith("/") || filePath.endsWith("\\");
    }

    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);
    let baseName = segments[segments.length - 1] || filePath;

    if (!isFolder) {
      baseName = baseName.replace(/\.(exe|lnk|url)$/i, "");
    }

    let iconBase64: string | undefined = undefined;
    try {
      const fetchedIcon = await invoke<string | null>("get_app_icon", {
        path: filePath,
        name: baseName
      });
      if (fetchedIcon) {
        iconBase64 = fetchedIcon;
      }
    } catch (e) {
      console.warn("Could not fetch icon for path:", filePath, e);
    }

    const newItem: ShortcutItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: baseName,
      path: filePath,
      isFolder,
      icon: iconBase64
    };

    setShortcuts((prev) => {
      if (prev.some((s) => s.path.replace(/\\/g, "/").toLowerCase() === normalizedTarget)) {
        return prev;
      }
      const updated = [...prev, newItem];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save shortcuts to localStorage:", e);
      }
      return updated;
    });

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          left: scrollRef.current.scrollWidth,
          behavior: "smooth"
        });
      }
    }, 60);
  };

  // Process pending drop paths passed down from App
  useEffect(() => {
    if (pendingDropPaths && pendingDropPaths.length > 0) {
      handleDropPaths(pendingDropPaths);
      onClearPendingDropPaths?.();
    }
  }, [pendingDropPaths, onClearPendingDropPaths]);

  // Listen to custom drop event from App level
  useEffect(() => {
    const handleCustomDrop = (e: Event) => {
      const customEvent = e as CustomEvent<{ paths: string[] }>;
      if (customEvent.detail && customEvent.detail.paths) {
        handleDropPaths(customEvent.detail.paths);
      }
    };
    window.addEventListener("nectar-drop-shortcuts", handleCustomDrop);

    return () => {
      window.removeEventListener("nectar-drop-shortcuts", handleCustomDrop);
    };
  }, [shortcuts]);

  const toggleAddMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !showAddMenu;
    setShowAddMenu(next);
    onAddMenuOpenChange?.(next);
  };

  const handleAddFileOrApp = async () => {
    closeAddMenu();
    onPickerActiveChange?.(true);
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: t("shortcuts.filterApps"),
            extensions: ["exe", "lnk"]
          },
          {
            name: t("shortcuts.filterAll"),
            extensions: ["*"]
          }
        ]
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        await addShortcutsFromPaths(paths, false);
      }
    } catch (err: any) {
      console.error("Failed to pick file:", err);
      setErrorMessage(`Error selecting file: ${err?.message || err}`);
    } finally {
      onPickerActiveChange?.(false);
    }
  };

  const handleAddFolder = async () => {
    closeAddMenu();
    onPickerActiveChange?.(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false
      });

      if (selected && typeof selected === "string") {
        await addShortcutsFromPaths([selected], true);
      }
    } catch (err: any) {
      console.error("Failed to pick folder:", err);
      setErrorMessage(`Error selecting folder: ${err?.message || err}`);
    } finally {
      onPickerActiveChange?.(false);
    }
  };

  const handleLaunch = async (item: ShortcutItem) => {
    try {
      await invoke("launch_shortcut", { path: item.path });
    } catch (err: any) {
      console.error("Failed to launch shortcut:", err);
      const msg = typeof err === "string" ? err : err?.message || "Failed to open item";
      setErrorMessage(`${item.name}: ${msg}`);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShortcuts((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("Failed to update localStorage:", err);
      }
      return updated;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();

    // Determine primary delta (use horizontal gesture if stronger, otherwise vertical wheel)
    let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    // Normalize deltaMode for mice that scroll by lines or pages
    if (e.deltaMode === 1) {
      // DOM_DELTA_LINE (typical desktop wheel)
      delta *= 24;
    } else if (e.deltaMode === 2) {
      // DOM_DELTA_PAGE
      delta *= 100;
    }

    if (delta === 0) return;

    wheelAccumRef.current += delta;

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft += wheelAccumRef.current;
        }
        wheelAccumRef.current = 0;
        rafIdRef.current = null;
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className="shortcuts-bar-container"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shortcuts-divider" />

      {errorMessage && (
        <div
          className="shortcuts-error-toast"
          onClick={() => setErrorMessage(null)}
          role="alert"
        >
          <AlertCircle size={13} strokeWidth={2.2} className="shortcuts-error-toast-icon" />
          <span className="shortcuts-error-toast-text">{errorMessage}</span>
          <button
            type="button"
            className="shortcuts-error-toast-close"
            onClick={(e) => {
              e.stopPropagation();
              setErrorMessage(null);
            }}
            aria-label={t("common.close")}
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <div className="shortcuts-wrapper-relative">
        {/* Drop zone overlay for populated list */}
        {shortcuts.length > 0 && isDropTargetActive && (
          <div className="shortcuts-drop-zone-overlay">
            <div className="shortcuts-drop-zone-content">
              <ArrowDownToLine size={18} className="shortcuts-drop-icon" />
              <span className="shortcuts-drop-text">{t("shortcuts.dropHere")}</span>
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          className={`shortcuts-scroll-area ${shortcuts.length === 0 ? "is-empty" : ""}`}
          onWheel={handleWheel}
        >
          {shortcuts.length === 0 ? (
            <div className="shortcuts-empty-container">
              <div className="shortcuts-header-label">
                {t("shortcuts.header")}
              </div>
              <div className={`shortcuts-empty-card ${isDropTargetActive ? "is-drop-active" : ""}`}>
                {isDropTargetActive ? (
                  <div className="shortcuts-empty-drop-active">
                    <div className="shortcuts-empty-icon-wrapper active">
                      <FileUp size={26} strokeWidth={2.4} className="shortcuts-empty-icon active-bounce" />
                    </div>
                    <span className="shortcuts-empty-drop-title">{t("shortcuts.dropToAdd")}</span>
                  </div>
                ) : (
                  <>
                    <div className="shortcuts-empty-icon-wrapper">
                      <FileUp size={26} strokeWidth={2.2} className="shortcuts-empty-icon" />
                    </div>
                    <div className="shortcuts-empty-text-group">
                      <span className="shortcuts-empty-title">{t("shortcuts.emptyTitle")}</span>
                      <span className="shortcuts-empty-subtitle">{t("shortcuts.emptySubtitle")}</span>
                    </div>
                    <div className="shortcuts-empty-actions">
                      <button
                        type="button"
                        className="shortcuts-empty-action-btn"
                        onClick={handleAddFileOrApp}
                        title={t("shortcuts.addFile")}
                      >
                        <FilePlus2 size={13} strokeWidth={2} />
                        <span>{t("shortcuts.addApp")}</span>
                      </button>
                      <button
                        type="button"
                        className="shortcuts-empty-action-btn"
                        onClick={handleAddFolder}
                        title={t("shortcuts.addFolder")}
                      >
                        <FolderPlus size={13} strokeWidth={2} />
                        <span>{t("shortcuts.addFolderBtn")}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {shortcuts.map((item) => (
                <div
                  key={item.id}
                  className="shortcut-card"
                  onClick={() => handleLaunch(item)}
                  onContextMenu={(e) => handleDelete(item.id, e)}
                  title={`${item.name}\n${item.path}\n${t("shortcuts.removeTooltip")}`}
                >
                  <button
                    type="button"
                    className="shortcut-delete-btn"
                    onClick={(e) => handleDelete(item.id, e)}
                    title={t("common.remove")}
                    aria-label={`${t("common.remove")} ${item.name}`}
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>

                  <div className="shortcut-icon-wrapper">
                    {item.icon ? (
                      <img
                        src={item.icon}
                        alt={item.name}
                        className="shortcut-icon-img"
                        draggable={false}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : item.isFolder ? (
                      <Folder size={24} className="shortcut-fallback-icon folder" />
                    ) : (
                      <AppWindow size={24} className="shortcut-fallback-icon app" />
                    )}
                  </div>

                  <span className="shortcut-label">{item.name}</span>
                </div>
              ))}

              <div className="shortcut-add-wrapper">
                <button
                  ref={addBtnRef}
                  type="button"
                  className={`shortcut-add-btn ${showAddMenu ? "active" : ""}`}
                  onClick={toggleAddMenu}
                  title={t("shortcuts.add")}
                >
                  <Plus size={18} strokeWidth={2.2} />
                  <span className="shortcut-add-label">{t("shortcuts.add")}</span>
                </button>
              </div>

              {SHOW_DEV_TOOLS && (
                <div className="shortcut-dev-pin-wrapper">
                  <button
                    type="button"
                    className={`shortcut-dev-pin-btn ${isDevPinned ? "is-pinned" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDevPin?.();
                    }}
                    title={isDevPinned ? "Đang ghim mở (DEV) — Nhấp để bỏ ghim" : "Ghim mở Shortcuts để thử nghiệm kéo thả (DEV) [Alt+P/F8]"}
                  >
                    {isDevPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    <span className="shortcut-dev-pin-text">{isDevPinned ? "PINNED" : "PIN"}</span>
                  </button>

                  <button
                    type="button"
                    className="shortcut-dev-testwin-btn"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setDevTestWinStatus("Creating...");
                      const label = "drag-test-" + Date.now();
                      try {
                        const win = new WebviewWindow(label, {
                          url: "index.html?drag-test=1",
                          title: "Oryvia Drag Test (DEV)",
                          width: 480,
                          height: 320,
                          x: 200,
                          y: 200,
                          decorations: true,
                          transparent: false,
                          alwaysOnTop: true,
                          dragDropEnabled: true,
                          focus: true,
                          visible: true
                        });

                        let resolved = false;

                        // Listen for native creation success
                        win.once("tauri://created", () => {
                          resolved = true;
                          console.log("[DEV_TEST_WIN] Native window successfully created:", label);
                          setDevTestWinStatus("Created!");
                          win.show().catch((err) => console.warn("[DEV_TEST_WIN] show error:", err));
                          win.setFocus().catch((err) => console.warn("[DEV_TEST_WIN] setFocus error:", err));
                          setTimeout(() => setDevTestWinStatus(null), 3000);
                        }).catch((err) => {
                          console.error("[DEV_TEST_WIN] Failed to register created listener:", err);
                          setDevTestWinStatus("Listener Err");
                        });

                        // Listen for native creation failure
                        win.once("tauri://error", (errEvent: any) => {
                          resolved = true;
                          const msg = typeof errEvent === "object" && errEvent !== null && "payload" in errEvent
                            ? String(errEvent.payload)
                            : String(errEvent);
                          console.error("[DEV_TEST_WIN] Native window creation failed:", msg);
                          setDevTestWinStatus("Err: " + msg.slice(0, 15));
                        }).catch((err) => {
                          console.error("[DEV_TEST_WIN] Failed to register error listener:", err);
                        });

                        // Fallback timeout check
                        setTimeout(() => {
                          if (!resolved) {
                            setDevTestWinStatus("Timeout (3s)");
                            setTimeout(() => setDevTestWinStatus(null), 3000);
                          }
                        }, 3000);

                      } catch (err: any) {
                        console.error("[DEV_TEST_WIN] Failed to create test window:", err);
                        setDevTestWinStatus("Sync Err: " + (err?.message || String(err)).slice(0, 15));
                        setTimeout(() => setDevTestWinStatus(null), 3000);
                      }
                    }}
                    title="Mở cửa sổ đối chứng độc lập 440x240 để thử nghiệm kéo thả (DEV)"
                  >
                    {devTestWinStatus || "TEST WIN"}
                  </button>

                  <button
                    type="button"
                    className={`shortcut-dev-unmask-btn ${isDevUnmaskActive ? "active" : ""}`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const next = !isDevUnmaskActive;
                      try {
                        await invoke("set_drag_hitbox_diag", { active: next });
                        const real = await invoke<boolean>("get_drag_hitbox_diag");
                        setIsDevUnmaskActive(!!real);
                        console.log("[DEV_UNMASK] Toggled to:", real);
                      } catch (err) {
                        console.error("[DEV_UNMASK] Failed to toggle:", err);
                      }
                    }}
                    title={isDevUnmaskActive ? "Đang bật UNMASK (DEV) — Nhấp để tắt" : "Bật thử nghiệm Hitbox Unmasking cho Dynamic Island (DEV)"}
                  >
                    {isDevUnmaskActive ? "UNMASK: ON" : "UNMASK: OFF"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Popover Menu: đặt ngay trong shortcuts-wrapper-relative, không bị scroll-area cắt, nằm trọn trong 108px của Island */}
        {showAddMenu && (
          <div
            ref={menuRef}
            className="shortcuts-add-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcuts-add-popover-header">
              <span>{t("shortcuts.addPopoverHeader")}</span>
              <button
                type="button"
                className="shortcuts-popover-close-btn"
                onClick={closeAddMenu}
                title={t("common.close")}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
            <div className="shortcuts-add-popover-actions">
              <button
                type="button"
                className="shortcuts-menu-item"
                onClick={handleAddFileOrApp}
              >
                <FilePlus2 size={13} />
                <span>{t("shortcuts.addAppOrFile")}</span>
              </button>
              <button
                type="button"
                className="shortcuts-menu-item"
                onClick={handleAddFolder}
              >
                <FolderPlus size={13} />
                <span>{t("shortcuts.folder")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
