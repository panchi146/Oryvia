import { useSyncExternalStore, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { translations, type Language, type TranslationKey } from "./translations";

export type { Language, TranslationKey };

const LANGUAGE_KEY = "nectar-language";

// Singleton in-memory state: initialized once per webview window
let currentLanguage: Language = (() => {
  try {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved === "vi" || saved === "en") return saved;
    }
  } catch {}
  return "en";
})();

const subscribers = new Set<() => void>();
let isGlobalSyncInitialized = false;

function notifySubscribers() {
  subscribers.forEach((callback) => {
    try {
      callback();
    } catch (e) {
      console.error("[i18n] subscriber error:", e);
    }
  });
}

export function updateLanguage(newLang: Language, shouldSave = false) {
  if (newLang !== "vi" && newLang !== "en") return;
  if (newLang === currentLanguage) return;

  currentLanguage = newLang;
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LANGUAGE_KEY, newLang);
    }
  } catch {}

  if (shouldSave) {
    invoke("save_setting", { key: LANGUAGE_KEY, value: newLang }).catch(console.error);
  }

  notifySubscribers();
}

/**
 * Initializes cross-window synchronization EXACTLY ONCE per window.
 * Eliminates all IPC overhead when mounting/unmounting components.
 */
function initGlobalI18nSync() {
  if (isGlobalSyncInitialized || typeof window === "undefined") return;
  isGlobalSyncInitialized = true;

  // Listen for storage events (instant cross-window notification in WebView2)
  window.addEventListener("storage", (event) => {
    if (event.key === LANGUAGE_KEY) {
      const val = event.newValue;
      if (val === "vi" || val === "en") {
        updateLanguage(val, false);
      }
    }
  });

  // Listen for Tauri settings-changed event (emitted by save_setting in Rust)
  listen<{ key: string; value: any }>("settings-changed", (event) => {
    const { key, value } = event.payload || {};
    if (key === LANGUAGE_KEY && (value === "vi" || value === "en")) {
      updateLanguage(value, false);
    }
  }).catch(() => {});

  // Listen for external file changes (e.g. settings file edited outside)
  listen<{ key: string; value: any }>("settings-external-changed", (event) => {
    const { key, value } = event.payload || {};
    if (key === LANGUAGE_KEY && (value === "vi" || value === "en")) {
      updateLanguage(value, false);
    }
  }).catch(() => {});

  // Fallback initial load once on startup if localStorage was empty
  try {
    if (!localStorage.getItem(LANGUAGE_KEY)) {
      invoke<Record<string, any>>("load_settings")
        .then((settings) => {
          const val = settings?.[LANGUAGE_KEY];
          if (val === "vi" || val === "en") {
            updateLanguage(val, false);
          }
        })
        .catch(() => {});
    }
  } catch {}
}

function subscribe(callback: () => void) {
  initGlobalI18nSync();
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function getSnapshot(): Language {
  return currentLanguage;
}

export function translate(
  lang: Language,
  key: TranslationKey | string,
  params?: Record<string, string | number>
): string {
  const dict = translations[lang] || translations.en;
  let text: string = (dict as Record<string, string>)[key] ?? (translations.en as Record<string, string>)[key] ?? key;

  if (params) {
    let resolvedParams = params;
    if (resolvedParams.n !== undefined && resolvedParams.s === undefined) {
      const nVal = Number(resolvedParams.n);
      resolvedParams = { ...resolvedParams, s: nVal === 1 ? "" : "s" };
    }
    for (const [k, v] of Object.entries(resolvedParams)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

export function getStoredLanguage(): Language {
  return currentLanguage;
}

export function setStoredLanguage(lang: Language) {
  updateLanguage(lang, true);
}

/**
 * High-performance, zero-IPC React hook for i18n.
 * Uses React 18's useSyncExternalStore.
 * Mounts and unmounts in 0ms with zero Tauri IPC calls.
 */
export function useI18n() {
  const language = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const changeLanguage = useCallback((newLang: Language) => {
    updateLanguage(newLang, true);
  }, []);

  const t = useCallback(
    (key: TranslationKey | string, params?: Record<string, string | number>): string => {
      return translate(language, key, params);
    },
    [language]
  );

  return { language, setLanguage: changeLanguage, t };
}
