import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, X, FolderOpen, CheckCircle2, AlertTriangle, MessageSquareText } from "lucide-react";
import {
  type InitialState,
  type ProgressPayload,
  getInitialState,
  pickInstallDir,
  needsElevation,
  relaunchElevated,
  startInstall,
  launchApp,
  openInstallFolder,
  startUninstall,
  openUrl,
  minimizeWindow,
  closeWindow,
  onInstallProgress,
  onUninstallProgress,
} from "./lib/api";
import {
  FEEDBACK_ENDPOINT,
  FEEDBACK_REASONS,
  buildFeedbackUrl,
  getInstallerLanguage,
  FEEDBACK_I18N,
} from "./lib/feedback";

type Screen =
  | "loading"
  | "welcome"
  | "options"
  | "installing"
  | "finish"
  | "uninstall-confirm"
  | "uninstalling"
  | "uninstall-done"
  | "error";

const screenVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

function TitleBar({ title }: { title: string }) {
  return (
    <div className="title-bar" data-tauri-drag-region>
      <span className="title-text" data-tauri-drag-region>{title}</span>
      <div className="title-bar-buttons">
        <button className="chrome-btn" onClick={() => minimizeWindow()} title="Minimize">
          <Minus size={13} strokeWidth={1.75} />
        </button>
        <button className="chrome-btn chrome-btn-close" onClick={() => closeWindow()} title="Close">
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function Background() {
  return (
    <div className="bg-blobs" aria-hidden>
      <div className="blob blob-a" />
    </div>
  );
}

function Logo({ size = 64, idle = false }: { size?: number; idle?: boolean }) {
  return (
    <motion.div
      className={`logo-glow ${idle ? "logo-idle" : ""}`}
      style={{ width: size, height: size }}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
    >
      <img src="/oryvia.png" alt="Oryvia" width={size * 0.55} height={size * 0.55} />
    </motion.div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="progress-track">
      <motion.div
        className="progress-fill"
        animate={{ width: `${Math.round(percent * 100)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      >
        <div className="progress-shimmer" />
      </motion.div>
    </div>
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <motion.button
      whileHover={{ scale: 1.025 }}
      whileTap={{ scale: 0.97 }}
      className={`btn btn-primary ${className}`}
      {...(rest as any)}
    />
  );
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <motion.button
      whileHover={{ scale: 1.025 }}
      whileTap={{ scale: 0.97 }}
      className={`btn btn-secondary ${className}`}
      {...(rest as any)}
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <span
        className={`toggle-track ${checked ? "on" : ""}`}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
      >
        <motion.span
          className="toggle-thumb"
          animate={{ x: checked ? 16 : 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
        />
      </span>
    </label>
  );
}

export default function App() {
  const lang = getInstallerLanguage();
  const tFeedback = FEEDBACK_I18N[lang];
  const [screen, setScreen] = useState<Screen>("loading");
  const [state, setState] = useState<InitialState | null>(null);
  const [installDir, setInstallDir] = useState("");
  const [allUsers, setAllUsers] = useState(false);
  const [desktopShortcut, setDesktopShortcut] = useState(true);
  const [dirTouched, setDirTouched] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload>({ stage: "", percent: 0, message: "" });
  const [exePath, setExePath] = useState("");
  const [launchNow, setLaunchNow] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [feedbackReason, setFeedbackReason] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackBrowserOpened, setFeedbackBrowserOpened] = useState(false);
  const [feedbackInFlight, setFeedbackInFlight] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    getInitialState().then((s) => {
      setState(s);
      if (s.uninstallMode) {
        if (s.autoUninstall) {
          handleConfirmUninstall();
        } else {
          setScreen("uninstall-confirm");
        }
        return;
      }
      const dir = s.prefillInstallDir ?? s.defaultInstallDirUser;
      setInstallDir(dir);
      setAllUsers(s.prefillAllUsers);
      setDesktopShortcut(s.prefillDesktopShortcut);
      if (s.autoInstall && !autoStarted.current) {
        autoStarted.current = true;
        setScreen("installing");
        runInstall(dir, s.prefillAllUsers, s.prefillDesktopShortcut);
      } else {
        setScreen("welcome");
      }
    }).catch((e) => {
      setErrorMsg(String(e));
      setScreen("error");
    });
  }, []);

  const handleToggleAllUsers = (next: boolean) => {
    setAllUsers(next);
    if (!dirTouched && state) {
      setInstallDir(next ? state.defaultInstallDirAllUsers : state.defaultInstallDirUser);
    }
  };

  const handleBrowse = async () => {
    const picked = await pickInstallDir(installDir).catch(() => null);
    if (picked) {
      setInstallDir(picked);
      setDirTouched(true);
    }
  };

  const runInstall = async (dir: string, forAllUsers: boolean, withDesktopShortcut: boolean) => {
    const unlisten = await onInstallProgress((p) => setProgress(p));
    try {
      const exe = await startInstall(dir, forAllUsers, withDesktopShortcut);
      setExePath(exe);
      setScreen("finish");
    } catch (err) {
      setErrorMsg(String(err));
      setScreen("error");
    } finally {
      unlisten();
    }
  };

  const handleInstallClick = async () => {
    if (allUsers) {
      const elevationNeeded = await needsElevation(true).catch(() => false);
      if (elevationNeeded) {
        try {
          await relaunchElevated(installDir, allUsers, desktopShortcut);
        } catch (err) {
          setErrorMsg("Admin permission was not granted, so an all-users install can't continue.");
          setScreen("error");
        }
        return;
      }
    }
    setScreen("installing");
    setProgress({ stage: "starting", percent: 0, message: "Starting..." });
    runInstall(installDir, allUsers, desktopShortcut);
  };

  const handleFinish = async () => {
    if (launchNow && exePath) {
      await launchApp(exePath).catch(() => {});
    }
    closeWindow();
  };

  const handleConfirmUninstall = async () => {
    setScreen("uninstalling");
    const unlisten = await onUninstallProgress((p) => setProgress(p));
    try {
      await startUninstall();
      setScreen("uninstall-done");
    } catch (err) {
      setErrorMsg(String(err));
      setScreen("error");
    } finally {
      unlisten();
    }
  };

  const handleSendFeedback = async () => {
    if (!feedbackReason || !FEEDBACK_ENDPOINT || feedbackInFlight) return;
    setFeedbackInFlight(true);
    setFeedbackError(null);
    const url = buildFeedbackUrl(feedbackReason, feedbackComment, state?.appVersion ?? "");
    try {
      await openUrl(url);
      setFeedbackBrowserOpened(true);
    } catch (err) {
      console.error("Failed to open feedback url in browser:", err);
      setFeedbackError(tFeedback.openError);
    } finally {
      setFeedbackInFlight(false);
    }
  };

  return (
    <div className="installer-window">
      <Background />
      <TitleBar title={screen.startsWith("uninstall") ? "Uninstall Oryvia" : "Oryvia Setup"} />
      <div className="content">
        <AnimatePresence mode="wait">
          {screen === "loading" && (
            <motion.div key="loading" className="centered muted" {...screenVariants}>
              Loading...
            </motion.div>
          )}

          {screen === "welcome" && (
            <motion.div key="welcome" className="screen welcome-screen" {...screenVariants}>
              <Logo size={92} idle />
              <h1>Welcome to Oryvia</h1>
              <p className="muted">
                This will install Oryvia {state?.appVersion ? `v${state.appVersion}` : ""} on your
                computer.
              </p>
              <div className="spacer" />
              <div className="actions">
                <SecondaryButton onClick={() => closeWindow()}>Cancel</SecondaryButton>
                <PrimaryButton onClick={() => setScreen("options")}>Continue</PrimaryButton>
              </div>
            </motion.div>
          )}

          {screen === "options" && (
            <motion.div key="options" className="screen" {...screenVariants}>
              <h2>Install options</h2>

              <label className="field-label">Install location</label>
              <div className="path-row">
                <input
                  className="path-input"
                  value={installDir}
                  onChange={(e) => { setInstallDir(e.target.value); setDirTouched(true); }}
                />
                <button className="btn btn-icon" onClick={handleBrowse} title="Browse">
                  <FolderOpen size={16} strokeWidth={1.75} />
                </button>
              </div>

              <div className="radio-group">
                <label className={`radio-option ${!allUsers ? "selected" : ""}`}>
                  <input type="radio" checked={!allUsers} onChange={() => handleToggleAllUsers(false)} />
                  <div>
                    <div className="radio-title">Just me</div>
                    <div className="radio-sub muted">Installs for your account only, no admin needed</div>
                  </div>
                </label>
                <label className={`radio-option ${allUsers ? "selected" : ""}`}>
                  <input type="radio" checked={allUsers} onChange={() => handleToggleAllUsers(true)} />
                  <div>
                    <div className="radio-title">All users</div>
                    <div className="radio-sub muted">Available to everyone on this PC, requires admin</div>
                  </div>
                </label>
              </div>

              <Toggle
                checked={desktopShortcut}
                onChange={setDesktopShortcut}
                label="Create a desktop shortcut"
              />

              <div className="spacer" />
              <div className="actions">
                <SecondaryButton onClick={() => setScreen("welcome")}>Back</SecondaryButton>
                <PrimaryButton onClick={handleInstallClick}>Install</PrimaryButton>
              </div>
            </motion.div>
          )}

          {screen === "installing" && (
            <motion.div key="installing" className="screen centered-screen" {...screenVariants}>
              <Logo size={64} />
              <div className="spacer-sm" />
              <ProgressBar percent={progress.percent} />
              <p className="muted progress-message">{progress.message || "Installing..."}</p>
            </motion.div>
          )}

          {screen === "finish" && (
            <motion.div key="finish" className="screen welcome-screen" {...screenVariants}>
              <motion.div
                className="success-icon"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
              >
                <CheckCircle2 size={56} strokeWidth={1.5} />
              </motion.div>
              <h1>Oryvia is installed</h1>
              <p className="muted">Setup finished successfully.</p>
              <Toggle checked={launchNow} onChange={setLaunchNow} label="Launch Oryvia now" />
              <div className="spacer" />
              <div className="actions">
                <SecondaryButton onClick={() => openInstallFolder(installDir)}>
                  Open folder
                </SecondaryButton>
                <PrimaryButton onClick={handleFinish}>
                  {launchNow ? "Launch Oryvia" : "Finish"}
                </PrimaryButton>
              </div>
            </motion.div>
          )}

          {screen === "uninstall-confirm" && (
            <motion.div key="uninstall-confirm" className="screen welcome-screen" {...screenVariants}>
              <Logo size={92} idle />
              <h1>Uninstall Oryvia</h1>
              <p className="muted">This will remove Oryvia and its shortcuts from this computer.</p>
              <div className="spacer" />
              <div className="actions">
                <SecondaryButton onClick={() => closeWindow()}>Cancel</SecondaryButton>
                <PrimaryButton onClick={handleConfirmUninstall}>Uninstall</PrimaryButton>
              </div>
            </motion.div>
          )}

          {screen === "uninstalling" && (
            <motion.div key="uninstalling" className="screen centered-screen" {...screenVariants}>
              <Logo size={64} />
              <div className="spacer-sm" />
              <ProgressBar percent={progress.percent} />
              <p className="muted progress-message">{progress.message || "Uninstalling..."}</p>
            </motion.div>
          )}

          {screen === "uninstall-done" && (
            <motion.div key="uninstall-done" className="screen feedback-screen" {...screenVariants}>
              <motion.div
                className="success-icon"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
              >
                <CheckCircle2 size={48} strokeWidth={1.5} />
              </motion.div>
              <h1>File cleanup scheduled</h1>

              {!feedbackBrowserOpened ? (
                <>
                  <p className="muted feedback-prompt">
                    <MessageSquareText size={14} strokeWidth={1.75} /> {tFeedback.prompt}
                  </p>
                  <div className="reason-chips">
                    {FEEDBACK_REASONS.map((r) => (
                      <button
                        key={r.id}
                        className={`chip ${feedbackReason === r.id ? "chip-selected" : ""}`}
                        onClick={() => {
                          setFeedbackReason(r.id);
                          setFeedbackError(null);
                        }}
                      >
                        {lang === "vi" ? r.labelVi : r.labelEn}
                      </button>
                    ))}
                  </div>
                  <div className={`feedback-textarea-reveal ${feedbackReason ? "open" : ""}`}>
                    <div className="feedback-textarea-wrap">
                      <textarea
                        className="feedback-textarea"
                        placeholder={tFeedback.placeholder}
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="muted feedback-note">
                    {tFeedback.note}
                  </p>
                  {feedbackError && (
                    <p
                      className="feedback-error-text"
                      style={{
                        color: "#ef4444",
                        fontSize: "0.8125rem",
                        marginTop: "0.5rem",
                        marginBottom: "0.25rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {feedbackError}
                    </p>
                  )}
                  <div className="spacer" />
                  <div className="actions">
                    <SecondaryButton onClick={() => closeWindow()}>{tFeedback.skipBtn}</SecondaryButton>
                    <PrimaryButton
                      disabled={!feedbackReason || !FEEDBACK_ENDPOINT || feedbackInFlight}
                      onClick={handleSendFeedback}
                    >
                      {feedbackInFlight
                        ? tFeedback.sendingBtn
                        : feedbackError
                        ? tFeedback.retryBtn
                        : tFeedback.sendBtn}
                    </PrimaryButton>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">{tFeedback.browserOpenedDesc}</p>
                  <div className="spacer" />
                  <div className="actions">
                    <PrimaryButton onClick={() => closeWindow()}>{tFeedback.closeBtn}</PrimaryButton>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {screen === "error" && (
            <motion.div key="error" className="screen welcome-screen" {...screenVariants}>
              <div className="error-icon"><AlertTriangle size={56} strokeWidth={1.5} /></div>
              <h1>Something went wrong</h1>
              <p className="muted">{errorMsg}</p>
              <div className="spacer" />
              <div className="actions">
                <PrimaryButton onClick={() => closeWindow()}>Close</PrimaryButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
