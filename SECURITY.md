# Security Policy — Oryvia

## 1. Supported Versions

Oryvia receives security updates and vulnerability triage on the active release branch:

| Version | Supported | Notes |
| :--- | :---: | :--- |
| **1.0.0** | :white_check_mark: | Initial production release. Live online self-updates (N → N+1) are planned for live verification with the 1.0.1 release. |
| < 1.0.0 / Upstream forks | :x: | Historical releases or upstream Nectar/Bloom baselines are not maintained in this repository. |

---

## 2. Reporting a Vulnerability

**Please do NOT disclose potential security vulnerabilities publicly via public GitHub issues, discussions, or social media.** Public disclosure before a fix is available can put users at risk.

### Preferred Reporting Channel (Pending Maintainer Configuration)
- The project maintainer has not yet designated an official private security email or confirmed whether GitHub Private Vulnerability Reporting is active for this repository.
- **Action Required by Maintainer:** Configure an official security channel (such as enabling GitHub Private Vulnerability Reporting under repository `Settings › Code security and analysis › Private vulnerability reporting`, or providing an explicit security contact email).
- If GitHub Security Advisories are enabled on the repository, submit reports privately via:  
  `https://github.com/panchi146/Oryvia/security/advisories/new`
- If no private channel is currently accessible, contact the maintainer directly through verified private maintainer channels (e.g. maintainer GitHub profile contact) before publishing any security finding.

### Information to Include in Reports
When reporting a security issue, please provide:
1. Exact Oryvia version and installation type (Custom Setup all-users, per-user, or Portable).
2. Host operating system (Windows 10/11 version and architecture).
3. A clear description of the vulnerability and its potential security impact.
4. Step-by-step reproduction instructions or a minimal proof-of-concept.

---

## 3. Security Architecture & Boundary Scope

- **Runtime Isolation (CSP):** The application webviews are restricted by Content Security Policy (CSP) configurations in `src-tauri/tauri.conf.json` and `installer-app/src-tauri/tauri.conf.json`.
- **Sensitive Credentials Storage:** Private CalDAV passwords and private ICS calendar URLs are stored in the native Windows Credential Manager via the `keyring` crate under service names `Nectar CalDAV` and `Nectar Calendar Link`. They are never written to `settings.json`.
- **Installer Safety:** The Custom Installer implements a transactional installation engine with automatic rollback on write failures, verifying file ownership to protect foreign files in shared directories.
- **Limitation Notice:** The existence of CSP, credential encryption, and memory-safe Rust backends mitigates common attack surfaces, but does not guarantee absolute immunity from software vulnerabilities or substitute for formal third-party penetration audits.
