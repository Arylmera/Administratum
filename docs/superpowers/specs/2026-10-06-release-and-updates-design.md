# Release pipeline and in-app updates

Date: 2026-10-06. Status: approved. Model: Token Dashboard's `release-tauri.yml` and `Casks/token-dashboard.rb`.

Goal: ship Administratum as downloadable installers built by CI, with one version number and an in-app updater.
Two phases: phase 1 (Windows) is implemented now, phase 2 (macOS + Linux + Homebrew) is designed here and built later.

## Phase 1: Windows release + updater

### Versioning

- Single source: `version` in `src-tauri/Cargo.toml`. The `version` key is removed from `tauri.conf.json`, so Tauri
  falls back to the Cargo version.
- SemVer. `0.x` while the app settles.
- **A release is a version bump pushed to `main`.** No manual tagging. A tag containing `-` (`v0.2.0-rc1`) is a
  pre-release: published as a GitHub pre-release, never served by the updater (`releases/latest` skips pre-releases).
- The installed version is shown in Settings > System (`getVersion()` from the app API).

### CI: `.github/workflows/release.yml`

Triggers: `push` to `main`, and `workflow_dispatch` with a `tag` input (re-run a release against an existing tag).

1. **`tag`** (ubuntu): read `version` from `src-tauri/Cargo.toml`. If `v<version>` is not on origin, create and push
   an annotated tag and output `tagged=true`; otherwise `tagged=false` and the run stops. Tags pushed with
   `GITHUB_TOKEN` do not trigger workflows, so the next jobs chain on this output, not on a tag event.
2. **`build`** (`windows-2022`): Rust stable, `Swatinem/rust-cache`, prebuilt `tauri-cli` via
   `taiki-e/install-action`, then `cargo tauri build` in `src-tauri` with `TAURI_SIGNING_PRIVATE_KEY` from secrets
   and an empty `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Uploads `bundle/nsis/*-setup.exe` and its `.sig`;
   `if-no-files-found: error`. The UI is static files (`frontendDist: ../ui`), so no Node step.
3. **`release`** (ubuntu): download artifacts, write `latest.json`, create the GitHub Release
   (`softprops/action-gh-release@v2`, `generate_release_notes: true`, `prerelease` when the tag contains `-`),
   attaching the installer, its `.sig` and `latest.json`.

`latest.json` (phase 1):

```json
{ "version": "X.Y.Z", "pub_date": "<UTC ISO>",
  "platforms": { "windows-x86_64": { "url": ".../download/vX.Y.Z/Administratum_X.Y.Z_x64-setup.exe", "signature": "<.sig contents>" } } }
```

The step fails if the installer or its `.sig` is missing, rather than publishing a manifest that breaks updates.

### Bundle config

- Keep **NSIS** (not MSI as in Token Dashboard): the installer hooks in `installer-hooks.nsh` stay.
- `bundle.createUpdaterArtifacts: true`. With it, the bundler refuses to build without the signing key, so a release
  can never ship unsigned (= un-updatable) bundles. Local builds without the key: set the env var from the key file,
  or build with `--config` overriding `createUpdaterArtifacts` to `false`.
- `plugins.updater`: `pubkey` (the public key, safe to commit), `endpoints:
  ["https://github.com/Arylmera/Administratum/releases/latest/download/latest.json"]`,
  `windows.installMode: "passive"` (progress bar, no clicks; the NSIS hooks still run).

### Signing key

- Generated once with `cargo tauri signer generate`, no password. Private key: `~/.tauri/administratum.key`
  (outside the repo, never committed). Its contents go into the GitHub secret `TAURI_SIGNING_PRIVATE_KEY`.
- Losing the private key means installed copies can no longer verify updates: back it up.
- This is the updater's own signature (minisign), unrelated to OS code signing. Windows builds stay without an
  Authenticode certificate: SmartScreen shows "unknown publisher" on first install, "Run anyway" passes it.

### App side

- Dependencies: `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"` (relaunch). Capabilities:
  `updater:default`, `process:allow-restart`.
- Settings > System gains an **Updates** block:
  - installed version;
  - checkbox "Check for updates at startup", on by default, persisted with the other settings (`settings.rs`);
  - button "Check now";
  - when an update exists: "vX.Y.Z available" and a button "Install and restart". It downloads, installs, relaunches.
- Nothing downloads or restarts without a click: the app is an always-on-top widget, a surprise restart is rude.
  The startup check only surfaces the offer (badge on the settings entry + the line in Settings).
- Errors (offline, bad signature, GitHub down) show as one line in the Updates block; the app keeps running.
- Where the check runs: Rust (`tauri_plugin_updater::UpdaterExt`) exposed as two commands, `check_update` and
  `install_update`, so the UI stays plain JS without the plugin's npm package.

### Docs

README: "Install" points to the latest release; "Releasing" explains bump-version-and-push, the secret, and the
pre-release rule.

### Testing

- No version logic of our own: the plugin compares versions and checks signatures. Settings persistence of the new
  checkbox gets a case in the existing `settings.rs` tests.
- CI: the `release` job's own guards (missing installer or `.sig` fails the run).
- End to end, once: publish `v0.1.1`, install it, publish `v0.1.2`, check the app offers and installs it.

## Phase 2: macOS, Linux, Homebrew (later)

### Porting

- `~/.claude`: home directory from `std::env::home_dir` / `dirs`, not `USERPROFILE`.
- Session detection: accept a `claude` binary as well as `claude.exe` (`poller.rs`), with a non-Windows liveness
  check.
- Opening URLs: `tauri-plugin-opener` instead of `cmd /c start`.
- `firewall.rs` (PowerShell): `cfg(windows)` only; its setting hidden on other OSes.
- Orca CLI fallback path per OS.
- Icons: add `icon.icns` and `icon.png`.
- Check on real hardware: frameless always-on-top window, `skipTaskbar`, tray (Linux needs
  `libayatana-appindicator`).

### CI

Matrix gains `macos-14` twice (`aarch64-apple-darwin`, `x86_64-apple-darwin`, each with `--target`) and
`ubuntu-22.04`. Copy Token Dashboard's fixes:
- macOS: build `--bundles app`, then retry `--bundles dmg` up to 3 times (`hdiutil` race);
- rename each `.app.tar.gz` (+ `.sig`) with its arch before upload (flat asset namespace);
- Linux apt deps: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev`.

Outputs: DMG (both arches), AppImage, .deb. `latest.json` gains `darwin-aarch64`, `darwin-x86_64`,
`linux-x86_64`, and fails if any of them is missing.

### Homebrew (macOS without an Apple Developer account)

- Tap repo `Arylmera/homebrew-administratum`, cask `Casks/administratum.rb` kept in this repo as the template:
  `arch arm: "aarch64", intel: "x64"`, URL to the DMG of the release, per-arch `sha256`, `livecheck` on GitHub latest,
  and a `postflight` running `xattr -dr com.apple.quarantine` on the installed app. That removes Gatekeeper's
  "damaged app" block without notarization.
- In-app updates after that work because the updater downloads outside the browser, so no quarantine flag is set.
- CI job `homebrew` (after `release`, skipped for `-` tags, `continue-on-error`): hash both DMGs, sed version and
  sha256 into the cask, push to the tap with secret `HOMEBREW_TAP_TOKEN`. Skips cleanly when the secret is absent.
- Install: `brew install --cask arylmera/administratum/administratum`.

### Out of scope

winget, Scoop, Authenticode and Apple notarization. Token Dashboard's `winget` job can be copied when wanted.
