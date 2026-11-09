import { describe, it, expect } from "bun:test";
import {
  FEEDBACK_ENDPOINT,
  FEEDBACK_REASONS,
  buildFeedbackUrl,
  getInstallerLanguage,
  FEEDBACK_I18N,
} from "../installer-app/src/lib/feedback";

describe("Uninstall Feedback - Endpoint & Template URL Construction", () => {
  it("targets the official Oryvia repository issues endpoint", () => {
    expect(FEEDBACK_ENDPOINT).toBe("https://github.com/panchi146/Oryvia/issues/new");
  });

  it("builds a correct URL with reason and version when comment is empty", () => {
    const urlStr = buildFeedbackUrl("Found a bug", "", "1.0.0");
    const parsed = new URL(urlStr);

    expect(parsed.origin).toBe("https://github.com");
    expect(parsed.pathname).toBe("/panchi146/Oryvia/issues/new");
    expect(parsed.searchParams.get("template")).toBe("uninstall_feedback.yml");
    expect(parsed.searchParams.get("title")).toBe("Uninstall feedback: Found a bug");
    expect(parsed.searchParams.get("reason")).toBe("Found a bug");
    expect(parsed.searchParams.get("version")).toBe("1.0.0");
    // Empty comment should not be in query params
    expect(parsed.searchParams.has("comment")).toBe(false);
  });

  it("builds a correct URL when comment has whitespace only", () => {
    const urlStr = buildFeedbackUrl("Found a bug", "   \t\n  ", "1.0.0");
    const parsed = new URL(urlStr);
    expect(parsed.searchParams.has("comment")).toBe(false);
  });

  it("handles unknown or empty app version with fallback", () => {
    const urlStr = buildFeedbackUrl("Other", "Test comment", "");
    const parsed = new URL(urlStr);
    expect(parsed.searchParams.get("version")).toBe("unknown");
    expect(parsed.searchParams.get("comment")).toBe("Test comment");
  });

  it("properly encodes Unicode Vietnamese and URL-breaking characters (&, ?, #, newlines)", () => {
    const complexReason = "Gặp lỗi phần mềm";
    const complexComment = "Lỗi âm thanh & visualizer bị đơ khi chuyển bài?\nChi tiết #1: thử nghiệm với bài hát tiếng Việt: 100% không chạy.";
    const urlStr = buildFeedbackUrl(complexReason, complexComment, "1.0.0");

    // Must be a valid URL string that can be parsed
    const parsed = new URL(urlStr);
    expect(parsed.searchParams.get("reason")).toBe(complexReason);
    expect(parsed.searchParams.get("title")).toBe(`Uninstall feedback: ${complexReason}`);
    expect(parsed.searchParams.get("comment")).toBe(complexComment);

    // Verify raw query string properly percent-encodes &, ?, #, and newlines
    const rawQuery = parsed.search;
    expect(rawQuery).toContain("G%E1%BA%B7p+l%E1%BB%97i+ph%E1%BA%A7n+m%E1%BB%81m");
    // %26 is &, %3F is ?, %23 is #, %0A is newline
    expect(rawQuery).toContain("%26");
    expect(rawQuery).toContain("%3F");
    expect(rawQuery).toContain("%23");
    expect(rawQuery).toContain("%0A");
    // Raw '&' as param value or raw '#' must not appear unencoded within values
    expect(rawQuery).not.toContain("& visualizer");
    expect(rawQuery).not.toContain("#1");
  });

  it("includes all predefined feedback reasons with English and Vietnamese labels", () => {
    expect(FEEDBACK_REASONS.length).toBe(4);
    const ids = FEEDBACK_REASONS.map((r) => r.id);
    expect(ids).toContain("Found a bug");
    expect(ids).toContain("Missing a feature I need");
    expect(ids).toContain("Switching to something else");
    expect(ids).toContain("Other");

    for (const r of FEEDBACK_REASONS) {
      expect(r.labelEn.length).toBeGreaterThan(0);
      expect(r.labelVi.length).toBeGreaterThan(0);
    }
  });
});

describe("Uninstall Feedback - State Transitions and In-Flight / Retry Logic (Simulated)", () => {
  type FeedbackState = {
    feedbackReason: string | null;
    feedbackComment: string;
    feedbackBrowserOpened: boolean;
    feedbackInFlight: boolean;
    feedbackError: string | null;
  };

  const createInitialState = (): FeedbackState => ({
    feedbackReason: null,
    feedbackComment: "",
    feedbackBrowserOpened: false,
    feedbackInFlight: false,
    feedbackError: null,
  });

  const sendFeedbackSimulator = async (
    state: FeedbackState,
    mockOpenUrl: (url: string) => Promise<void>,
    tFeedback: typeof FEEDBACK_I18N["en"]
  ) => {
    if (!state.feedbackReason || !FEEDBACK_ENDPOINT || state.feedbackInFlight) {
      return state;
    }
    state.feedbackInFlight = true;
    state.feedbackError = null;
    const url = buildFeedbackUrl(state.feedbackReason, state.feedbackComment, "1.0.0");
    try {
      await mockOpenUrl(url);
      state.feedbackBrowserOpened = true;
    } catch (err) {
      state.feedbackError = tFeedback.openError;
    } finally {
      state.feedbackInFlight = false;
    }
    return state;
  };

  it("does nothing when reason is not selected", async () => {
    const state = createInitialState();
    let openedUrl = "";
    await sendFeedbackSimulator(
      state,
      async (u) => { openedUrl = u; },
      FEEDBACK_I18N.en
    );
    expect(openedUrl).toBe("");
    expect(state.feedbackInFlight).toBe(false);
    expect(state.feedbackBrowserOpened).toBe(false);
  });

  it("transitions to browser opened on successful openUrl without claiming feedback was submitted", async () => {
    const state = createInitialState();
    state.feedbackReason = "Found a bug";
    state.feedbackComment = "Crashes on startup";

    let openedUrl = "";
    await sendFeedbackSimulator(
      state,
      async (u) => { openedUrl = u; },
      FEEDBACK_I18N.en
    );

    expect(openedUrl).toContain("Found+a+bug");
    expect(state.feedbackInFlight).toBe(false);
    expect(state.feedbackBrowserOpened).toBe(true);
    expect(state.feedbackError).toBeNull();
    // Copy asserts that browser opened, not that feedback was received/sent
    expect(FEEDBACK_I18N.en.browserOpenedDesc).toContain("opened in your browser");
    expect(FEEDBACK_I18N.en.browserOpenedDesc).not.toContain("has been sent");
    expect(FEEDBACK_I18N.vi.browserOpenedDesc).toContain("đã mở trong trình duyệt");
  });

  it("handles openUrl failure gracefully, preserves reason/comment, exposes error, and allows retry", async () => {
    const state = createInitialState();
    state.feedbackReason = "Other";
    state.feedbackComment = "Keep my inputs safe";

    // First attempt fails (e.g. ShellExecute error)
    await sendFeedbackSimulator(
      state,
      async () => { throw new Error("ShellExecute failed"); },
      FEEDBACK_I18N.en
    );

    expect(state.feedbackInFlight).toBe(false);
    expect(state.feedbackBrowserOpened).toBe(false);
    expect(state.feedbackReason).toBe("Other");
    expect(state.feedbackComment).toBe("Keep my inputs safe");
    expect(state.feedbackError).toBe(FEEDBACK_I18N.en.openError);

    // Second attempt succeeds (retry)
    let openedUrl = "";
    await sendFeedbackSimulator(
      state,
      async (u) => { openedUrl = u; },
      FEEDBACK_I18N.en
    );

    expect(openedUrl).toContain("Keep+my+inputs+safe");
    expect(state.feedbackInFlight).toBe(false);
    expect(state.feedbackBrowserOpened).toBe(true);
    expect(state.feedbackError).toBeNull();
  });

  it("prevents double-triggering when in flight", async () => {
    const state = createInitialState();
    state.feedbackReason = "Found a bug";

    let calls = 0;
    const slowMock = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
    };

    const first = sendFeedbackSimulator(state, slowMock, FEEDBACK_I18N.en);
    // Second concurrent call while first is in flight
    const second = sendFeedbackSimulator(state, slowMock, FEEDBACK_I18N.en);

    await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(state.feedbackBrowserOpened).toBe(true);
  });
});
