export interface UpdateCheckResult {
  available: boolean;
  configured?: boolean;
  version?: string;
  date?: string;
  body?: string;
}

export type UpdateStatus = "idle" | "checking" | "available" | "uptodate" | "unconfigured" | "error" | "downloading" | "installing";

export function statusFromUpdateResult(result: UpdateCheckResult): UpdateStatus {
  return result.configured === false ? "unconfigured" : result.available ? "available" : "uptodate";
}

export function statusFromUpdateError(error: unknown): UpdateStatus {
  return String(error).includes("updater_not_configured") ? "unconfigured" : "error";
}

export function finishUpdateActivity(previous: UpdateStatus): UpdateStatus {
  return ["checking", "downloading", "installing"].includes(previous) ? "idle" : previous;
}
