import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Bluetooth,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogOut,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secured: boolean;
  connected: boolean;
  known: boolean;
  security_type: string;
  security?: string;
}

export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  status: "connected" | "paired" | "unknown";
  audio_status?: "active" | "inactive" | "none" | string;
  audio_connected?: boolean;
  device_kind:
    | "audio"
    | "phone"
    | "ble-gatt"
    | "classic-hid"
    | "ble-hid"
    | "classic-other"
    | string;
  can_connect: boolean;
  can_disconnect: boolean;
  address?: string | null;
  disabled_reason?: string | null;
  disabled_reason_code?: string | null;
}

export interface DiscoveredBluetoothDevice {
  id: string;
  name: string;
  address?: string | null;
  device_kind: string;
  can_pair: boolean;
  is_paired: boolean;
  disabled_reason_code?: string | null;
}

export interface BluetoothActionResult {
  outcome: "confirmed" | "pending" | "failed" | "unsupported" | "unknown";
  connected: boolean;
  status: string;
  reason_code?: string | null;
  message?: string | null;
}

export interface BluetoothPairResult {
  success: boolean;
  status: "paired" | "failed" | "unsupported" | "already_paired" | string;
  reason_code?: string | null;
  message?: string | null;
}

interface Props {
  kind: "wifi" | "bluetooth";
  onBack: () => void;
  onOpenWindowsSettings: () => void;
  onWifiChanged?: () => void;
  onKeyboardFocusChange?: (focused: boolean) => void;
  onPairingChange?: (pairing: boolean) => void;
}

function signalBars(signal: number): number {
  if (signal >= 75) return 4;
  if (signal >= 50) return 3;
  if (signal >= 25) return 2;
  return 1;
}

function isPasswordValidForSecurity(pwd: string, secType: string): boolean {
  if (!pwd) return false;
  if (secType === "wep") {
    const len = pwd.length;
    if (len === 5 || len === 13 || len === 16) return true;
    if ((len === 10 || len === 26 || len === 32) && /^[0-9a-fA-F]+$/.test(pwd)) {
      return true;
    }
    return false;
  }
  if (secType === "wpa3-sae") {
    return pwd.length >= 8 && pwd.length <= 128;
  }
  if (pwd.length === 64 && /^[0-9a-fA-F]+$/.test(pwd)) {
    return true;
  }
  return pwd.length >= 8 && pwd.length <= 63;
}

interface BannerNotice {
  type: "error" | "warning" | "info" | "pending";
  message: string;
}

let lastFocusSeq = 0;
function nextFocusSeq(): number {
  const now = Date.now();
  lastFocusSeq = now > lastFocusSeq ? now : lastFocusSeq + 1;
  return lastFocusSeq;
}

export function ConnectionsView({
  kind,
  onBack,
  onOpenWindowsSettings,
  onWifiChanged,
  onKeyboardFocusChange,
  onPairingChange,
}: Props) {
  const { t } = useI18n();
  const [wifi, setWifi] = useState<WifiNetwork[]>([]);
  const [bt, setBt] = useState<BluetoothDeviceInfo[]>([]);
  const [discoveredBt, setDiscoveredBt] = useState<DiscoveredBluetoothDevice[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerNotice | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    | "connect"
    | "disconnect"
    | "forget"
    | "remove"
    | "bt-connect"
    | "bt-disconnect"
    | "pair"
    | null
  >(null);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmForget, setConfirmForget] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [expandedBtId, setExpandedBtId] = useState<string | null>(null);
  const [unsupportedBtMap, setUnsupportedBtMap] = useState<Record<string, string>>({});

  const inputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const reqIdRef = useRef(0);
  const lastActionTimeRef = useRef(0);
  const onKeyboardFocusChangeRef = useRef(onKeyboardFocusChange);

  useEffect(() => {
    onKeyboardFocusChangeRef.current = onKeyboardFocusChange;
  }, [onKeyboardFocusChange]);

  useEffect(() => {
    onPairingChange?.(Boolean(pairingId));
  }, [pairingId, onPairingChange]);

  const getLocalizedReason = useCallback(
    (codeOrMsg: string | null | undefined): string => {
      if (!codeOrMsg) return "";
      const key = `connections.reasons.${codeOrMsg}`;
      const translated = t(key);
      if (translated && translated !== key) {
        return translated;
      }
      return codeOrMsg;
    },
    [t]
  );

  const showNotice = useCallback(
    (message: string, type: "error" | "warning" | "info" | "pending" = "error") => {
      if (mountedRef.current) {
        setBanner({ type, message: getLocalizedReason(message) });
      }
    },
    [getLocalizedReason]
  );

  // Auto-dismiss notice banner after 8 seconds (except for pending notices)
  useEffect(() => {
    if (!banner || banner.type === "pending") return;
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        setBanner(null);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onKeyboardFocusChangeRef.current?.(false);
      const seq = nextFocusSeq();
      invoke("set_window_keyboard_focus", { enabled: false, seq }).catch(() => {});
      invoke("bluetooth_stop_discovery").catch(() => {});
    };
  }, []);

  // Listen to background Bluetooth discovery events
  useEffect(() => {
    if (kind !== "bluetooth") return;
    let unlistenUpdate: (() => void) | undefined;
    let unlistenStopped: (() => void) | undefined;

    listen<DiscoveredBluetoothDevice[]>("bluetooth-discovery-update", (event) => {
      if (mountedRef.current) {
        setDiscoveredBt(event.payload);
      }
    }).then((un) => {
      unlistenUpdate = un;
    });

    listen("bluetooth-discovery-stopped", () => {
      if (mountedRef.current) {
        setDiscovering(false);
      }
    }).then((un) => {
      unlistenStopped = un;
    });

    return () => {
      unlistenUpdate?.();
      unlistenStopped?.();
      invoke("bluetooth_stop_discovery").catch(() => {});
    };
  }, [kind]);

  const refresh = useCallback(
    async (silent = false) => {
      const reqId = ++reqIdRef.current;
      if (!silent) {
        setLoading(true);
        setBanner(null);
      }
      try {
        if (kind === "wifi") {
          const list = await invoke<WifiNetwork[]>(
            silent ? "wifi_status_list" : "wifi_scan"
          );
          if (mountedRef.current && reqId === reqIdRef.current) {
            setWifi(list);
          }
        } else {
          const list = await invoke<BluetoothDeviceInfo[]>("bluetooth_devices");
          if (mountedRef.current && reqId === reqIdRef.current) {
            // Guard against periodic background refresh clobbering a very recent action
            if (Date.now() - lastActionTimeRef.current < 2500) {
              setBt((prev) =>
                list.map((freshItem) => {
                  const local = prev.find((p) => p.id === freshItem.id);
                  if (
                    local &&
                    local.status !== freshItem.status &&
                    local.connected !== freshItem.connected
                  ) {
                    return {
                      ...freshItem,
                      connected: local.connected,
                      status: local.status,
                      can_connect: local.can_connect,
                      can_disconnect: local.can_disconnect,
                    };
                  }
                  return freshItem;
                })
              );
            } else {
              setBt(list);
            }
          }
        }
      } catch (e) {
        if (mountedRef.current && reqId === reqIdRef.current && !silent) {
          showNotice(String(e), "error");
        }
      } finally {
        if (mountedRef.current && reqId === reqIdRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [kind, showNotice]
  );

  useEffect(() => {
    refresh(false);
  }, [refresh]);

  // Periodic silent status sync while panel is open and user is idle
  useEffect(() => {
    if (
      busyKey ||
      passwordFor ||
      confirmForget ||
      confirmRemove ||
      discovering ||
      pairingId
    ) {
      return;
    }
    const timer = setInterval(() => {
      if (mountedRef.current) {
        void refresh(true);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [
    busyKey,
    passwordFor,
    confirmForget,
    confirmRemove,
    discovering,
    pairingId,
    refresh,
  ]);

  const hasPasswordPrompt = Boolean(passwordFor);

  useEffect(() => {
    if (hasPasswordPrompt) {
      onKeyboardFocusChangeRef.current?.(true);
      const seq = nextFocusSeq();
      invoke("set_window_keyboard_focus", { enabled: true, seq })
        .catch(() => {})
        .finally(() => {
          if (mountedRef.current) {
            inputRef.current?.focus();
          }
        });
      return () => {
        onKeyboardFocusChangeRef.current?.(false);
        const offSeq = nextFocusSeq();
        invoke("set_window_keyboard_focus", { enabled: false, seq: offSeq }).catch(
          () => {}
        );
      };
    }
  }, [hasPasswordPrompt]);

  const closePasswordPrompt = () => {
    setPasswordFor(null);
    setPassword("");
    setShowPassword(false);
    onKeyboardFocusChangeRef.current?.(false);
    const seq = nextFocusSeq();
    invoke("set_window_keyboard_focus", { enabled: false, seq }).catch(() => {});
  };

  const handleWifiConnect = async (ssid: string, pwd?: string) => {
    setBusyKey(ssid);
    setBusyAction("connect");
    setBanner(null);
    try {
      await invoke("wifi_connect", { ssid, password: pwd ?? null });
      if (!mountedRef.current) return;
      closePasswordPrompt();
      setBanner(null);
      onWifiChanged?.();
      await refresh(false);
    } catch (e) {
      if (!mountedRef.current) return;
      showNotice(String(e), "error");
    } finally {
      if (mountedRef.current) {
        setBusyKey(null);
        setBusyAction(null);
      }
    }
  };

  const handleWifiDisconnect = async (ssid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmForget(null);
    setBusyKey(ssid);
    setBusyAction("disconnect");
    setBanner(null);
    try {
      await invoke("wifi_disconnect");
      if (!mountedRef.current) return;
      setBanner(null);
      onWifiChanged?.();
      await refresh(true);
    } catch (e) {
      if (!mountedRef.current) return;
      showNotice(String(e), "error");
    } finally {
      if (mountedRef.current) {
        setBusyKey(null);
        setBusyAction(null);
      }
    }
  };

  const handleWifiForget = async (ssid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmForget !== ssid) {
      setConfirmForget(ssid);
      return;
    }
    setConfirmForget(null);
    setBusyKey(ssid);
    setBusyAction("forget");
    setBanner(null);
    try {
      await invoke("wifi_forget", { ssid });
      if (!mountedRef.current) return;
      setBanner(null);
      onWifiChanged?.();
      await refresh(false);
    } catch (e) {
      if (!mountedRef.current) return;
      showNotice(String(e), "error");
    } finally {
      if (mountedRef.current) {
        setBusyKey(null);
        setBusyAction(null);
      }
    }
  };

  const handleWifiRowClick = (n: WifiNetwork) => {
    if (busyKey) return;
    setConfirmForget(null);
    if (n.connected) return;
    if (n.known && !passwordFor) {
      handleWifiConnect(n.ssid);
    } else if (n.secured) {
      if (passwordFor === n.ssid) {
        setPasswordFor(null);
        setPassword("");
        setShowPassword(false);
      } else {
        setPasswordFor(n.ssid);
        setPassword("");
        setShowPassword(false);
      }
      setBanner(null);
    } else {
      handleWifiConnect(n.ssid);
    }
  };

  const handleBtConnect = async (d: BluetoothDeviceInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busyKey || pairingId) return;
    setConfirmRemove(null);
    setBusyKey(d.id);
    setBusyAction("bt-connect");
    setBanner(null);
    lastActionTimeRef.current = Date.now();
    try {
      const res = await invoke<BluetoothActionResult>("bluetooth_connect", {
        id: d.id,
      });
      if (!mountedRef.current) return;

      if (res.outcome === "confirmed") {
        // Immediate optimistic UI sync once Windows confirms success
        setBt((prev) =>
          prev.map((item) => {
            if (item.id !== d.id) return item;
            return {
              ...item,
              connected: true,
              status: "connected",
              can_connect: false,
              can_disconnect: item.device_kind === "audio",
            };
          })
        );
        setBusyKey(null);
        setBusyAction(null);
        setBanner(null);
        void refresh(true);
      } else {
        setBusyKey(null);
        setBusyAction(null);
        if (res.outcome === "unsupported") {
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.btUnsupportedNote");
          setUnsupportedBtMap((prev) => ({
            ...prev,
            [d.id]: msg,
          }));
          setExpandedBtId(d.id);
          showNotice(msg, "warning");
        } else if (res.outcome === "failed") {
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.reasons.device_out_of_range");
          showNotice(msg, "error");
        } else if (res.outcome === "pending") {
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.reasons.connecting_pending");
          showNotice(msg, "pending");
        } else {
          // "unknown"
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.reasons.status_unknown");
          showNotice(msg, "warning");
        }
        void refresh(true);
      }
    } catch (err) {
      if (mountedRef.current) {
        setBusyKey(null);
        setBusyAction(null);
        showNotice(String(err), "error");
      }
    }
  };

  const handleBtDisconnect = async (
    d: BluetoothDeviceInfo,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (busyKey || pairingId) return;
    setConfirmRemove(null);
    setBusyKey(d.id);
    setBusyAction("bt-disconnect");
    setBanner(null);
    lastActionTimeRef.current = Date.now();
    try {
      const res = await invoke<BluetoothActionResult>("bluetooth_disconnect", {
        id: d.id,
      });
      if (!mountedRef.current) return;

      if (res.outcome === "confirmed") {
        setBt((prev) =>
          prev.map((item) => {
            if (item.id !== d.id) return item;
            return {
              ...item,
              connected: false,
              status: "paired",
              can_connect: item.device_kind === "audio" || item.can_connect,
              can_disconnect: false,
            };
          })
        );
        setBusyKey(null);
        setBusyAction(null);
        setBanner(null);
        void refresh(true);
      } else {
        setBusyKey(null);
        setBusyAction(null);
        if (res.outcome === "unsupported") {
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.btUnsupportedNote");
          setUnsupportedBtMap((prev) => ({
            ...prev,
            [d.id]: msg,
          }));
          setExpandedBtId(d.id);
          showNotice(msg, "warning");
        } else if (res.outcome === "failed") {
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.reasons.device_remained_connected");
          showNotice(msg, "error");
        } else if (res.outcome === "pending") {
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.reasons.disconnecting_pending");
          showNotice(msg, "pending");
        } else {
          // "unknown"
          const msg =
            getLocalizedReason(res.reason_code) ||
            res.message ||
            t("connections.reasons.status_unknown");
          showNotice(msg, "warning");
        }
        void refresh(true);
      }
    } catch (err) {
      if (mountedRef.current) {
        setBusyKey(null);
        setBusyAction(null);
        showNotice(String(err), "error");
      }
    }
  };

  const handleBtRowClick = (d: BluetoothDeviceInfo) => {
    if (busyKey || pairingId) return;
    setConfirmRemove(null);
    if (d.status === "unknown") return;
    setExpandedBtId((prev) => (prev === d.id ? null : d.id));
  };

  const handleBtRemoveClick = (d: BluetoothDeviceInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (busyKey || pairingId) return;
    if (confirmRemove !== d.id) {
      setConfirmRemove(d.id);
      return;
    }
    doBtRemove(d);
  };

  const doBtRemove = async (d: BluetoothDeviceInfo) => {
    setConfirmRemove(null);
    setBusyKey(d.id);
    setBusyAction("remove");
    setBanner(null);
    try {
      await invoke("bluetooth_unpair", { id: d.id });
      if (!mountedRef.current) return;
      if (expandedBtId === d.id) setExpandedBtId(null);
      setBanner(null);
      await refresh(false);
    } catch (err) {
      if (mountedRef.current) showNotice(String(err), "error");
    } finally {
      if (mountedRef.current) {
        setBusyKey(null);
        setBusyAction(null);
      }
    }
  };

  const handleStartDiscovery = async () => {
    if (discovering || busyKey || pairingId) return;
    setDiscovering(true);
    setBanner(null);
    try {
      await invoke("bluetooth_start_discovery");
    } catch (e) {
      if (mountedRef.current) {
        setDiscovering(false);
        showNotice(String(e), "error");
      }
    }
  };

  const handleStopDiscovery = async () => {
    try {
      await invoke("bluetooth_stop_discovery");
    } catch {
      // ignore
    } finally {
      if (mountedRef.current) {
        setDiscovering(false);
      }
    }
  };

  const handlePairDevice = async (d: DiscoveredBluetoothDevice) => {
    if (pairingId || busyKey || (!d.can_pair && d.disabled_reason_code === "pairing_not_supported")) return;
    setPairingId(d.id);
    setBanner(null);
    try {
      const res = await invoke<BluetoothPairResult>("bluetooth_pair_device", {
        id: d.id,
      });
      if (!mountedRef.current) return;
      if (res.success) {
        showNotice(t("connections.pairSuccess"), "info");
        // Remove from nearby list
        setDiscoveredBt((prev) => prev.filter((item) => item.id !== d.id));
        // Refresh paired devices list
        await refresh(false);
      } else {
        const msg =
          getLocalizedReason(res.reason_code) ||
          res.message ||
          t("connections.reasons.pairing_failed");
        showNotice(msg, res.status === "unsupported" ? "warning" : "error");

        if (res.reason_code) {
          setDiscoveredBt((prev) =>
            prev.map((item) =>
              item.id === d.id
                ? {
                    ...item,
                    can_pair: res.reason_code !== "pairing_not_supported",
                    disabled_reason_code: res.reason_code,
                  }
                : item
            )
          );
        }
      }
    } catch (e) {
      if (mountedRef.current) {
        showNotice(String(e), "error");
      }
    } finally {
      if (mountedRef.current) {
        setPairingId(null);
      }
    }
  };

  const getPairButtonTooltip = (d: DiscoveredBluetoothDevice): string => {
    if (d.is_paired) {
      return t("connections.reasons.device_already_paired");
    }
    if (!d.can_pair) {
      if (d.disabled_reason_code) {
        const loc = getLocalizedReason(d.disabled_reason_code);
        if (loc && loc !== d.disabled_reason_code) return loc;
      }
      return t("connections.reasons.pairing_not_supported");
    }
    return t("connections.pairBtnTooltip") || t("connections.pairBtn");
  };

  const busyLabelForWifi = (n: WifiNetwork) => {
    const secType = n.security_type || n.security || "open";
    if (busyAction === "disconnect") return t("connections.disconnecting");
    if (busyAction === "forget") return t("connections.forgetting");
    if (secType === "wep") return t("connections.verifyingWep");
    if (secType === "wpa3-sae") return t("connections.handshakingWpa3");
    return t("connections.connecting");
  };

  const busyLabelForBt = () => {
    if (busyAction === "bt-connect") return t("connections.connecting");
    if (busyAction === "bt-disconnect") return t("connections.disconnecting");
    if (busyAction === "remove") return t("connections.forgetting");
    return t("connections.connecting");
  };

  const statusLabelForBt = (d: BluetoothDeviceInfo) => {
    if (busyKey === d.id) return busyLabelForBt();
    const isConnected = d.status === "connected" || d.connected;
    if (isConnected) {
      return t("connections.connected");
    }
    if (d.status === "paired") {
      return t("connections.paired");
    }
    return t("connections.statusUnknown");
  };

  const connectedBt = bt.filter((d) => d.status === "connected" || d.connected);
  const pairedBt = bt.filter((d) => d.status !== "connected" && !d.connected);
  const nearbyBt = discoveredBt.filter(
    (d) =>
      !bt.some(
        (p) =>
          p.id === d.id ||
          (p.address && d.address && p.address.toLowerCase() === d.address.toLowerCase())
      )
  );

  const title = kind === "wifi" ? t("connections.wifi.title") : t("connections.bluetooth.title");

  const renderBtDeviceRow = (d: BluetoothDeviceInfo) => {
    const isBusy = busyKey === d.id;
    const confirming = confirmRemove === d.id;
    const isUnknown = d.status === "unknown";
    const isConnected = d.status === "connected" || d.connected;
    const isUnsupported =
      Boolean(unsupportedBtMap[d.id]) ||
      (!d.can_connect && !d.can_disconnect && !isUnknown);
    const showExpanded = expandedBtId === d.id && !isUnknown;

    return (
      <div key={d.id} className={`cv-item ${isConnected ? "connected" : ""}`}>
        <div className="cv-row-wrap">
          <button
            type="button"
            className={`cv-row ${isUnknown ? "static" : ""}`}
            onClick={() => handleBtRowClick(d)}
            disabled={isBusy || Boolean(pairingId)}
          >
            <Bluetooth size={14} className="cv-bt-icon" />
            <span className="cv-row-main">
              <span className="cv-row-name">{d.name}</span>
              <span className="cv-row-sub">{statusLabelForBt(d)}</span>
            </span>
            {isBusy ? (
              <Loader2 size={13} className="cv-spin" />
            ) : isConnected ? (
              <Check size={13} className="cv-check" />
            ) : null}
          </button>
          {!isBusy && (
            <div className="cv-row-actions">
              {!confirming && !isUnknown && !unsupportedBtMap[d.id] && (
                <>
                  {isConnected && d.can_disconnect && (
                    <button
                      type="button"
                      className="cv-action-pill disconnect"
                      onClick={(e) => handleBtDisconnect(d, e)}
                      disabled={Boolean(pairingId)}
                      title={t("connections.disconnectBtn")}
                    >
                      <LogOut size={11} />
                      <span>{t("connections.disconnectBtn")}</span>
                    </button>
                  )}
                  {!isConnected && d.can_connect && (
                    <button
                      type="button"
                      className="cv-action-pill connect"
                      onClick={(e) => handleBtConnect(d, e)}
                      disabled={Boolean(pairingId)}
                      title={t("connections.connectBtn")}
                    >
                      <span>{t("connections.connectBtn")}</span>
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                className={`cv-mini-btn danger ${confirming ? "confirm" : ""}`}
                onClick={(e) => handleBtRemoveClick(d, e)}
                disabled={Boolean(pairingId)}
                title={t("connections.removeDevice")}
              >
                <Trash2 size={12} />
                {confirming && <span>{t("connections.removeConfirm")}</span>}
              </button>
              {confirming && (
                <button
                  type="button"
                  className="cv-mini-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRemove(null);
                  }}
                  title={t("connections.cancel")}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>
        {showExpanded && (
          <div className="cv-bt-extra">
            {isUnsupported && (
              <div className="cv-bt-note">
                {unsupportedBtMap[d.id] ||
                  getLocalizedReason(d.disabled_reason_code) ||
                  d.disabled_reason ||
                  t("connections.btUnsupportedNote")}
              </div>
            )}
            <div className="cv-bt-extra-actions">
              <button
                type="button"
                className="cv-action-pill settings"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWindowsSettings();
                }}
              >
                <Settings size={11} />
                <span>{t("connections.openBtSettings")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="cv-root"
      onWheel={(e) => {
        // Prevent mouse wheel from bubbling to Dynamic Island mode switch
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (confirmForget) setConfirmForget(null);
        if (confirmRemove) setConfirmRemove(null);
      }}
    >
      <div className="cv-header">
        <button
          type="button"
          className="cv-icon-btn"
          onClick={() => {
            closePasswordPrompt();
            onBack();
          }}
          title={t("connections.back")}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="cv-title">{title}</div>
        <button
          type="button"
          className="cv-icon-btn"
          onClick={() => refresh(false)}
          disabled={loading || !!busyKey || !!pairingId}
          title={t("connections.refresh")}
        >
          <RefreshCw size={13} className={loading ? "cv-spin" : ""} />
        </button>
        <button
          type="button"
          className="cv-settings-btn"
          onClick={() => {
            closePasswordPrompt();
            onOpenWindowsSettings();
          }}
          title={t("connections.windowsSettings")}
        >
          <Settings size={13} />
          <span>{t("connections.windowsSettings")}</span>
        </button>
      </div>

      {banner && (
        <div className={`cv-error ${banner.type}`}>
          <div className="cv-error-text">{banner.message}</div>
          {banner.type === "warning" && (
            <button
              type="button"
              className="cv-action-pill"
              style={{
                marginLeft: "auto",
                marginRight: 6,
                fontSize: "0.68rem",
                padding: "2px 8px",
                flexShrink: 0,
              }}
              onClick={() => onOpenWindowsSettings()}
              title={t("connections.windowsSettings")}
            >
              <span>{t("connections.windowsSettings")}</span>
            </button>
          )}
          <button
            type="button"
            className="cv-error-close"
            onClick={() => setBanner(null)}
            title={t("connections.dismiss")}
            aria-label={t("connections.dismiss")}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div
        className="cv-list"
        onWheel={(e) => {
          e.stopPropagation();
        }}
      >
        {loading && (kind === "wifi" ? wifi.length === 0 : bt.length === 0) ? (
          <div className="cv-empty">
            <Loader2 size={16} className="cv-spin" />
            <span>
              {kind === "wifi"
                ? t("connections.scanning")
                : t("connections.loading")}
            </span>
          </div>
        ) : kind === "wifi" ? (
          wifi.length === 0 ? (
            <div className="cv-empty">{t("connections.wifi.empty")}</div>
          ) : (
            wifi.map((n) => {
              const isBusy = busyKey === n.ssid;
              const hasPrompt = passwordFor === n.ssid;
              const confirming = confirmForget === n.ssid;
              const bars = signalBars(n.signal);
              const secType = n.security_type || n.security || "open";
              const isWep = secType === "wep";
              const isWpa3 = secType === "wpa3-sae";
              const isPassValid = isPasswordValidForSecurity(password, secType);

              return (
                <div
                  key={n.ssid}
                  className={`cv-item ${n.connected ? "connected" : ""}`}
                >
                  <div className="cv-row-wrap">
                    <button
                      type="button"
                      className="cv-row"
                      onClick={() => handleWifiRowClick(n)}
                      disabled={isBusy}
                    >
                      <Wifi size={14} className={`cv-signal-icon bars-${bars}`} />
                      <span className="cv-row-main">
                        <span className="cv-row-name">{n.ssid}</span>
                        <span className="cv-row-sub">
                          {isBusy ? (
                            busyLabelForWifi(n)
                          ) : n.connected ? (
                            t("connections.connected")
                          ) : n.known ? (
                            t("connections.saved")
                          ) : (
                            secType.toUpperCase()
                          )}
                        </span>
                      </span>
                      {isBusy ? (
                        <Loader2 size={13} className="cv-spin" />
                      ) : n.connected ? (
                        <Check size={13} className="cv-check" />
                      ) : n.secured ? (
                        <Lock size={12} className="cv-lock" />
                      ) : null}
                    </button>
                    {!isBusy && (
                      <div className="cv-row-actions">
                        {n.connected && (
                          <button
                            type="button"
                            className="cv-action-pill disconnect"
                            onClick={(e) => handleWifiDisconnect(n.ssid, e)}
                            title={t("connections.disconnectBtn")}
                          >
                            <LogOut size={11} />
                            <span>{t("connections.disconnectBtn")}</span>
                          </button>
                        )}
                        {n.known && !n.connected && (
                          <button
                            type="button"
                            className={`cv-mini-btn danger ${
                              confirming ? "confirm" : ""
                            }`}
                            onClick={(e) => handleWifiForget(n.ssid, e)}
                            title={t("connections.forget")}
                          >
                            <Trash2 size={12} />
                            {confirming && (
                              <span>{t("connections.forgetConfirm")}</span>
                            )}
                          </button>
                        )}
                        {confirming && (
                          <button
                            type="button"
                            className="cv-mini-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmForget(null);
                            }}
                            title={t("connections.cancel")}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {hasPrompt && !n.connected && (
                    <div
                      className="cv-password cv-password-box"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="cv-password-field cv-input-wrap">
                        <input
                          ref={inputRef}
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            isWep
                              ? t("connections.passwordWep")
                              : isWpa3
                              ? t("connections.passwordWpa3")
                              : t("connections.password")
                          }
                          className="cv-password-input cv-input"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && isPassValid && !isBusy) {
                              handleWifiConnect(n.ssid, password);
                            } else if (e.key === "Escape") {
                              closePasswordPrompt();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="cv-password-eye cv-eye-btn"
                          tabIndex={-1}
                          onMouseDown={(e) => {
                            // Prevent eye button from stealing keyboard focus from input
                            e.preventDefault();
                          }}
                          onClick={() => {
                            setShowPassword((prev) => !prev);
                            inputRef.current?.focus();
                          }}
                          title={
                            showPassword
                              ? t("connections.hidePassword")
                              : t("connections.showPassword")
                          }
                          aria-label={
                            showPassword
                              ? t("connections.hidePassword")
                              : t("connections.showPassword")
                          }
                        >
                          {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div className="cv-password-actions cv-prompt-actions">
                        <button
                          type="button"
                          className="cv-mini-btn"
                          onClick={closePasswordPrompt}
                          title={t("connections.cancel")}
                        >
                          <X size={12} />
                        </button>
                        <button
                          type="button"
                          className="cv-password-submit cv-submit-btn"
                          disabled={!isPassValid || isBusy}
                          onClick={() => handleWifiConnect(n.ssid, password)}
                          title={t("connections.join")}
                        >
                          {isBusy ? (
                            <Loader2 size={12} className="cv-spin" />
                          ) : (
                            t("connections.join")
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          /* Bluetooth View: 3 Clear Groups */
          <>
            {/* Group 1: Connected Devices */}
            {connectedBt.length > 0 && (
              <>
                <div className="cv-group-header">
                  <span className="cv-group-title">
                    {t("connections.bluetooth.connectedGroup")}
                  </span>
                </div>
                {connectedBt.map((d) => renderBtDeviceRow(d))}
              </>
            )}

            {/* Group 2: Paired Devices */}
            {pairedBt.length > 0 && (
              <>
                <div className="cv-group-header">
                  <span className="cv-group-title">
                    {t("connections.bluetooth.pairedGroup")}
                  </span>
                </div>
                {pairedBt.map((d) => renderBtDeviceRow(d))}
              </>
            )}

            {connectedBt.length === 0 && pairedBt.length === 0 && !loading && (
              <div className="cv-empty">{t("connections.bluetooth.empty")}</div>
            )}

            {/* Group 3: Nearby Devices */}
            <div className="cv-group-header" style={{ marginTop: 8 }}>
              <span className="cv-group-title">
                <Radio size={11} />
                <span>{t("connections.bluetooth.nearbyGroup")}</span>
              </span>
              <button
                type="button"
                className={`cv-discovery-btn ${discovering ? "active" : ""}`}
                onClick={discovering ? handleStopDiscovery : handleStartDiscovery}
                disabled={Boolean(busyKey || pairingId)}
                title={
                  discovering
                    ? t("connections.stopDiscovery")
                    : t("connections.startDiscovery")
                }
              >
                {discovering ? (
                  <>
                    <Loader2 size={10} className="cv-spin" />
                    <span>{t("connections.stopDiscovery")}</span>
                  </>
                ) : (
                  <>
                    <Search size={10} />
                    <span>{t("connections.startDiscovery")}</span>
                  </>
                )}
              </button>
            </div>

            {discovering && nearbyBt.length === 0 && (
              <div
                className="cv-empty"
                style={{ fontStyle: "italic", opacity: 0.65 }}
              >
                <Loader2 size={13} className="cv-spin" style={{ marginRight: 6 }} />
                <span>{t("connections.searchingNearby")}</span>
              </div>
            )}

            {!discovering && nearbyBt.length === 0 && (
              <div className="cv-empty" style={{ opacity: 0.5 }}>
                {t("connections.noNearbyDevices")}
              </div>
            )}

            {nearbyBt.map((d) => {
              const isPairingThis = pairingId === d.id;
              return (
                <div key={d.id} className="cv-item">
                  <div className="cv-row-wrap">
                    <div className="cv-row static">
                      <Bluetooth size={14} className="cv-bt-icon" />
                      <span className="cv-row-main">
                        <span className="cv-row-name">{d.name}</span>
                        <span className="cv-row-sub">
                          {d.address ||
                            (d.device_kind === "ble"
                              ? "Bluetooth LE"
                              : "Bluetooth")}
                        </span>
                      </span>
                    </div>
                    <div className="cv-row-actions">
                      {isPairingThis ? (
                        <span
                          className="cv-action-pill pair"
                          style={{ pointerEvents: "none" }}
                        >
                          <Loader2 size={11} className="cv-spin" />
                          <span>{t("connections.pairing")}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="cv-action-pill pair"
                          onClick={() => handlePairDevice(d)}
                          disabled={Boolean(
                            pairingId ||
                              busyKey ||
                              (!d.can_pair && d.disabled_reason_code === "pairing_not_supported")
                          )}
                          title={getPairButtonTooltip(d)}
                        >
                          <span>{t("connections.pairBtn")}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

export { Wifi };
