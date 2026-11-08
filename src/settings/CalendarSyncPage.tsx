import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CalendarDays, ChevronLeft, CloudCog, Link2, Plus, RefreshCw, Timer, Trash2, Unplug } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Dropdown } from "./Dropdown";
import { useCaldav } from "../hooks/useCaldav";

import { useI18n } from "../i18n";

function formatAgo(ms: number | null, t: (k: string, p?: any) => string): string {
  if (!ms) return t("common.never");
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return t("common.justNow");
  if (mins < 60) return t("common.minAgo", { n: mins });
  const hours = Math.round(mins / 60);
  return hours < 24 ? t("common.hoursAgo", { n: hours }) : t("common.daysAgo", { n: Math.round(hours / 24) });
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Calendar",
  icloud: "iCloud",
  outlook: "Outlook",
  proton: "Proton Calendar",
  fastmail: "Fastmail",
  nextcloud: "Nextcloud",
  other: "Calendar link",
};

interface Guide {
  id: string;
  label: string;
  steps: string[];
  note: string;
}

type Provider = "nextcloud" | "icloud" | "other";

const ICLOUD_URL = "https://caldav.icloud.com";

const GUIDES_DATA: Record<"en" | "vi", Guide[]> = {
  en: [
    {
      id: "google",
      label: "Google",
      steps: [
        "Open Google Calendar on the web (calendar.google.com).",
        "Hover the calendar in the left list, click the three-dot menu, then Settings and sharing.",
        "Scroll to Integrate calendar and copy the Secret address in iCal format.",
      ],
      note: "Anyone with this address can read the calendar, so keep it private. Repeat for each calendar you want. If the option is missing, your Google Workspace admin may have turned it off.",
    },
    {
      id: "icloud",
      label: "iCloud",
      steps: [
        "Open Calendar on icloud.com and sign in.",
        "Click the second button from the bottom right of the window.",
        "Click the info (i) icon next to the calendar you want.",
        "Tick Public Calendar, then copy the link that appears.",
      ],
      note: "The link starts with webcal://. Paste it as it is. Only that one calendar becomes readable to anyone holding the link, and unticking Public Calendar stops sharing it.",
    },
    {
      id: "outlook",
      label: "Outlook",
      steps: [
        "In Outlook on the web, open Calendar and click the gear icon for Settings.",
        "Go to Calendar, then Shared calendars.",
        "Under Publish a calendar, pick the calendar and choose Can view all details.",
        "Click Publish. Two links appear: copy the ICS link (it ends in .ics), not the HTML one.",
      ],
      note: "Work or school accounts often have publishing turned off by an admin. Without Can view all details, events would show without their titles.",
    },
    {
      id: "proton",
      label: "Proton",
      steps: [
        "Open Proton Calendar on the web (calendar.proton.me).",
        "Go to Settings, All settings, Calendars, and choose the calendar.",
        "Under Share with anyone, click Create link and pick Full view.",
        "Click Copy link.",
      ],
      note: "Limited view only shows busy blocks with no titles. Anyone with the link can see the calendar, and you can delete the link from its Actions menu to cut off access.",
    },
    {
      id: "nextcloud",
      label: "Nextcloud",
      steps: [
        "Open the Calendar app in Nextcloud.",
        "Click the share icon next to a calendar, then the + next to Share link.",
        "Copy the link and paste it here. Oryvia converts it to the calendar feed for you.",
      ],
      note: "To read your own private calendars without a public link, use the CalDAV account option further down instead.",
    },
    {
      id: "other",
      label: "Other",
      steps: [
        "Find the calendar's iCal or ICS subscription address in its sharing or export settings.",
        "Paste any link that ends in .ics or starts with webcal://.",
      ],
      note: "This covers holidays, sports fixtures, school timetables, Fastmail and more. If the link opens a web page instead of downloading a file, it isn't the right one.",
    },
  ],
  vi: [
    {
      id: "google",
      label: "Google",
      steps: [
        "Mở Google Calendar trên trình duyệt web (calendar.google.com).",
        "Rê chuột vào lịch ở danh sách bên trái, nhấp vào dấu 3 chấm, chọn 'Cài đặt và chia sẻ'.",
        "Cuộn xuống mục 'Tích hợp lịch' và sao chép 'Địa chỉ bí mật ở định dạng iCal'.",
      ],
      note: "Bất kỳ ai có liên kết này đều có thể xem lịch, hãy giữ bí mật. Lặp lại với từng lịch bạn muốn hiển thị. Nếu không thấy mục này, quản trị viên Google Workspace có thể đã tắt chia sẻ.",
    },
    {
      id: "icloud",
      label: "iCloud",
      steps: [
        "Mở Lịch trên icloud.com và đăng nhập.",
        "Nhấp vào biểu tượng chia sẻ bên cạnh lịch bạn muốn xem.",
        "Bật 'Lịch công khai', sau đó sao chép liên kết xuất hiện.",
      ],
      note: "Liên kết bắt đầu bằng webcal://. Dán nguyên liên kết vào đây. Chỉ duy nhất lịch này được chia sẻ và bạn có thể tắt bất cứ lúc nào.",
    },
    {
      id: "outlook",
      label: "Outlook",
      steps: [
        "Trên Outlook web, mở Lịch và nhấp vào biểu tượng bánh răng Cài đặt.",
        "Vào mục Lịch › Lịch dùng chung.",
        "Tại mục 'Xuất bản lịch', chọn lịch và chọn 'Có thể xem tất cả chi tiết'.",
        "Nhấp Xuất bản. Sao chép liên kết ICS (đuôi .ics), không phải liên kết HTML.",
      ],
      note: "Tài khoản cơ quan hoặc trường học có thể bị quản trị viên chặn xuất bản lịch. Nếu không chọn 'Có thể xem tất cả chi tiết', sự kiện sẽ không có tiêu đề.",
    },
    {
      id: "proton",
      label: "Proton",
      steps: [
        "Mở Proton Calendar trên web (calendar.proton.me).",
        "Vào Cài đặt › Tất cả cài đặt › Lịch và chọn lịch cần chia sẻ.",
        "Dưới mục 'Chia sẻ với mọi người', nhấp 'Tạo liên kết' và chọn 'Xem đầy đủ'.",
        "Nhấp 'Sao chép liên kết'.",
      ],
      note: "Chế độ xem giới hạn chỉ hiển thị khung giờ bận mà không có tiêu đề. Bạn có thể xóa liên kết trong menu Thao tác để ngừng chia sẻ bất kỳ lúc nào.",
    },
    {
      id: "nextcloud",
      label: "Nextcloud",
      steps: [
        "Mở ứng dụng Lịch trong Nextcloud.",
        "Nhấp vào biểu tượng chia sẻ cạnh lịch, sau đó bấm dấu + cạnh 'Chia sẻ liên kết'.",
        "Sao chép liên kết và dán vào đây. Oryvia sẽ tự động nhận diện nguồn lịch.",
      ],
      note: "Để đồng bộ trực tiếp lịch cá nhân mà không cần tạo link công khai, hãy dùng tùy chọn Tài khoản CalDAV ở phần bên dưới.",
    },
    {
      id: "other",
      label: "Khác",
      steps: [
        "Tìm địa chỉ đăng ký iCal hoặc ICS trong phần chia sẻ/xuất lịch của dịch vụ bạn dùng.",
        "Dán bất kỳ liên kết nào có đuôi .ics hoặc bắt đầu bằng webcal://.",
      ],
      note: "Hỗ trợ lịch ngày lễ, thể thao, thời khóa biểu, Fastmail và nhiều nguồn khác. Liên kết đúng sẽ tải về tệp lịch chứ không mở ra trang web.",
    },
  ],
};

const ACCOUNT_PROVIDERS_DATA: Record<"en" | "vi", Record<Provider, { label: string; urlPlaceholder: string; userPlaceholder: string; hint: string }>> = {
  en: {
    nextcloud: {
      label: "Nextcloud",
      urlPlaceholder: "Server address, e.g. cloud.example.com",
      userPlaceholder: "Username",
      hint: "Create an app password in Nextcloud under Settings › Security › Devices & sessions.",
    },
    icloud: {
      label: "iCloud",
      urlPlaceholder: "",
      userPlaceholder: "Apple ID email",
      hint: "Apple doesn't allow your real password here. Create an app-specific password at account.apple.com under Sign-In and Security › App-Specific Passwords.",
    },
    other: {
      label: "Other CalDAV",
      urlPlaceholder: "CalDAV server address",
      userPlaceholder: "Username",
      hint: "Fastmail, Synology, Radicale, Baikal and most other CalDAV servers work. Use an app password if the service offers one.",
    },
  },
  vi: {
    nextcloud: {
      label: "Nextcloud",
      urlPlaceholder: "Địa chỉ máy chủ, ví dụ: cloud.example.com",
      userPlaceholder: "Tên người dùng",
      hint: "Tạo mật khẩu ứng dụng trong Nextcloud tại Cài đặt › Bảo mật › Thiết bị & phiên đăng nhập.",
    },
    icloud: {
      label: "iCloud",
      urlPlaceholder: "",
      userPlaceholder: "Email tài khoản Apple ID",
      hint: "Apple yêu cầu sử dụng Mật khẩu dành riêng cho ứng dụng. Tạo tại account.apple.com mục Đăng nhập và bảo mật › Mật khẩu dành riêng cho ứng dụng.",
    },
    other: {
      label: "CalDAV khác",
      urlPlaceholder: "Địa chỉ máy chủ CalDAV",
      userPlaceholder: "Tên người dùng",
      hint: "Hỗ trợ Fastmail, Synology, Radicale, Baikal và hầu hết các máy chủ CalDAV. Khuyên dùng mật khẩu ứng dụng nếu dịch vụ có hỗ trợ.",
    },
  },
};

interface Detection {
  provider: string;
  label: string;
  problem: string | null;
}

export function CalendarSyncPage({ onBack }: { onBack: () => void }) {
  const state = useCaldav();
  const [interval, setIntervalValue] = useState("15");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [guideId, setGuideId] = useState<string | null>(null);

  const [provider, setProvider] = useState<Provider>("nextcloud");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    invoke<Record<string, string>>("load_settings")
      .then((s) => {
        const savedUrl = s["nectar-caldav-url"] ?? "";
        setUrl(savedUrl);
        if (savedUrl.includes("icloud.com")) setProvider("icloud");
        setUsername(s["nectar-caldav-username"] ?? "");
        setIntervalValue(s["nectar-caldav-interval"] ?? "15");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!linkUrl.trim()) {
      setDetection(null);
      return;
    }
    let alive = true;
    invoke<Detection | null>("ics_detect", { url: linkUrl })
      .then((d) => alive && setDetection(d))
      .catch(() => alive && setDetection(null));
    return () => {
      alive = false;
    };
  }, [linkUrl]);

  const run = async (id: string, command: string, args?: Record<string, unknown>, onOk?: () => void) => {
    setBusy(id);
    setMessage(null);
    try {
      await invoke(command, args);
      onOk?.();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(null);
    }
  };

  const changeInterval = (minutes: string) => {
    setIntervalValue(minutes);
    invoke("save_setting", { key: "nectar-caldav-interval", value: minutes }).catch(() => {});
  };

  const { language, t } = useI18n();

  const guides = GUIDES_DATA[language === "vi" ? "vi" : "en"];
  const accountProviders = ACCOUNT_PROVIDERS_DATA[language === "vi" ? "vi" : "en"];

  const pickProvider = (next: Provider) => {
    setProvider(next);
    setMessage(null);
    if (next === "icloud") setUrl(ICLOUD_URL);
    else if (url === ICLOUD_URL) setUrl("");
  };

  const sources = (state.account ? 1 : 0) + state.links.length;
  const status = sources
    ? t("settings.caldav.status", {
        sources,
        events: state.events.length,
        time: formatAgo(state.syncedAt, t),
      })
    : t("settings.notch.syncSources.descDisconnected");

  const account = accountProviders[provider];
  const activeGuide =
    guides.find((g) => g.id === (guideId ?? detection?.provider)) ?? guides[guides.length - 1];

  return (
    <>
      <div className="caldav-page-header">
        <button className="caldav-back" onClick={onBack}>
          <ChevronLeft size={14} /> {t("settings.caldav.back")}
        </button>
        <div className="caldav-actions">
          {sources > 0 && (
            <button className="caldav-btn" onClick={() => invoke("open_calendar_window").catch(() => {})}>
              <CalendarDays size={11} /> {t("dock.menu.openCalendar")}
            </button>
          )}
          {sources > 0 && (
            <button className="caldav-btn" disabled={busy !== null} onClick={() => run("sync", "caldav_sync_now")}>
              <RefreshCw size={11} /> {busy === "sync" ? t("settings.caldav.syncing") : t("settings.caldav.syncNow")}
            </button>
          )}
        </div>
      </div>

      <div className="setting-group-label">{t("settings.caldav.title")}</div>
      <div className="setting-group">
        <SettingRow
          icon={Timer}
          label={t("settings.caldav.syncInterval")}
          desc={status}
          divider={false}
        >
          <Dropdown
            value={interval}
            onChange={changeInterval}
            options={[
              { value: "5", label: t("settings.caldav.interval.5m") },
              { value: "15", label: t("settings.caldav.interval.15m") },
              { value: "30", label: t("settings.caldav.interval.30m") },
              { value: "60", label: t("settings.caldav.interval.1h") },
            ]}
          />
        </SettingRow>
      </div>

      {message && <div className="caldav-error caldav-error--page">{message}</div>}

      <div className="setting-group-label setting-group-label--spaced">{t("settings.caldav.group.links")}</div>
      <div className="setting-group">
        <div className="caldav-intro">
          {t("settings.caldav.intro")}
        </div>

        {state.links.map((link) => (
          <div key={link.id}>
            <SettingRow
              icon={Link2}
              label={link.name}
              desc={t("settings.caldav.linkItemDesc", {
                provider: PROVIDER_LABELS[link.provider] ?? (language === "vi" ? "Liên kết lịch" : "Calendar link"),
                events: link.events,
                time: formatAgo(link.syncedAt, t),
              })}
            >
              <button
                className="caldav-btn danger"
                disabled={busy !== null}
                onClick={() => run(`rm-${link.id}`, "ics_remove_link", { id: link.id })}
              >
                <Trash2 size={11} /> {t("common.remove")}
              </button>
            </SettingRow>
            {link.error && <div className="caldav-error">{link.error}</div>}
          </div>
        ))}

        <div className="caldav-form">
          <input
            type="text"
            placeholder={t("settings.caldav.pasteHint")}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            spellCheck={false}
          />
          {detection && (
            <div className={`caldav-detect ${detection.problem ? "bad" : "good"}`}>
              {detection.problem ?? t("settings.caldav.recognized", { label: detection.label })}
            </div>
          )}
          <input
            type="text"
            placeholder={t("settings.caldav.feedName")}
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            autoComplete="off"
          />
          <div className="caldav-form-footer">
            <button className="caldav-link-btn" onClick={() => setShowGuide((v) => !v)}>
              {showGuide ? t("common.close") : t("settings.caldav.guideBtn")}
            </button>
            <button
              className="caldav-btn primary"
              disabled={busy !== null || !linkUrl.trim() || !!detection?.problem}
              onClick={() =>
                run("add", "ics_add_link", { url: linkUrl, name: linkName }, () => {
                  setLinkUrl("");
                  setLinkName("");
                })
              }
            >
              <Plus size={11} /> {busy === "add" ? t("common.loading") : t("settings.caldav.addLink")}
            </button>
          </div>
        </div>

        {showGuide && (
          <div className="caldav-guide">
            <div className="caldav-chips">
              {guides.map((g) => (
                <button key={g.id} className={g.id === activeGuide.id ? "active" : ""} onClick={() => setGuideId(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
            <ol>
              {activeGuide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>{activeGuide.note}</p>
          </div>
        )}
      </div>

      <div className="setting-group-label setting-group-label--spaced">{t("settings.caldav.group.caldav")}</div>
      <div className="setting-group">
        <SettingRow
          icon={CloudCog}
          label={t("settings.caldav.group.caldav")}
          desc={
            state.account
              ? t("settings.caldav.accountDesc", {
                  calendars: state.account.calendars,
                  events: state.account.events,
                  time: formatAgo(state.account.syncedAt, t),
                })
              : t("settings.notch.syncSources.descDisconnected")
          }
          divider={!state.account}
        >
          {state.account && (
            <button className="caldav-btn danger" disabled={busy !== null} onClick={() => run("disconnect", "caldav_disconnect")}>
              <Unplug size={11} /> {t("settings.caldav.disconnect")}
            </button>
          )}
        </SettingRow>
        {state.account?.error && <div className="caldav-error">{state.account.error}</div>}

        {!state.account && (
          <div className="caldav-form">
            <div className="unit-toggle-minimal wide caldav-providers">
              {(Object.keys(accountProviders) as Provider[]).map((key) => (
                <span key={key} className={provider === key ? "active" : ""} onClick={() => pickProvider(key)}>
                  {accountProviders[key].label}
                </span>
              ))}
            </div>
            {provider !== "icloud" && (
              <input
                type="text"
                placeholder={t("settings.caldav.serverUrl")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                spellCheck={false}
              />
            )}
            <input
              type="text"
              placeholder={t("settings.caldav.username")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <input
              type="password"
              placeholder={t("settings.caldav.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            <div className="caldav-form-footer">
              <span className="caldav-hint">
                {account.hint}
              </span>
              <button
                className="caldav-btn primary"
                disabled={busy !== null || !url.trim() || !username.trim() || !password}
                onClick={() => run("connect", "caldav_connect", { url, username, password }, () => setPassword(""))}
              >
                <Link2 size={11} /> {busy === "connect" ? t("common.loading") : t("settings.caldav.connect")}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
