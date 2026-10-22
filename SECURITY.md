# Security Policy

Radian is a web browser, so it handles untrusted content all day. Security
reports are taken seriously and handled before other work.

## Supported versions

Radian has no releases yet. Only the latest commit on `main` is supported.
Once releases start, only the latest release will get security fixes.

| Version | Supported |
| --- | --- |
| `main` (latest commit) | Yes |
| Anything older | No |

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion for a security
problem.**

Report it privately through
[GitHub Security Advisories](https://github.com/amsultan2010/radian-browser/security/advisories/new)
(the repository's **Security** tab, then **Report a vulnerability**).

A useful report includes:

- what the problem is and what an attacker could do with it;
- the affected file and lines (for example `src/main/passwords.js:120-145`);
- the commit you tested, your macOS version and Mac model;
- steps to reproduce, ideally with a minimal page or extension that triggers it.

This is a small volunteer project, so replies are best effort. You'll be kept
up to date while the fix is worked on, and credited in the advisory unless you
prefer not to be.

## Scope

In scope: Radian's own code, for example

- isolation between web pages, Radian's internal pages and the main process
  (preload bridges, IPC, custom URL schemes);
- the password manager and the Arc import, including how secrets are read,
  stored and encrypted;
- the Chrome extension layer, Boosts, the ad blocker and the update check;
- permissions, downloads, certificates and links that open other apps.

Out of scope:

- Bugs in Chromium or Electron themselves. Please report those upstream to
  [Chromium](https://www.chromium.org/Home/chromium-security/reporting-security-bugs/)
  or [Electron](https://github.com/electron/electron/security). Radian picks up
  their fixes by moving to new Electron releases.
- Attacks that need someone who already controls your Mac or your user
  account.
- Arc itself.

## How Radian is hardened

The threat models inherited from Orbe are in French, in
[docs/orbe/securite-navigation.md](docs/orbe/securite-navigation.md) (everyday
browsing: permissions, certificates, pop-ups, downloads) and
[docs/orbe/mots-de-passe.md](docs/orbe/mots-de-passe.md) (the password
manager).
