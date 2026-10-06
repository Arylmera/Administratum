# Release pipeline and in-app updates (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A version bump pushed to `main` builds a signed Windows installer on GitHub Actions and publishes it as a
GitHub Release; the installed app offers and installs it from Settings > System.

**Architecture:** `tauri-plugin-updater` reads `latest.json` from the latest GitHub Release. Two Rust commands
(`check_update`, `install_update`) wrap it so the plain-JS UI needs no npm package. A single workflow
(`release.yml`) tags on version change, builds NSIS on `windows-2022`, writes `latest.json`, publishes the release.

**Tech Stack:** Tauri 2, `tauri-plugin-updater` 2, GitHub Actions (`taiki-e/install-action`, `Swatinem/rust-cache`,
`softprops/action-gh-release@v2`), plain ES modules UI.

Spec: `docs/superpowers/specs/2026-10-06-release-and-updates-design.md`.

## Global Constraints

- Version lives only in `src-tauri/Cargo.toml` (`version = "0.1.0"` today).
- Updater endpoint: `https://github.com/Arylmera/Administratum/releases/latest/download/latest.json`.
- Updater public key (commit it): `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMxNjdCODE5OEQxMzVEQkYKUldTL1hST05HYmhud2NGVzhDTDBQWUEzN1dURHE4VjZid0xSSWpsNUluVEE4UTh0bVFMcGhQMUgK`
- Private key: `C:\Users\guill\.tauri\administratum.key`, never copied into the repo. GitHub secret
  `TAURI_SIGNING_PRIVATE_KEY` is already set. Password is empty.
- Bundle stays NSIS with `installer-hooks.nsh`; Windows `installMode: "passive"`.
- Nothing downloads or restarts without a click.
- Settings key for the startup check: `adm.updateCheck`, `'1'` (default) / `'0'`.
- Deviation from spec, deliberate: no `tauri-plugin-process` and no `updater:*` capability. The restart is
  `AppHandle::restart()` (core) and the plugin is only called from Rust.
- Commits: plain `git commit -F - <<'EOF'` here-doc, end with the `Claude-Session:` line, push after each commit.

---

### Task 1: Updater backend and signed bundles

**Files:**
- Modify: `src-tauri/Cargo.toml` (dependencies)
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/main.rs` (two commands, plugin registration, handler list)
- Modify: `C:\Users\guill\.claude\projects\C--Users-guill-Documents-git-Administratum\memory\reinstall-after-each-step.md`

**Interfaces:**
- Produces: command `check_update() -> Result<UpdateInfo, String>` with
  `UpdateInfo { current: String, available: Option<String> }` (serialized as `{ current, available }`), and
  command `install_update() -> Result<(), String>` (downloads, installs, restarts; on Windows the installer exits
  the app itself).

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, after `tauri-plugin-autostart = "2"`:

```toml
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Config**

In `src-tauri/tauri.conf.json`: delete the line `"version": "0.1.0",`. Add a top-level `plugins` object after
`app`, and `createUpdaterArtifacts` in `bundle`:

```json
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEMxNjdCODE5OEQxMzVEQkYKUldTL1hST05HYmhud2NGVzhDTDBQWUEzN1dURHE4VjZid0xSSWpsNUluVEE4UTh0bVFMcGhQMUgK",
      "endpoints": ["https://github.com/Arylmera/Administratum/releases/latest/download/latest.json"],
      "windows": { "installMode": "passive" }
    }
  },
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true,
    "targets": ["nsis"],
    ...rest unchanged
```

- [ ] **Step 3: Commands**

In `src-tauri/src/main.rs`, after `settings_save` (around line 238), add:

```rust
/// Settings > System > Updates: the installed version and the newer one on GitHub Releases, if any.
#[derive(serde::Serialize)]
struct UpdateInfo {
    current: String,
    available: Option<String>,
}

#[tauri::command]
async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(UpdateInfo { current: app.package_info().version.to_string(), available: update.map(|u| u.version) })
}

/// Download, verify (the plugin checks the signature against tauri.conf.json's pubkey), install, restart.
/// On Windows the NSIS installer (passive) closes the app itself before the restart line.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let update = update.ok_or("already up to date")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}
```

Register the plugin and the commands in `main()`:

```rust
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![/* existing list */, check_update, install_update])
```

(append `check_update, install_update` to the end of the existing `generate_handler!` list; keep the rest as is).

- [ ] **Step 4: Build and test**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all existing tests pass, no warnings about unused items.

- [ ] **Step 5: Local signed build**

`createUpdaterArtifacts` makes the bundler require the key. In PowerShell from `src-tauri`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.tauri\administratum.key"; $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""; cargo tauri build
```

Expected: `target/release/bundle/nsis/Administratum_0.1.0_x64-setup.exe` **and** `...setup.exe.sig` exist.
(The variable accepts a path or the key's contents.)

- [ ] **Step 6: Update the reinstall memory**

In the memory file listed above, replace the build instruction with the command from Step 5 and the installer
name with `Administratum_<version>_x64-setup.exe` (version from `src-tauri/Cargo.toml`).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json src-tauri/src/main.rs
git commit -F - <<'EOF'
updater: check and install releases from GitHub

tauri-plugin-updater against the latest release's latest.json, signed
with the project's minisign key; bundles now ship their .sig.

Claude-Session: https://claude.ai/code/session_01PrmyfWvFeLSXmU4tkzd1Zh
EOF
git push
```

---

### Task 2: Updates block in Settings > System

**Files:**
- Modify: `ui/index.html` (System section markup ~line 365, one CSS rule near line 55)
- Modify: `ui/settings.js`

**Interfaces:**
- Consumes: `invoke('check_update')` → `{ current: string, available: string | null }`;
  `invoke('install_update')` → never resolves on success (app restarts), rejects with an error string.

- [ ] **Step 1: Markup**

In `ui/index.html`, inside `<section data-cat="system" hidden>`, after the `Choices` fieldset, add:

```html
          <fieldset class="host-only" id="updates"><legend>Updates</legend>
            <p class="up-line">Version …</p>
            <label class="wide"><span>Check for updates at startup</span><input type="checkbox" name="updateCheck"></label>
            <button type="button" class="clear up-check">Check now</button>
            <button type="button" class="clear up-install" hidden>Install and restart</button>
          </fieldset>
```

Next to the `.icon` rule (line 55), add the badge shown on the gear when an update waits:

```css
  #prefs-open.update { position: relative; }
  #prefs-open.update::after { content: ''; position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--paper-accent); }
```

- [ ] **Step 2: Logic**

In `ui/settings.js`, in `initSettings`, after the `regen.onclick` block, add:

```js
  // Updates (host only): check_update / install_update (main.rs). The startup check only offers; a click installs.
  const up = form.querySelector('#updates'), upLine = up.querySelector('.up-line');
  const upCheck = up.querySelector('.up-check'), upInstall = up.querySelector('.up-install');
  const showUpdate = st => {
    upLine.textContent = st.available ? `Version ${st.current}. Version ${st.available} is available.` : `Version ${st.current}, up to date.`;
    upInstall.hidden = !st.available;
    opener.classList.toggle('update', !!st.available);
  };
  const checkUpdate = () => {
    upCheck.disabled = true;
    return invoke('check_update').then(showUpdate, err => { upLine.textContent = `Update check failed: ${err}`; })
      .finally(() => { upCheck.disabled = false; });
  };
  upCheck.onclick = checkUpdate;
  upInstall.onclick = () => {
    upInstall.disabled = upCheck.disabled = true;
    upLine.textContent = 'Downloading the update…';
    invoke('install_update').catch(err => { upLine.textContent = `Update failed: ${err}`; upInstall.disabled = upCheck.disabled = false; });
  };
  if (!REMOTE) {
    tauri()?.app?.getVersion().then(v => { upLine.textContent = `Version ${v}`; }).catch(() => {});
    if (store.get('adm.updateCheck', '1') !== '0') checkUpdate();
  }
```

In `sync`, after `field('login').disabled = login === null;`:

```js
    field('updateCheck').checked = store.get('adm.updateCheck', '1') !== '0';
```

In `form.onchange`, before the `else if (k in RANGE)` branch:

```js
    else if (k === 'updateCheck') store.set('adm.updateCheck', el.checked ? '1' : '0');
```

In the `.reset` handler, after `setQuestions(true, true);`:

```js
    store.set('adm.updateCheck', '1');
```

- [ ] **Step 3: Check the UI tests still pass**

Run: `node ui/layout.test.mjs && node ui/theme.test.mjs`
Expected: both print their OK lines, exit 0.

- [ ] **Step 4: Rebuild, reinstall, look**

Build with the Task 1 Step 5 command, quit the running app, run the installer with `/S`, relaunch. Open
Settings > System. Before any release exists the line reads `Update check failed: …` (no `latest.json` yet):
expected at this stage. The checkbox toggles and survives a restart.

- [ ] **Step 5: Commit**

```bash
git add ui/index.html ui/settings.js
git commit -F - <<'EOF'
settings: Updates block (version, startup check, install and restart)

Claude-Session: https://claude.ai/code/session_01PrmyfWvFeLSXmU4tkzd1Zh
EOF
git push
```

---

### Task 3: Release workflow and README

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `README.md` (Install > Installer, Build the installer, new Releasing section)

- [ ] **Step 1: Workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release

# A release is a version bump in src-tauri/Cargo.toml pushed to main. The tag job creates v<version> when it is
# new; tags pushed with GITHUB_TOKEN trigger no workflow, so build and release chain on its output.
# workflow_dispatch re-runs a release against an existing tag.
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      tag:
        description: "Existing tag to (re)build and attach to, e.g. v0.2.0"
        required: true

env:
  CARGO_TERM_COLOR: always

jobs:
  tag:
    if: github.event_name == 'push'
    runs-on: ubuntu-22.04
    permissions:
      contents: write
    outputs:
      tag: ${{ steps.t.outputs.tag }}
      tagged: ${{ steps.t.outputs.tagged }}
    steps:
      - uses: actions/checkout@v4
      - id: t
        run: |
          ver=$(grep -m1 '^version' src-tauri/Cargo.toml | sed -E 's/.*"([^"]+)".*/\1/')
          [ -n "$ver" ] || { echo "could not parse version" >&2; exit 1; }
          tag="v$ver"
          echo "tag=$tag" >> "$GITHUB_OUTPUT"
          if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null; then
            echo "tag $tag exists, nothing to release"
            echo "tagged=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git tag -a "$tag" -m "Release $tag"
          git push origin "$tag"
          echo "tagged=true" >> "$GITHUB_OUTPUT"

  build:
    needs: [tag]
    if: always() && (github.event_name == 'workflow_dispatch' || needs.tag.outputs.tagged == 'true')
    runs-on: windows-2022
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.tag.outputs.tag || inputs.tag }}
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: "src-tauri -> target"
      - uses: taiki-e/install-action@v2
        with:
          tool: tauri-cli
      - name: Tauri build
        working-directory: src-tauri
        shell: bash
        # createUpdaterArtifacts makes the bundler fail without the key: no unsigned release can ship.
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ""
        run: cargo tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: windows
          path: |
            src-tauri/target/release/bundle/nsis/*-setup.exe
            src-tauri/target/release/bundle/nsis/*-setup.exe.sig
          if-no-files-found: error

  release:
    needs: [tag, build]
    if: always() && needs.build.result == 'success'
    runs-on: ubuntu-22.04
    permissions:
      contents: write
    env:
      TAG: ${{ needs.tag.outputs.tag || inputs.tag }}
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: dist
      - name: latest.json (updater manifest)
        # Fails if the installer or its signature is missing rather than publish a manifest that breaks updates.
        run: |
          set -euo pipefail
          exe=$(find dist -name '*-setup.exe' | head -1)
          [ -n "$exe" ] && [ -f "$exe.sig" ] || { echo "missing installer or .sig" >&2; find dist -type f >&2; exit 1; }
          jq -n \
            --arg version "${TAG#v}" \
            --arg pub_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg url "https://github.com/${{ github.repository }}/releases/download/$TAG/$(basename "$exe")" \
            --arg sig "$(cat "$exe.sig")" \
            '{version: $version, pub_date: $pub_date, platforms: {"windows-x86_64": {url: $url, signature: $sig}}}' \
            > dist/latest.json
          cat dist/latest.json
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ env.TAG }}
          # A tag with "-" (v0.2.0-rc1) is a pre-release: releases/latest, hence the updater, skips it.
          prerelease: ${{ contains(env.TAG, '-') }}
          generate_release_notes: true
          fail_on_unmatched_files: true
          files: |
            dist/**/*-setup.exe
            dist/**/*-setup.exe.sig
            dist/latest.json
```

- [ ] **Step 2: README**

In `README.md`:
- Under `### Installer` (line ~70), replace the paragraph with:
  `Download Administratum_<version>_x64-setup.exe from the [latest release](https://github.com/Arylmera/Administratum/releases/latest). Windows SmartScreen may say "unknown publisher" (the installer is not code-signed): More info > Run anyway. Later versions install from Settings > System > Updates.`
- Under `### Build the installer`, replace the command block with the Task 1 Step 5 PowerShell command and add one
  line: `Bundles are signed for the updater: the key file must exist (see Releasing). The output is
  src-tauri/target/release/bundle/nsis/Administratum_<version>_x64-setup.exe and its .sig.`
- Add after it:

```markdown
### Releasing

Bump `version` in `src-tauri/Cargo.toml` and push to `main`. The `release` workflow tags `v<version>`, builds the
signed installer on Windows, and publishes a GitHub Release with `latest.json`, which installed copies read to
offer the update. A version with a `-` (`0.3.0-rc1`) becomes a pre-release that the updater never offers. To
rebuild an existing tag: Actions > release > Run workflow, with the tag.

The updater key: private key in `~/.tauri/administratum.key` (back it up; losing it means installed copies can no
longer update), its contents in the repository secret `TAURI_SIGNING_PRIVATE_KEY`, its public key in
`tauri.conf.json`.
```

- [ ] **Step 3: Commit and push (this push releases v0.1.0)**

```bash
git add .github/workflows/release.yml README.md
git commit -F - <<'EOF'
ci: release workflow (tag on version bump, signed NSIS, latest.json)

Claude-Session: https://claude.ai/code/session_01PrmyfWvFeLSXmU4tkzd1Zh
EOF
git push
```

- [ ] **Step 4: Watch the run**

Run: `gh run watch --repo Arylmera/Administratum $(gh run list --repo Arylmera/Administratum --workflow release.yml -L1 --json databaseId -q '.[0].databaseId')`
Expected: `tag`, `build`, `release` green. `gh release view v0.1.0 --repo Arylmera/Administratum` lists
`Administratum_0.1.0_x64-setup.exe`, its `.sig`, `latest.json`.
Then: `curl -sL https://github.com/Arylmera/Administratum/releases/latest/download/latest.json` prints the manifest
with `"version": "0.1.0"`.

---

### Task 4: End-to-end update

- [ ] **Step 1: Install the released v0.1.0**

Download the v0.1.0 installer from the release, quit the app, install with `/S`, relaunch. Settings > System reads
`Version 0.1.0, up to date.`

- [ ] **Step 2: Release v0.1.1**

Set `version = "0.1.1"` in `src-tauri/Cargo.toml`, run `cargo check --manifest-path src-tauri/Cargo.toml` (updates
`Cargo.lock`), commit both (`release: v0.1.1`), push, watch the run as in Task 3 Step 4.

- [ ] **Step 3: Update from the app**

Restart the app (startup check). Expected: dot on the gear; Settings > System reads
`Version 0.1.0. Version 0.1.1 is available.` Click **Install and restart**. Expected: NSIS progress window, the app
comes back, reads `Version 0.1.1, up to date.`, the desktop icon rule still holds (no new desktop shortcut).
