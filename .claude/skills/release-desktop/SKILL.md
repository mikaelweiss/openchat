---
name: release-desktop
description: Release a new desktop version through GitHub — bump the marketing version, update the changelog, commit, push, and push a vX.Y.Z tag that triggers the GitHub Actions build (draft release + auto-updater/Homebrew artifacts). Use when the user says "release desktop", "release a new version", "ship a release", "cut a release", or invokes /release-desktop.
user-invocable: true
---

# Release a new desktop version via GitHub

Pushing a `vX.Y.Z` tag triggers the `publish` workflow (`.github/workflows/main.yml`), which builds the Intel + Apple-Silicon apps and creates a **draft** GitHub release with the changelog notes and the auto-updater/Homebrew artifacts.

This is the direct-download / auto-update / Homebrew channel — **not** the Mac App Store. (The App Store `.pkg` + Transporter flow lives in `scripts/release-desktop.sh` and is not used here.)

Run this from the `main` branch.

## User Input

```text
$ARGUMENTS
```

## Process

### Step 1: Show current state

Run and report:

1. Current marketing version from `package.json`.
2. Latest published release: `gh release list -L 1`.
3. `git status --short` — the working tree **must be clean**. If it is dirty, STOP and ask the user to commit or stash first (this skill makes the release commit, and a dirty tree would sweep unrelated changes into it).

Display:
```
Current version: X.Y.Z — latest GitHub release: vA.B.C
```

### Step 2: Choose the new version

Compute the patch / minor / major bumps from the current version and offer them with AskUserQuestion (the user can pick "Other" to type an exact version):

- **Patch** — X.Y.(Z+1)
- **Minor** — X.(Y+1).0
- **Major** — (X+1).0.0

Then verify the chosen version is new:
- `git tag -l vX.Y.Z` must be empty, **and** `gh release view vX.Y.Z` must fail (no such release).
- If either exists, STOP — that version was already released; pick a higher one.

### Step 3: Bump the version

```
./scripts/bump-version.sh X.Y.Z
```

It updates `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, the Xcode/iOS files, and `Cargo.lock` (marketing version only; it does not commit). The CI workflow checks that `Cargo.toml`, `package.json`, and `tauri.conf.json` all match, which this keeps in sync.

### Step 4: Update the changelog

Edit `CHANGELOG.md`: promote the items under `## [Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section (today's date), leaving an empty `## [Unreleased]` header above it.

The `publish` workflow extracts release notes from the `## [X.Y.Z]` section, so it must exist and be non-empty. If `## [Unreleased]` has no entries, ask the user for a one-line summary of what changed and use that.

### Step 5: Commit and push

```
git add -A
git commit -m "chore: release vX.Y.Z"
git push origin HEAD
```

### Step 6: Tag and trigger the build

```
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag push triggers the `publish` workflow via its `push: tags: 'v*'` trigger.

### Step 7: Report

- Show the run: `gh run list --workflow=main.yml -L 1`, and give the run URL: `https://github.com/mikaelweiss/openchat/actions/runs/<run-id>`.
- Tell the user the build takes ~8–9 minutes and creates a **draft** release `vX.Y.Z`. They must open the release and click **Publish** for the auto-updater and Homebrew cask to pick it up.
- Offer to watch it: `gh run watch <run-id> --exit-status`.

## Error Handling

- **Tag/release already exists** — caught in Step 2; pick a higher version.
- **CI fails on version mismatch** (`Cargo.toml` / `package.json` / `tauri.conf.json`) — re-run `./scripts/bump-version.sh X.Y.Z`; one of them was hand-edited out of sync.
- **Release body says "No changelog found for version X.Y.Z"** — the `## [X.Y.Z]` header is missing or misnamed in `CHANGELOG.md`; it must be exactly `## [X.Y.Z] - YYYY-MM-DD`.
- **Workflow didn't trigger after the tag push** — confirm `.github/workflows/main.yml` still has the `push:` / `tags: 'v*'` trigger; without it the workflow is dispatch-only (`gh workflow run main.yml`).
