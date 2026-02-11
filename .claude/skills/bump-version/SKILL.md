---
name: bump-version
description: Bump the app version across all config files (package.json, Cargo.toml, tauri.conf.json, Xcode). Use when the user says "bump version", "update version", "new release", or invokes /bump-version.
user-invocable: true
---

# Bump Version

Update the version number across all config files in the project.

## Process

1. Determine the new version and build number:
   - If the user provides a version (e.g. "bump to 0.3.0"), use it
   - If the user says "patch", "minor", or "major", read the current version from `package.json` and calculate the new one
   - Ask the user for the build number (integer for iOS App Store). The build number must always increase — check the current value in `src-tauri/gen/apple/project.yml` on the `CFBundleVersion` line and suggest current + 1

2. Run the bump script:
   ```bash
   ./scripts/bump-version.sh <version> <build-number>
   ```

3. Verify the changes by running:
   ```bash
   grep -n "version" package.json | head -1
   grep -n "version" src-tauri/tauri.conf.json | head -1
   grep -n "version" src-tauri/Cargo.toml | head -1
   grep "CFBundleShortVersionString" src-tauri/gen/apple/project.yml
   grep "MARKETING_VERSION" src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj
   ```

4. Report the results to the user.

## Files Updated

The script updates these files:
- `package.json` — `"version"`
- `src-tauri/tauri.conf.json` — `"version"`
- `src-tauri/Cargo.toml` — `version` (package section only)
- `src-tauri/gen/apple/project.yml` — `CFBundleShortVersionString` + `CFBundleVersion`
- `src-tauri/gen/apple/open-chat_iOS/Info.plist` — `CFBundleShortVersionString` + `CFBundleVersion`
- `src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj` — `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`
- `src-tauri/Cargo.lock` — regenerated
