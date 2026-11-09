export const FEEDBACK_ENDPOINT = "https://github.com/panchi146/Oryvia/issues/new";

export interface FeedbackReasonOption {
  id: string;
  labelEn: string;
  labelVi: string;
}

export const FEEDBACK_REASONS: FeedbackReasonOption[] = [
  { id: "Found a bug", labelEn: "Found a bug", labelVi: "Gặp lỗi phần mềm" },
  { id: "Missing a feature I need", labelEn: "Missing a feature I need", labelVi: "Thiếu tính năng tôi cần" },
  { id: "Switching to something else", labelEn: "Switching to something else", labelVi: "Chuyển sang ứng dụng khác" },
  { id: "Other", labelEn: "Other", labelVi: "Lý do khác" },
];

/**
 * Builds a valid GitHub new-issue URL prefilling the uninstall feedback template.
 * Uses URLSearchParams to correctly encode spaces, Unicode Vietnamese,
 * and URL-breaking characters (&, ?, #, \n).
 */
export function buildFeedbackUrl(
  reason: string,
  comment: string,
  appVersion: string,
  endpoint: string = FEEDBACK_ENDPOINT
): string {
  const params = new URLSearchParams();
  params.set("template", "uninstall_feedback.yml");
  params.set("title", `Uninstall feedback: ${reason}`);
  params.set("reason", reason);
  const trimmedComment = comment.trim();
  if (trimmedComment) {
    params.set("comment", trimmedComment);
  }
  params.set("version", appVersion || "unknown");
  return `${endpoint}?${params.toString()}`;
}

export function getInstallerLanguage(): "vi" | "en" {
  if (typeof navigator !== "undefined" && navigator.language) {
    if (navigator.language.toLowerCase().startsWith("vi")) {
      return "vi";
    }
  }
  return "en";
}

export const FEEDBACK_I18N = {
  en: {
    prompt: "Mind telling us why? Totally optional.",
    placeholder: "Anything else you'd like to add? (optional)",
    note: "Clicking \"Send feedback\" opens a pre-filled GitHub issue in your browser — you'll see exactly what's submitted before it sends. Nothing is sent automatically.",
    sendBtn: "Send feedback",
    sendingBtn: "Opening browser...",
    skipBtn: "Skip",
    closeBtn: "Close",
    retryBtn: "Try again",
    browserOpenedTitle: "GitHub issue opened in your browser",
    browserOpenedDesc: "A pre-filled issue was opened in your browser. Review the details and click \"Submit new issue\" to send it.",
    openError: "Could not open browser. Please try again or open GitHub directly.",
  },
  vi: {
    prompt: "Bạn có thể cho chúng tôi biết lý do? Hoàn toàn tùy chọn.",
    placeholder: "Bạn có muốn góp ý thêm điều gì không? (tùy chọn)",
    note: "Bấm \"Gửi phản hồi\" sẽ mở trang tạo issue với nội dung điền sẵn trong trình duyệt của bạn — bạn sẽ thấy rõ nội dung trước khi gửi. Không có gì được gửi tự động.",
    sendBtn: "Gửi phản hồi",
    sendingBtn: "Đang mở trình duyệt...",
    skipBtn: "Bỏ qua",
    closeBtn: "Đóng",
    retryBtn: "Thử lại",
    browserOpenedTitle: "Trang góp ý đã được mở trong trình duyệt",
    browserOpenedDesc: "Trang tạo issue với nội dung điền sẵn đã mở trong trình duyệt. Vui lòng xem lại và bấm \"Submit new issue\" trên GitHub để gửi.",
    openError: "Không thể mở trình duyệt. Vui lòng thử lại hoặc mở GitHub trực tiếp.",
  },
} as const;
