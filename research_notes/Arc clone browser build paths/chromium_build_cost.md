# Cutting the disk, RAM, time and money cost of building a custom Chromium on Apple Silicon (as of 2026-10-22)

Context: one person with an M4 MacBook (10 cores, 16 GB RAM, 245 GB disk with about 17 GB free, Command Line Tools only, no Xcode). The goal is a Chromium fork with an Arc-like SwiftUI or C++ UI.

A local check of that machine on 2026-10-22 found:
- macOS 27.0 (build 26A428).
- `xcode-select -p` = `/Library/Developer/CommandLineTools`. The Command Line Tools SDKs go up to MacOSX26.4.sdk.
- 17,179,869,184 bytes (16 GiB) of RAM.
- `df` reports 16 GiB available on `/`.

Each claim below carries a source. Numbers are dated wherever the source gives a date.

---

## 1. Official Chromium macOS build requirements and local costs (disk, Xcode, RAM, time)

### Takeaway
A local build has two hard blockers on this Mac:
- **Full Xcode is required.** Chromium's SDK finder only looks inside an Xcode-style `Platforms/MacOSX.platform/Developer/SDKs` directory. Command Line Tools do not have that layout. Chromium `main` now pins SDK 27.0 (Xcode 27) for official builds.
- **17 GB of free disk is far too little.** The official source tarball alone is 4.4 GB compressed (2.0 GB in the "lite" form). The other desktop platforms' docs ask for at least 100 GB free. The Mac doc gives no number.

Measured CI data points (Oct 2026):
- About 6.5 h for an official-style arm64 build on an 8-core M4 with 24 GB.
- About 43 h on GitHub's free 3-core M1 runners (Nov 2025).

The 2023 community figure of 1 h 23 min for a non-official build on an M2 Pro with 16 GB is the only M-series laptop number found.

### Cited Findings

**Xcode and SDK**
- The Mac build doc lists these system requirements: "A Mac, Intel or Arm", Xcode, the macOS SDK, and "An APFS-formatted volume (this is the default format for macOS volumes)". It recommends the newest Xcode, which "often requires using the newest version of macOS". It says "We don't use Xcode itself much", so someone who knows what they are doing can build on an older macOS as long as they have a new SDK. — [Chromium Mac build instructions (main)](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)
- `mac_sdk.gni` on `main` (read 2026-10-22) sets:
  - `mac_sdk_official_version = "27.0"` and `mac_sdk_official_build_version = "26A425"`.
  - `mac_sdk_official_universal_version = "26.5"` for Intel hosts. The comment says "Xcode 27+ is ARM-only".
  - `mac_min_system_version = "13.0"`.
  — [mac_sdk.gni](https://chromium.googlesource.com/chromium/src/+/main/build/config/mac/mac_sdk.gni)
- The minimum SDK accepted for local (system-Xcode) builds is `mac_sdk_min = "15"`. — [mac_sdk_overrides.gni](https://chromium.googlesource.com/chromium/src/+/main/build/config/mac/mac_sdk_overrides.gni)
- `find_sdk.py` runs `xcode-select -print-path` and looks for `<dev_dir>/Platforms/MacOSX.platform/Developer/SDKs`. If that directory is missing it raises "Install Xcode, launch it, accept the license agreement, and run `sudo xcode-select -s /path/to/Xcode.app`". It also returns the bin path `Toolchains/XcodeDefault.xctoolchain/usr/bin/`. Command Line Tools keep SDKs in `/Library/Developer/CommandLineTools/SDKs` (confirmed by the local check above), so the lookup fails. — [build/mac/find_sdk.py](https://chromium.googlesource.com/chromium/src/+/main/build/mac/find_sdk.py)
- Electron's official build-tools stop if only Command Line Tools are present: "Xcode appears to be missing, you may have Command Line Tools installed but not a full Xcode. Please install Xcode now". They also require Xcode 15 or newer. Build-tools download standalone macOS SDK zips (26.0 to 26.5 listed) and symlink them into the checkout, but still need Xcode itself. — [electron/build-tools src/utils/sdk.ts](https://github.com/electron/build-tools/blob/main/src/utils/sdk.ts), [sdks.json](https://github.com/electron/build-tools/blob/main/src/utils/sdks.json), [build-tools README](https://github.com/electron/build-tools/blob/main/README.md)
- Helium's macOS build guide (2026) requires:
  - Xcode 26 and Homebrew.
  - `xcodebuild -downloadComponent MetalToolchain`, which needs Xcode's `xcodebuild`.
  - "ensure the Xcode application is open" before building.
  — [helium-macos docs/building.md](https://github.com/imputnet/helium-macos/blob/main/docs/building.md)
  - The ungoogled-chromium-macos README has the same Metal toolchain and Xcode steps. — [ungoogled-chromium-macos README](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/README.md)
- **Xcode 26 size (Aug 13, 2025):**
  - The Apple-silicon-only Xcode 26 beta 5 is "2.85GB less" than the universal build.
  - The download is about 22% smaller and the install about 25% smaller.
  - The Metal toolchain was unbundled from Xcode in 26.0 beta 1, so it is a separate download.
  - No absolute GB figures are given.
  — [Bitrise: Xcode.app size reduction in 26.0 Beta 5](https://bitrise.io/blog/post/xcode-app-size-reduction-in-26-0-beta-5)

**Checkout and disk**
- `fetch --no-history chromium` saves time, and `git fetch --unshallow` restores history later. `fetch --git-cache` keeps full history and "mirrors every repo it fetches (~30 GB for Chromium)". The doc warns: "Expect the command to take 30 minutes on even a fast connection, and many hours on slower ones." — [Chromium Mac build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)
- Old figure (2014 PSA): history was about 9 GB of .git objects, and `--no-history` saved about 7 GB. A reply in the same thread said the chromium/src packfiles were 2.9 GB. These figures are stale. — [chromium-dev PSA: fetch now supports --no-history](https://groups.google.com/a/chromium.org/g/chromium-dev/c/1XmjgWeHx6A)
- The Mac doc gives no disk or RAM figure. The other platforms' docs do:
  - **Linux:** "at least 8GB of RAM. More than 16GB is highly recommended". It recommends ">=32GB/>=16GB of swap for machines with 8GB/16GB of RAM". It asks for "At least 100GB of free disk space" with "~50-80GB on HDD for build". — [Chromium Linux build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)
  - **Windows:** "At least 100GB of free disk space on an NTFS-formatted hard drive". — [Chromium Windows build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
- **Official source tarballs** (HTTP HEAD on 2026-10-22, Chromium 155.0.8059.84, published 2026-10-15):

  | Tarball | Size |
  |---|---|
  | `chromium-155.0.8059.84.tar.xz` | 4,390,800,948 bytes (≈4.39 GB) |
  | `-lite.tar.xz` | 2,021,234,676 bytes (≈2.02 GB) |
  | `-testdata.tar.xz` (split out of lite) | 1,306,308,232 bytes |

  — [chromium-browser-official bucket (lite)](https://commondatastorage.googleapis.com/chromium-browser-official/chromium-155.0.8059.84-lite.tar.xz), [full](https://commondatastorage.googleapis.com/chromium-browser-official/chromium-155.0.8059.84.tar.xz). ungoogled-chromium downloads the `-lite.tar.xz` variant. — [ungoogled-chromium downloads.ini](https://github.com/ungoogled-software/ungoogled-chromium/blob/master/downloads.ini)
- **Helium's prepared tarballs** for Chromium 156.0.8078.47 (published 2026-10-21) are layered:

  | Layer | Size |
  |---|---|
  | `-base.tar.zst` | 1,983,006,019 bytes (≈1.98 GB) |
  | `-mac-arm64.tar.zst` | 1,390,257,137 bytes (≈1.39 GB) |

  Each archive "contains a pinned Chromium checkout with its dependencies and toolchains already fetched for a specific host, so builds don't have to run `gclient sync`". — [imputnet/chromium-tarballs README](https://github.com/imputnet/chromium-tarballs), [helium downloads.ini](https://github.com/imputnet/helium/blob/main/downloads.ini), [helium-macos downloads.arm64.ini](https://github.com/imputnet/helium-macos/blob/main/downloads.arm64.ini)
- **Compressed whole-tree sizes from CI.** Both projects upload the build tree as `tar | zstd -11`, including `out/`, at the end of a build:
  - ungoogled-chromium arm64: 11.0 GB. x86_64: 12.62 GB. (Run 39156959588, 2026-10-19.) — [ungoogled-chromium-macos run 39156959588](https://github.com/ungoogled-software/ungoogled-chromium-macos/actions/runs/39156959588)
  - Helium arm64: 7.02 GB. x86_64: 8.6 GB. (Run 39651879454, 2026-10-22.) — [helium-macos run 39651879454](https://github.com/imputnet/helium-macos/actions/runs/39651879454)
  - Source-plus-resources archives: ungoogled 6.41 GB (arm64) and 6.61 GB (x86_64); Helium 2.64 GB. — same runs
  - The packing command is in [ungoogled github_prepare_artifacts.sh](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/scripts/github_prepare_artifacts.sh).
- No 2025–2026 measurement was found of uncompressed `out/` size for macOS at symbol_level 0 vs 1. A 2015 thread reports a 65 GB total and says Debug "uses a lot more disk space" than Release. — [chromium-discuss: Why is Chromium 65GB big](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/HHMbfxPOuEY)

**Build-speed and size flags (official doc)**
- `is_debug = false`: "linking is a lot faster in Release builds".
- `is_component_build = true`: "makes incremental builds much faster, at the cost of producing a binary that opens less quickly".
- `symbol_level = 0`: "makes both full rebuilds and linking faster".
- `use_lld = false` (Apple ld-prime): "supported for local non-cross arm64 macOS builds (ARM Mac) and improves link speed".
- ccache is suggested.
- The page also tells you to exclude the checkout from Spotlight.
— [Chromium Mac build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)
- `symbol_level=1` gives "a minimal symbol table, capable of creating backtraces, but without frame-level local variables". — [Chromium Debugging on macOS](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/mac/debugging.md)
- **Helium's dev vs release flags:**
  - Dev mode replaces `is_official_build` with `is_component_build` and drops PGO.
  - Non-dev builds add `chrome_pgo_phase=2`.
  - CI builds add `symbol_level=1` and `cc_wrapper="sccache"`.
  — [helium-macos devutils/shared.sh](https://github.com/imputnet/helium-macos/blob/main/devutils/shared.sh)

**Build times on Apple Silicon**
- **M2 Pro laptop (Jan 2023):** a MacBook Pro M2 Pro (12-core CPU, 16 GB RAM, 1 TB SSD) did a first full build in 1 h 23 min 28 s wall clock. Build args were not verified. — [Solomon Kinard, Medium, "Chromium build on M2 Pro"](https://medium.com/@solomonkinard/chromium-build-on-m2-pro-d3210e859a43)
  - The same author reports 1 h 49 min on an M2 MacBook Pro (date and args unverified). — [Solomon Kinard, Medium, "Chromium Build Times"](https://medium.com/@solomonkinard/m2-chromium-build-time-6a930f57663b)
- **Depot M4 runners (8 CPU / 24 GB), Oct 2026.** These are official-style release builds with PGO; Helium also sets symbol_level=1.

  | Build | Chromium / version | Date | Fetch time | Build time | Split | End to end |
  |---|---|---|---|---|---|---|
  | ungoogled arm64 | 155.0.8059.84 | 2026-10-18/19 | 38 min | ≈6 h 26 min | 5 h 14 min + 1 h 12 min | ≈7 h 05 min |
  | ungoogled x86_64 (cross-built on arm64) | 155.0.8059.84 | 2026-10-18/19 | — | ≈9 h 32 min | — | — |
  | Helium arm64 | 0.20.1.1 | 2026-10-21/22 | 22 min | ≈6 h 43 min | 4 h 31 min + 2 h 12 min | — |
  | Helium x86_64 | 0.20.1.1 | 2026-10-21/22 | — | ≈13 h 06 min over three jobs | — | — |

  — [ungoogled run 39156959588](https://github.com/ungoogled-software/ungoogled-chromium-macos/actions/runs/39156959588), [helium run 39651879454](https://github.com/imputnet/helium-macos/actions/runs/39651879454), [Depot runner types](https://depot.dev/docs/github-actions/runner-types)
- **Free GitHub `macos-15` arm64 runners (M1, 3 CPU, 7 GB), Nov 2025:** ungoogled 142.0.7444.175 on 2025-11-22/23 took 25 min to fetch resources plus 9 chained build jobs (8 × about 5 h 10 min, plus 1 h 36 min). That is about 43 h of build and about 43.5 h end to end. — [ungoogled run 19588971585](https://github.com/ungoogled-software/ungoogled-chromium-macos/actions/runs/19588971585)
- **Arm Macs:** they are "fully supported", and there is an arm64-on-arm64 waterfall bot. A non-component release `Chromium.app` can be copied to another Mac. A zipped or downloaded app needs `xattr -rc Chromium.app` to clear quarantine. — [Chromium for Arm Macs](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_arm64.md)

### Inferences
- With 16–17 GB free, even unpacking the 2 GB lite tarball (several times larger once unpacked) plus Xcode (≈8–11 GB, see below) does not fit. A local build needs an external SSD or a cleared internal disk. Inference from the sizes above. The CI archives are 7–12.6 GB after zstd -11, so the uncompressed tree with `out/` is plausibly well over 50 GB. That figure is not measured here.
- Rough Xcode 26 install size, derived arithmetic and not a published figure: 2.85 GB being about 25% implies roughly 11.4 GB for universal and 8.5 GB for Apple-silicon-only.
- Chromium `main` targets SDK 27.0 (Xcode 27) for official builds. Local builds accept any SDK of 15 or newer when found through a full Xcode, so Xcode 26.x should still work for local builds of a current branch. That follows from `mac_sdk_min = "15"`. It is not tested.
- Command Line Tools only:
  - In principle you could fake the Xcode directory layout with symlinks to the Command Line Tools SDK. Nobody has documented this.
  - The Metal toolchain step (`xcodebuild -downloadComponent`) and any Xcode-only tools such as `actool` would still be missing. `actool` usage is not verified in this research.
  - Treat Xcode as mandatory.
- The 6.5 h Depot figures are for official, PGO-optimised builds. A dev build (`is_component_build=true`, `is_debug=false`, `symbol_level=0`, no official/LTO) on a 10-core M4 should land much closer to the 1.5–2 h M2 Pro figures. This is an estimate with no direct M4 measurement.
- A 16 GB M4 is at the Linux doc's floor ("More than 16GB is highly recommended"). Expect swapping during heavy links, especially for non-component or official builds.

### Gaps
- No 2025–2026 measured numbers were found for:
  - checkout size with and without history on macOS;
  - uncompressed `out/` size for symbol_level 0 vs 1, or component vs static;
  - incremental rebuild times on M-series Macs.
  Measuring with `du -sh src src/out/*` would settle the disk questions.
- No absolute Xcode 26 or 27 installed size was found from Apple or another primary source.
- No published first-build time was found for an M4 (base) MacBook with 16 GB.

---

## 2. Remote and distributed builds for non-Googlers (Siso + REAPI backends)

### Takeaway
Yes, non-Googlers can point Siso at any REAPI backend:
- EngFlow documents macOS support from Chromium 145 (Jan 2026).
- NativeLink has a Chromium guide.
- Helium's macOS dev tooling already wires Siso to a NativeLink backend.

Remote execution does not remove the need for local disk. The full source tree must still be local, workers are Linux containers, and Chromium's Siso config says "remote-link is not supported on Mac/iOS yet", so links stay on the laptop. Reclient explicitly does not support Mac for external contributors.

### Cited Findings
- "For external contributors, Reclient does not support Mac builds." Google employees use `use_remoteexec = true`. — [Chromium Mac build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)
- **Siso with your own backend (Linux doc):**
  - Siso is Chromium's build client for remote actions.
  - Google's RBE is invitation-only for external contributors and "best-effort … We do not guarantee when you will be invited".
  - Under "non Google RBE": "you are welcome to use any of the other compatible backends". You set `reapi_address`, `reapi_instance` and `reapi_backend_config_path` in `.gclient` and prepare your own `backend.star`.
  — [Chromium Linux build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)
- The Siso backend template uses `"OSFamily": "Linux"` plus a `container-image` for both the "default" and "large" worker pools. — [backend_config/template.star](https://chromium.googlesource.com/chromium/src/+/main/build/config/siso/backend_config/template.star), [backend_config/README.md](https://chromium.googlesource.com/chromium/src/+/main/build/config/siso/backend_config/README.md)
- **Chromium's `clang_mac.star`:**
  - It loads `mac_sdk.star` filegroups.
  - It fails with "remote-link is not supported on Mac/iOS yet" if remote-link is enabled.
  - It maps clang steps to a "clang" or "clang_large" remote platform.
  — [build/config/siso/clang_mac.star](https://chromium.googlesource.com/chromium/src/+/main/build/config/siso/clang_mac.star)
- **EngFlow:** "Starting with Chromium 145 (Jan 2026)", EngFlow supports Siso remote execution for Chromium on Linux, macOS and Windows. Setup:
  - `.gclient` custom_vars `rbe_instance`, `reapi_instance`, `reapi_address`;
  - edit `backend.star` to drop Google `label:*` properties;
  - mTLS cert via `RBE_tls_client_auth_cert` and `RBE_tls_client_auth_key`;
  - gn args `use_siso=true use_remoteexec=true use_reclient=false`.

  "not all of Chromium can be built remotely", and Siso falls back to local. No pricing is published on the page. — [EngFlow: Migrating from reclient to Siso](https://docs.engflow.com/re/chromium/migrating-from-reclient-to-siso.html)
- **NativeLink:** its Chromium guide sets `SISO_REAPI_ADDRESS`, `SISO_REAPI_INSTANCE=main` and the `RBE_tls_*` variables, or `RBE_service_no_security=true` for local non-TLS. Workers must advertise the same `OSFamily: Linux` and `container-image` as Chromium's `backend.star`, built from Chromium's `siso-chromium/linux` RBE image. The page gives no costs and no timings. — [NativeLink docs: Chromium](https://docs.nativelink.com/deployment/chromium)
  - The worker spec (Linux, at least 8 CPUs, 16+ recommended for link steps) comes from a search-result summary of the same page and was not re-verified on fetch.
- **Helium's macOS tooling:** if `SISO_REAPI_ADDRESS` is set in dev mode, it writes `use_remoteexec = true` and runs `configure_siso.py --reapi_address=… --reapi_instance=… --reapi_backend_config_path=nativelink.star`. Otherwise it uses sccache, then ccache. — [helium-macos devutils/shared.sh](https://github.com/imputnet/helium-macos/blob/main/devutils/shared.sh)
- **BuildBuddy pricing page:**
  - Free "Personal" tier: up to 80 Linux cores of remote execution and 100 GB of cache transfer.
  - "Team": pay-as-you-go, up to 800 cores, per-GB price shown only as "$X".
  - "Enterprise": by quote.
  - The table lists "$45 / core" for Mac cores; which plan it applies to is unclear.

  No Chromium/Siso-specific BuildBuddy doc was found. — [BuildBuddy pricing](https://www.buildbuddy.io/pricing)
- Electron's build-tools default to Siso remote execution (`--remote-build siso`), with `--no-remote` for local-only builds. — [electron/build-tools README](https://github.com/electron/build-tools/blob/main/README.md)

### Inferences
- Mac compile actions run on Linux workers, with the macOS SDK uploaded as action inputs through the `mac_sdk` filegroup. That inference comes from the Linux-only backend template and the `mac_sdk.star` load. As a result:
  - a self-hosted backend can run on cheap Linux VMs instead of Macs;
  - every link runs on the 16 GB M4, and a non-component `Chromium Framework` link is the most memory-hungry step.
- Remote execution saves CPU time and battery. It does not save the 50 GB+ of local disk: you still need the source checkout plus Xcode SDK, and likely most of `out/`. Whether Siso can skip downloading intermediate `.o` outputs on Mac was not verified.
- The cheapest path is the BuildBuddy free tier (80 Linux cores). That it works for Chromium is unverified: no published Chromium setup exists for BuildBuddy, and Google-specific `label:*` properties must be removed, as EngFlow notes.

### Gaps
- No published cost per Chromium build, and no measured speed-up, was found for any third-party backend on macOS.
- No source confirms whether Siso on a Mac host needs `out/` intermediates locally.
- EngFlow and NativeLink Cloud pricing was not found.

---

## 3. GitHub Actions: how ungoogled-chromium-macos and Helium build on CI

### Takeaway
Both projects chain jobs. Each job runs `ninja` under `timeout` for about 5 h, then tars and zstd-compresses the whole `build/src` (7–12.6 GB) as an artifact. The next job downloads it and resumes. There are up to 20 chained jobs in ungoogled and 10 in Helium.

As of Oct 2026 both run on Depot-sponsored `depot-macos-latest` runners (M4, 8 CPU, 24 GB, 400 GB disk, $0.08/min list price), not GitHub's free runners. That takes an arm64 build to about 7–8 h end to end. On GitHub's free `macos-15` runners (3-core M1, 7 GB, 14 GB SSD nominal) the same pipeline took about 43 h across 9 jobs in Nov 2025. That is $0 for a public repo, but very slow.

### Cited Findings
- **ungoogled-chromium-macos**:
  - `build.yml` runs a matrix `arch: [arm64, x86_64]` with `os: depot-macos-latest`.
  - `building.yml` has a `retrieve-resources` job plus `build_job_01` … `build_job_20`. Each later job runs only `if: needs.<previous>.outputs.status == 'running'`.

  — [ungoogled build.yml](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/workflows/build.yml), [ungoogled building.yml](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/workflows/building.yml)
- **ungoogled job steps** (each job):
  1. Delete `$ANDROID_HOME`.
  2. Keep only `/Applications/Xcode_26.0.app` and delete the other Xcodes.
  3. `sudo mdutil -a -i off`.
  4. Download the previous artifact.
  5. Run `ninja -C out/Default chrome chromedriver` under `timeout -k 7m -s SIGTERM ${_remaining_time}`. The time budget is 360 − 60 min minus time already used in the job ("GitHub's hard time limit is 6 h per job, we want to spare 1 h for steps before and after the build").
  6. Run `tar -C build -c -f - src | zstd -vv -11 -T0`. The comment notes it "Needs to be compressed to stay below GitHub's upload limit".

  — [github_build.sh](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/scripts/github_build.sh), [github_prepare_xcode.sh](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/scripts/github_prepare_xcode.sh), [github_prepare_artifacts.sh](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/scripts/github_prepare_artifacts.sh)
- **helium-macos**:
  - `build.yml` is `workflow_dispatch` with a `runner` input defaulting to `macos-latest`.
  - `building.yml` has `retrieve-resources` plus `build_job_01`…`build_job_10`, each calling the reusable `build-phase.yml` with `resume: true`.
  - `github_build.sh` uses the same 5 h budget and sets `SCCACHE_GHA_ENABLED=on`, which uses the GitHub Actions cache as the sccache backend unless other SCCACHE variables are set.
  - It builds `chrome/installer/mac` and runs `sccache --show-stats` before and after.

  — [helium build.yml](https://github.com/imputnet/helium-macos/blob/main/.github/workflows/build.yml), [helium building.yml](https://github.com/imputnet/helium-macos/blob/main/.github/workflows/building.yml), [helium build-phase.yml](https://github.com/imputnet/helium-macos/blob/main/.github/workflows/build-phase.yml), [helium do-build action](https://github.com/imputnet/helium-macos/blob/main/.github/actions/do-build/action.yml), [helium github_build.sh](https://github.com/imputnet/helium-macos/blob/main/.github/scripts/github_build.sh)
- In practice the latest Helium release run used `depot-macos-latest` runners. — [helium run 39651879454](https://github.com/imputnet/helium-macos/actions/runs/39651879454)
- **Depot sponsorship:** both READMEs thank Depot for sponsoring macOS runners.
  - ungoogled: "reduce build times from days to hours". — [ungoogled-chromium-macos README](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/README.md)
  - Helium: "within hours, not days". — [helium-macos README](https://github.com/imputnet/helium-macos/blob/main/README.md)
- **Depot macOS runners:**
  - `depot-macos-26`, aliased `depot-macos-latest`: M4, 8 CPUs, 24 GB RAM, 400 GB disk, $0.08/min.
  - `depot-macos-15` and `-14`: M2, 8 CPUs, 24 GB, 400 GB, $0.08/min.

  — [Depot runner types](https://depot.dev/docs/github-actions/runner-types)
  - Depot's pricing page lists a $20/month Developer plan with "2,000 GitHub Actions minutes". It does not say whether those minutes cover macOS. — [Depot pricing](https://depot.dev/pricing)
- **Measured timelines:**
  - Depot M4, Oct 2026: arm64 ≈7 h end to end (ungoogled) and ≈7.8 h (Helium). See section 1.
  - Depot, Jan 2026 (ungoogled 144.0.7559.59): arm64 build 5 h 17 min + 2 h 48 min. — [ungoogled run 21192872470](https://github.com/ungoogled-software/ungoogled-chromium-macos/actions/runs/21192872470)
  - GitHub-hosted `macos-15` (arm64) and `macos-15-intel`, Nov 2025: ≈43.5 h end to end for arm64 (9 chained jobs) and ≈41 h for x86_64 (8 jobs). — [ungoogled run 19588971585](https://github.com/ungoogled-software/ungoogled-chromium-macos/actions/runs/19588971585)
- **GitHub-hosted runner specs:**
  - Standard macOS arm64 runners (`macos-latest`, `macos-14/15/26`, `xcode-27`): 3 CPU (M1), 7 GB RAM, 14 GB SSD.
  - Intel `macos-15-intel` and `macos-26-intel`: 4 CPU, 14 GB RAM, 14 GB SSD.
  - "Use of the standard GitHub-hosted runners is free and unlimited on public repositories."

  — [GitHub Docs: GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- **GitHub limits:**
  - GitHub-hosted jobs: "6 hours of execution time" per job; workflow run up to 35 days.
  - Free plan: up to 20 concurrent jobs, with at most 5 concurrent macOS jobs.
  - Cache: 10 GB per repository.
  - Artifact storage (Free plan): 500 MB.
  - Self-hosted runners: 5 days per job.

  — [GitHub Docs: Actions limits](https://docs.github.com/en/actions/reference/limits)
- **Larger macOS runners** (5-core M2 or M2 Pro) need a paid plan and do not use free minutes. A third-party comparison quotes $0.102/min. Chip naming varies between sources. — [GitHub Docs: larger runners](https://docs.github.com/en/actions/reference/runners/larger-runners), secondary [CRACI comparison](https://craci.com/compare/github-actions-runner-providers)
- **2026 pricing changes:**
  - GitHub cut hosted-runner prices by up to 39% from Jan 1, 2026.
  - It announced a $0.002/min platform charge for self-hosted runners from Mar 1, 2026, then postponed it in Dec 2025 to re-evaluate.

  — [GitHub changelog 2025-12-16](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/), [GitHub resources: 2026 pricing changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/)

### Inferences
- **Artifact storage on public repos:** ungoogled uploads 11–12.6 GB build artifacts per arch, and Helium 7–8.6 GB, from public repos. So the 500 MB Free-plan artifact quota evidently does not cap public repos. That is inferred from observed artifacts, not from a doc statement.
- **The 14 GB SSD figure:** GitHub's "14 GB SSD" is evidently not the usable free space, because full builds succeeded on `macos-15` in Nov 2025. Both projects delete the Android SDK and extra Xcodes to make room. Actual free space was not verified.
- **Rough cost on Depot at list price:** one ungoogled arm64 build is about 424 runner-minutes, so ≈$34. Helium x86_64 at ≈13 h would be ≈$63. This is arithmetic only. Both projects are sponsored, so they do not pay this.
- **The free path for a public fork:** copy the ungoogled/Helium chained-job pattern onto `macos-latest`. Expect about 40+ h per full build. GitHub's sccache cache (10 GB per repo) is too small to hold a full Chromium object cache, so sccache gains are limited. The cache size is from the docs; the sccache hit-rate effect is not measured.
- **A self-hosted runner** (your own Mac, or a rented Scaleway or EC2 Mac registered as a runner) gets a 5-day job limit, so no phasing is needed. The postponed $0.002/min fee would add about $0.12/h if reinstated.

### Gaps
- Sccache hit rates in Helium CI were not checked; the stats are in the job logs.
- Whether the free GitHub `macos-26` image has enough disk without cleanup was not verified.
- How Depot's plan minutes apply to macOS runners was not found.

---

## 4. Rented cloud Macs: prices and disk sizes

### Takeaway
Apple's macOS licence forces a 24-hour minimum lease almost everywhere (AWS, Scaleway).
- **Cheapest one-off build machine:** Scaleway M4-M (10-core M4, 32 GB, 1 TB) at €0.29/h, so about €7 for a 24 h day, or €199/month.
- **AWS mac-m4.metal** (M4, 24 GB, 2 TB instance store) is $1.23/h, so ≈$29.52 minimum per allocation.
- **Monthly bare-metal M4 minis** cost about $100–$350/month (MacStadium $149–$399 after a mid-2026 increase; MacinCloud M4 ≈$125, per a competitor page).

No Hetzner Mac offering was found.

### Cited Findings
- **AWS EC2 Mac:**
  - Instance types: `mac2.metal` (M1, 16 GB), `mac2-m2.metal` (M2, 24 GB), `mac2-m2pro.metal` (M2 Pro, 32 GB), `mac2-m1ultra.metal` (128 GB), `mac-m4.metal` (M4, 10 cores, 24 GB, "2 TB instance store per Dedicated Host"), `mac-m4pro.metal` (M4 Pro, 14 cores, 48 GB, 2 TB instance store), `mac-m4max.metal` (128 GB), `mac-m3ultra.metal` (256 GB).
  - Sold as Dedicated Hosts, billed per second "with a 24-hour minimum allocation period" (per the Apple macOS licence). Savings Plans save up to 44% with a 3-year commitment.
  - The page lists no prices.

  — [AWS EC2 Mac instances](https://aws.amazon.com/ec2/instance-types/mac/)
- **EC2 Mac on-demand prices (third-party trackers):**
  - `mac-m4.metal`: $1.230/h on demand, 10 vCPU, 24 GiB, 1,900 GiB NVMe SSD. — [Vantage: mac-m4.metal](https://instances.vantage.sh/aws/ec2/mac-m4.metal)
  - `mac2-m2.metal`: $0.878/h. — [Vantage: mac2-m2.metal](https://instances.vantage.sh/aws/ec2/mac2-m2.metal)
  - `mac2.metal` (M1): about $0.65/h. Secondary sources; verify in the AWS calculator. — [Vantage: mac2.metal](https://instances.vantage.sh/aws/ec2/mac2.metal)
  - 24-hour minimum cost: ≈$29.52 for mac-m4 and ≈$21.07 for mac2-m2. — [macyou: AWS EC2 Mac pricing 2026](https://macyou.co/blog/aws-ec2-mac-pricing-explained)
- **Scaleway** (PAR-1, excl. VAT):

  | Offer | Chip | RAM | SSD | Hourly | Monthly |
  |---|---|---|---|---|---|
  | M1-M | M1 | 8 GB | 256 GB | €0.11 | €75 |
  | M2-M | M2 | 16 GB | 256 GB | €0.17 | €115 |
  | M2-L | M2 Pro | 16 GB | 512 GB | €0.21 | €139 |
  | M4-S | M4 10-core | 16 GB | 256 GB | €0.22 | €149 |
  | M4-SP | M4 | 16 GB | 512 GB | €0.24 | €165 |
  | M4-M | M4 | 32 GB | 1.02 TB | €0.29 | €199 |
  | M4-XL | M4 Pro 14-core | 64 GB | 2.05 TB | €0.49 | €335 |

  — [Scaleway Apple silicon pricing](https://www.scaleway.com/en/pricing/apple-silicon/)
  - A 24-hour minimum lease applies "due to Apple license constraints". This comes from search summaries of Scaleway's Mac mini FAQ and runner page and was not directly fetched. — [Scaleway Apple Mac mini](https://www.scaleway.com/en/apple-mac-mini/), [Scaleway Mac mini runners](https://www.scaleway.com/en/mac-mini-runners/)
- **MacStadium** M4 Mac mini monthly plans, after a late-June 2026 increase:

  | Plan | Before | After |
  |---|---|---|
  | M4.S (16 GB / 256 GB) | $119 | $149 |
  | M4.M | $199 | $249 |
  | M4.L | $299 | $349 |
  | M4.XL | — | $399 |

  Secondary tracker; not confirmed on macstadium.com. — [PricingSaaS: MacStadium](https://pricingsaas.com/companies/macstadium), [PricingSaaS diff 2026W27](https://pricingsaas.com/companies/macstadium/diffs/2026W27)
- **MacinCloud** M4 dedicated: $124.99/month or $1,249/year, "as of June 2026". This comes from a competitor's comparison page, so it is low reliability. — [Green Mini: MacinCloud alternative](https://www.greenmini.nl/compare/macincloud-alternative/)
- Other low-cost dedicated M4 listings: Rentamac $99/month and Mac Mini Vault from $134.99/month. These are vendor pages and were not verified. — [rentamac.io dedicated Mac](https://rentamac.io/dedicated-mac/), [Mac Mini Vault](https://www.macminivault.com/dedicated-mac-mini/)

### Inferences
- **Cost per full build, using section 1 times:**
  - A 10-core M4 should finish a dev build well inside one 24 h lease, and likely an official build too (Depot's 8-core M4 takes about 6.5 h).
  - Scaleway M4-M (32 GB RAM, 1 TB) at about €7 for the 24 h minimum is the cheapest found. It also has more RAM than the user's laptop, which helps links.
  - EC2 mac-m4.metal costs about 4× more for the same day but includes 2 TB of NVMe.
- **Monthly rental fits iteration:** with a rented Mac kept for a month (€149–199), you keep the checkout and `out/` warm on the remote disk, and incremental builds there are cheap. The 17 GB local disk then only needs the built `.app` (≈0.14–0.35 GB as a DMG, per the CI artifacts in section 1). Mac-to-Mac copies need `xattr -rc` to clear quarantine, per the Arm Mac doc.

### Gaps
- No primary-source price was fetched for EC2 `mac-m4pro.metal`.
- No Hetzner macOS offering was found. Hetzner appears not to sell Macs, but this was not confirmed.
- MacStadium's and MacinCloud's own pricing pages were not fetched directly.

---

## 5. Building Chromium on an external SSD

### Takeaway
Chromium's only stated filesystem requirement is "An APFS-formatted volume", so an external APFS SSD meets the documented requirements. No measured benchmark or official guidance on external-drive speed was found. The documented gotcha is Spotlight indexing. Time Machine exclusion and case sensitivity are not addressed in Chromium docs.

### Cited Findings
- The system requirements include "An APFS-formatted volume (this is the default format for macOS volumes)". Nothing requires the boot volume or case-sensitivity. — [Chromium Mac build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)
- Spotlight "will try to index all of those files, and uses a lot of CPU time". The doc says to add the checkout under System Settings → Spotlight → Privacy. — [Chromium Mac build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)
  - Both CI pipelines run `sudo mdutil -a -i off` in every job. — [ungoogled building.yml](https://github.com/ungoogled-software/ungoogled-chromium-macos/blob/master/.github/workflows/building.yml), [helium prepare-environment action](https://github.com/imputnet/helium-macos/blob/main/.github/actions/prepare-environment/action.yml)
- The Linux doc notes the disk "does not have to be on the same drive". That is Linux guidance only. — [Chromium Linux build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)
- A forum report says TRIM works on true Thunderbolt drives, and possibly on UASP USB drives. Anecdotal. — [MacRumors: TRIM questions](https://forums.macrumors.com/threads/trim-questions.2443614/)

### Inferences
- Use a case-insensitive APFS volume, the default that Chromium's bots and docs assume. No source says case-sensitive APFS is supported or tested for Mac builds.
- Practical steps, none sourced to Chromium docs:
  - Run `sudo mdutil -i off /Volumes/<ssd>`.
  - Exclude the volume from Time Machine (`tmutil addexclusion -p`).
  - Use a Thunderbolt or USB4 NVMe enclosure rather than USB 3.x 5–10 Gbps to limit I/O stalls during links.
- Xcode itself can live on the external SSD with `xcode-select -s /Volumes/<ssd>/Xcode.app`. This frees about 8–11 GB on the internal disk. `find_sdk.py` follows whatever `xcode-select -p` returns, so this should work, but it is untested.

### Gaps
- No measured slowdown was found for Chromium (or any large C++ build) on an external Thunderbolt or USB SSD vs internal on Apple Silicon.
- No source covers case-sensitive APFS issues with Chromium on macOS.

---

## 6. A prebuilt-framework split: Swift UI on a prebuilt Chromium (CEF, content_shell, Electron, ADK)

### Takeaway
There is no public "Arc Development Kit" equivalent: The Browser Company's ADK is internal and unreleased. CEF ships prebuilt macOS arm64 frameworks (312 MB standard, 135 MB minimal, Oct 22 2026), so you avoid compiling Chromium. But on macOS, embedding a CEF browser into your own NSView (`parent_view`) forces Alloy style, and Alloy blocks `chrome://extensions`. Full Chrome-extension support needs Chrome-style windows built with CEF's Views framework, which show some Chrome UI.

Electron supports only a subset of extension APIs, unpacked extensions only, and explicitly not the Web Store. content_shell is the content layer without the chrome/ layer where extensions live.

The realistic split is:
- (a) CEF Chrome style hosted in a CEF Views window, with your UI drawn around or over it; or
- (b) a full Chromium fork built once in CI (or on a rented Mac) that exposes a C/ObjC bridge to a separately compiled Swift UI bundle.

No public project doing (b) was found.

### Cited Findings
- **CEF `cef_window_info_t` on macOS:** "Alloy style will always be used if |windowless_rendering_enabled| is true or if |parent_view| is provided." — [CEF include/internal/cef_types_mac.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types_mac.h)
- **CEF runtime styles:** "Chrome style provides the full Chrome UI and browser functionality whereas Alloy style provides less default browser functionality but adds additional client callbacks and support for windowless (off-screen) rendering." Views-framework apps choose the style per window and per BrowserView. "a Chrome style Window can host at most one Chrome style BrowserView but potentially multiple Alloy style BrowserViews." — [CEF include/internal/cef_types_runtime.h](https://github.com/chromiumembedded/cef/blob/master/include/internal/cef_types_runtime.h)
- **CEF architecture:**
  - The Chrome runtime adds "datalist/autofill, extensions, gamepad, webhid, webmidi" plus standard Chrome toolbars and dialogs.
  - It "requires use of the Views framework" and does not support off-screen rendering.
  - Since M125 (mid-2024) Alloy is split into style and bootstrap; since M128 the Alloy bootstrap is removed.

  — [CEF architecture](https://chromiumembedded.github.io/cef/architecture)
- **Alloy and `chrome://extensions`:** navigation to `chrome://extensions` "is blocked in an Alloy-style browser". The issue was closed as not planned. — [CEF issue #3859](https://github.com/chromiumembedded/cef/issues/3859)
- **Extensions need Chrome-style windows:** the CEF maintainer, on the forum, says extensions are supported only with Chrome-style windows showing some Chrome UI (like the toolbar). Extensions without Chrome UI dependencies may work in Alloy. This is from a search-result summary; the forum page refused connection on fetch. — [CEF Forum: Queries on chrome extensions](https://www.magpcss.org/ceforum/viewtopic.php?f=6&t=20003)
- **CEF's Alloy extension API:** `CefExtensionHandler` was marked "deprecated and will be removed in ~M127". Mirrored API docs; the exact removal release is unverified. — [OpenD mirror of cef_extension_handler_t](https://opendlang.org/library/arsd.webview.cef_extension_handler_t.html)
- **CEF prebuilt binaries for macOS arm64** (from the Spotify CDN index, 2026-10-22). Version: CEF 156.0.7+g47dbc1d, Chromium 156.0.8078.17, stable.

  | Package | Size |
  |---|---|
  | standard | 312.1 MB (.tar.bz2) |
  | minimal | 134.8 MB |
  | client | 135.4 MB |
  | release_symbols | 2,124 MB |

  — [CEF automated builds (index.json)](https://cef-builds.spotifycdn.com/index.json), [CEF builds page](https://cef-builds.spotifycdn.com/index.html)
- **Electron:** "Electron supports a subset of the Chrome Extensions API, primarily to support DevTools extensions and Chromium-internal extensions". "Electron does not support arbitrary Chrome extensions from the store, and it is a non-goal". It loads only unpacked extensions (`.crx` files do not work). — [Electron docs: Chrome Extension Support](https://github.com/electron/electron/blob/main/docs/api/extensions.md)
- **Extensions live in chrome/:** an older CEF issue says extension support was an architectural problem because the extension code lives in Chromium's `chrome/` layer, which content-layer embedders such as content_shell and old Alloy do not include. — [CEF issue #1947](https://github.com/chromiumembedded/cef/issues/1947)
- **Arc's ADK:** an internal SDK that "allows iOS engineers to quickly prototype interfaces without having to work with C++". The Browser Company said open-sourcing Arc would mean opening ADK, which it considers core to its value. ADK is shared between Arc and Dia. Arc for Mac and Windows is built on Chromium and written in Swift. (Reporting from May 2025.) — [heise: Arc – The Browser Company considers sale or open sourcing](https://heise.de/-10414231), [PCWorld: Arc browser in stasis](https://www.pcworld.com/article/2795432/the-beloved-arc-browser-is-in-stasis-cast-aside-for-an-ai-future.html)
- **Swift wrapper:** a third-party Swift wrapper for CEF exists (`cef.swift`). Its maintenance status was not checked. — [lvsti/cef.swift](https://github.com/lvsti/cef.swift)

### Inferences
- **CEF Alloy, the fastest path to "Swift UI + Chromium, no compile":** link the prebuilt CEF framework (≈312 MB download, no Chromium build) into a SwiftUI/AppKit app with `parent_view` set to your NSView. You give up Chrome extensions, the Web Store, Chrome autofill, and Chrome's permission UI.
- **CEF Chrome style with extensions:** create the browser through `CefWindow`/`CefBrowserView` (Views). Your Arc-style sidebar must then live in a CEF Views window, or in an overlay or child NSWindow next to it, rather than in a SwiftUI-owned view hierarchy.
  - CEF has an API to hide or minimise the Chrome toolbar (`CefBrowserViewDelegate::GetChromeToolbarType`). That is from memory and was not verified in this research.
  - Extensions that need toolbar UI (action popups) may not work if the toolbar is hidden, per the forum statement above.
- **Building once in CI, then developing the Swift UI locally:**
  - CEF already does this: Spotify CDN binaries, or your own patched CEF built once on a rented Mac or CI using the same chained-job pattern as section 3.
  - For a full Chromium fork, the analogous design is to build `Chromium Framework.framework` in CI with a small exported C/ObjC bridge, then load a separately compiled Swift UI bundle at runtime (`NSBundle`/`dlopen`).
  - Nothing public implements this. It would be a custom project equivalent to rebuilding ADK, and every Chromium update re-triggers the 7–43 h CI build.
- **content_shell:** not a viable base for an extension-capable browser, since it lacks the chrome/ layer. That follows from where the extension code lives.

### Gaps
- No public "Chromium as a library with full Chrome features" project for macOS (beyond CEF Chrome style) was found.
- It was not verified whether CEF Chrome style on macOS 2026 can be embedded inside a non-CEF NSWindow in any supported way. The header says no for `parent_view`.
- No current, primary-source CEF statement listing which Chrome extension APIs work in Chrome style on macOS was found. `chrome://extensions-support` inside a CEF build would show it.
