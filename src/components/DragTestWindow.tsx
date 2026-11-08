import { useEffect, useState, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function DragTestWindow() {
  const [nativeLogs, setNativeLogs] = useState<string[]>([]);
  const [htmlLogs, setHtmlLogs] = useState<string[]>([]);
  const [lastFileName, setLastFileName] = useState<string>("");
  const [isOver, setIsOver] = useState(false);
  const [isUnmaskActive, setIsUnmaskActive] = useState(false);
  const [isTogglingUnmask, setIsTogglingUnmask] = useState(false);
  const overCountRef = useRef(0);

  // Sync UNMASK state with Rust backend
  useEffect(() => {
    invoke<boolean>("get_drag_hitbox_diag")
      .then((val) => setIsUnmaskActive(!!val))
      .catch(() => {});

    let unlistenUnmask: (() => void) | null = null;
    listen<boolean>("dev-unmask-changed", (event) => {
      setIsUnmaskActive(!!event.payload);
    }).then((fn) => {
      unlistenUnmask = fn;
    }).catch(() => {});

    return () => {
      if (unlistenUnmask) unlistenUnmask();
    };
  }, []);

  const handleToggleUnmask = async () => {
    setIsTogglingUnmask(true);
    try {
      const next = !isUnmaskActive;
      await invoke("set_drag_hitbox_diag", { active: next });
      const real = await invoke<boolean>("get_drag_hitbox_diag");
      setIsUnmaskActive(!!real);
    } catch (err) {
      console.error("[DEV_TEST_WIN] Failed to toggle unmask:", err);
    } finally {
      setIsTogglingUnmask(false);
    }
  };

  useEffect(() => {
    document.title = "Oryvia Drag Test (DEV)";
    invoke("save_setting", {
      key: "nectar-drag-diag-testwin-mounted",
      value: JSON.stringify({ mounted: true, timestamp: Date.now() })
    }).catch(() => {});

    let unlistenNative: (() => void) | null = null;
    let mounted = true;

    async function setup() {
      try {
        const webview = getCurrentWebview();
        unlistenNative = await webview.onDragDropEvent((event) => {
          if (!mounted) return;
          const payload = event.payload;
          const type = payload.type;
          const time = new Date().toLocaleTimeString();

          if (type === "enter") {
            setIsOver(true);
            overCountRef.current = 0;
            setNativeLogs((prev) => [`[${time}] Native: ENTER`, ...prev].slice(0, 8));
            invoke("log_dev_drag_event", {
              windowLabel: "drag-test",
              eventType: "enter",
              x: null,
              y: null,
              count: null
            }).catch(() => {});
            invoke("save_setting", {
              key: "nectar-drag-diag-testwin",
              value: JSON.stringify({ type: "enter", timestamp: Date.now() })
            }).catch(() => {});
          } else if (type === "over") {
            setIsOver(true);
            overCountRef.current += 1;
            if (overCountRef.current % 15 === 1) {
              setNativeLogs((prev) => [`[${time}] Native: OVER (active)`, ...prev.filter(l => !l.includes("OVER"))].slice(0, 8));
            }
          } else if (type === "leave") {
            setIsOver(false);
            setNativeLogs((prev) => [`[${time}] Native: LEAVE`, ...prev].slice(0, 8));
            invoke("log_dev_drag_event", {
              windowLabel: "drag-test",
              eventType: "leave",
              x: null,
              y: null,
              count: null
            }).catch(() => {});
            invoke("save_setting", {
              key: "nectar-drag-diag-testwin",
              value: JSON.stringify({ type: "leave", timestamp: Date.now() })
            }).catch(() => {});
          } else if (type === "drop") {
            setIsOver(false);
            const paths = "paths" in payload && Array.isArray(payload.paths) ? payload.paths : [];
            const fileCount = paths.length;
            const firstName = paths.length > 0 ? (paths[0].split(/[/\\]/).pop() || "file") : "";
            if (firstName) {
              setLastFileName(firstName);
            }
            setNativeLogs((prev) => [`[${time}] Native: DROP (${fileCount} files)`, ...prev].slice(0, 8));
            invoke("log_dev_drag_event", {
              windowLabel: "drag-test",
              eventType: "drop",
              x: null,
              y: null,
              count: fileCount
            }).catch(() => {});
            invoke("save_setting", {
              key: "nectar-drag-diag-testwin",
              value: JSON.stringify({ type: "drop", fileCount, timestamp: Date.now() })
            }).catch(() => {});
          }
        });
      } catch (err) {
        console.error("[DEV_TEST_WIN] Error listening native drag:", err);
      }
    }

    setup();
    return () => {
      mounted = false;
      if (unlistenNative) unlistenNative();
    };
  }, []);

  const handleHtmlDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleHtmlDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const time = new Date().toLocaleTimeString();
    setHtmlLogs((prev) => [`[${time}] HTML5: dragenter`, ...prev].slice(0, 4));
  };

  const handleHtmlDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleHtmlDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const time = new Date().toLocaleTimeString();
    const count = e.dataTransfer.files.length;
    setHtmlLogs((prev) => [`[${time}] HTML5: drop (${count} items)`, ...prev].slice(0, 4));
  };

  return (
    <div
      onDragEnter={handleHtmlDragEnter}
      onDragOver={handleHtmlDragOver}
      onDragLeave={handleHtmlDragLeave}
      onDrop={handleHtmlDrop}
      style={{
        width: "100vw",
        height: "100vh",
        boxSizing: "border-box",
        backgroundColor: "#121214",
        color: "#f0f0f5",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        userSelect: "none",
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#38bdf8", letterSpacing: "0.5px" }}>
            DRAG & DROP DIAGNOSTIC
          </span>
          <span style={{ fontSize: "9px", backgroundColor: "#0284c7", color: "#ffffff", padding: "1px 5px", borderRadius: "3px", fontWeight: 600 }}>
            DEV ONLY
          </span>
        </div>
        <span style={{ fontSize: "10px", color: "#94a3b8" }}>
          Standard Window (Transparent: false)
        </span>
      </div>

      {/* Persistent UNMASK Control for Dynamic Island */}
      <div
        style={{
          backgroundColor: isUnmaskActive ? "rgba(16, 185, 129, 0.12)" : "rgba(255, 255, 255, 0.04)",
          border: isUnmaskActive ? "1px solid rgba(52, 211, 153, 0.4)" : "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "8px",
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          transition: "all 0.2s ease"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: isUnmaskActive ? "#34d399" : "#e2e8f0" }}>
              UNMASK MAIN ISLAND
            </span>
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: "4px",
                backgroundColor: isUnmaskActive ? "#059669" : "#3f3f46",
                color: "#ffffff"
              }}
            >
              {isUnmaskActive ? "ACTIVE (ON)" : "OFF"}
            </span>
          </div>
          <span style={{ fontSize: "10px", color: "#94a3b8", lineHeight: "13px" }}>
            {isUnmaskActive
              ? "Backend Rust: DEV_DRAG_HITBOX_ENABLED = true. Dynamic Island chính nhận chuột khi hover (kể cả khi Compact)."
              : "Backend Rust: DEV_DRAG_HITBOX_ENABLED = false. Click-through giữ nguyên mặc định."}
          </span>
        </div>

        <button
          type="button"
          onClick={handleToggleUnmask}
          disabled={isTogglingUnmask}
          style={{
            cursor: "pointer",
            padding: "5px 12px",
            fontSize: "11px",
            fontWeight: 700,
            borderRadius: "6px",
            border: isUnmaskActive ? "1px solid #34d399" : "1px solid #64748b",
            backgroundColor: isUnmaskActive ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
            color: isUnmaskActive ? "#34d399" : "#f1f5f9",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap"
          }}
        >
          {isTogglingUnmask ? "..." : isUnmaskActive ? "TẮT UNMASK" : "BẬT UNMASK"}
        </button>
      </div>

      {/* Drop Zone */}
      <div
        style={{
          flex: 1,
          border: isOver ? "2px dashed #38bdf8" : "2px dashed #475569",
          borderRadius: "8px",
          backgroundColor: isOver ? "rgba(56, 189, 248, 0.12)" : "rgba(255, 255, 255, 0.03)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
          padding: "6px",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "2px", color: isOver ? "#38bdf8" : "#e2e8f0" }}>
          {isOver ? "THẢ TỆP VÀO ĐÂY" : "KÉO TỆP TỪ EXPLORER VÀO ĐÂY (TEST ĐỐI CHỨNG)"}
        </div>
        <div style={{ fontSize: "10px", color: "#64748b" }}>
          {lastFileName ? `Tệp đã nhận: ${lastFileName}` : "Cửa sổ này chứng minh Windows WebView2 nhận native OLE drag & drop"}
        </div>
      </div>

      {/* Event Logs */}
      <div style={{ fontSize: "10px", backgroundColor: "#09090b", padding: "6px 8px", borderRadius: "6px", height: "60px", overflowY: "auto" }}>
        <div style={{ color: "#a1a1aa", fontWeight: 600, marginBottom: "2px", fontSize: "10px" }}>Live Event Log:</div>
        {nativeLogs.length === 0 && htmlLogs.length === 0 ? (
          <div style={{ color: "#52525b", fontStyle: "italic", fontSize: "9px" }}>Chưa nhận sự kiện nào...</div>
        ) : (
          <>
            {nativeLogs.map((log, i) => (
              <div key={"nat-" + i} style={{ color: "#4ade80", fontSize: "9px", lineHeight: "13px" }}>{log}</div>
            ))}
            {htmlLogs.map((log, i) => (
              <div key={"html-" + i} style={{ color: "#fbbf24", fontSize: "9px", lineHeight: "13px" }}>{log}</div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
