---
name: bump-version
description: Bump the app marketing version across all config files (package.json, Cargo.toml, tauri.conf.json, Xcode). Use when the user says "bump version", "update version", "new release", or invokes /bump-version.
user-invocable: true
---

# Bump Version

Update the marketing version number across all config files in the project. Build numbers are managed separately per-platform by the release scripts.

## Process

1. Determine the new version:
   - If the user provides a version (e.g. "bump to 0.3.0"), use it
   - If the user says "patch", "minor", or "major", read the current version from `package.json` and calculate the new one

2. Run the bump script:
   ```bash
   ./scripts/bump-version.sh <version>
   ```

3. Verify the changes by running:
   ```bash
   grep -n "version" package.json | head -1
   grep -n "version" src-tauri/tauri.conf.json | head -1
   grep -n "version" src-tauri/Cargo.toml | head -1
   grep "CFBundleShortVersionString" src-tauri/gen/apple/project.yml
   grep "MARKETING_VERSION" src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj
   ```

4. Report the results to the user. Remind them that build numbers are bumped automatically by `/release-ios` and `/release-desktop`.

## Files Updated

The script updates these files:
- `package.json` — `"version"`
- `src-tauri/tauri.conf.json` — `"version"`
- `src-tauri/Cargo.toml` — `version` (package section only)
- `src-tauri/gen/apple/project.yml` — `CFBundleShortVersionString`
- `src-tauri/gen/apple/open-chat_iOS/Info.plist` — `CFBundleShortVersionString`
- `src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj` — `MARKETING_VERSION`
- `src-tauri/Cargo.lock` — regenerated

## Build Numbers

Build numbers are **not** updated by this script. They are managed per-platform:
- **iOS build**: Tracked in `project.yml`, `tauri.conf.json` bundleVersion, iOS `Info.plist`, `project.pbxproj`. Bumped by `release-ios.sh`.
- **macOS build**: Tracked in `src-tauri/Info.plist` CFBundleVersion. Bumped by `release-desktop.sh`.
