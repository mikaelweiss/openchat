---
name: release-desktop
description: Build and package macOS app for App Store Connect upload. Use when the user says "release desktop", "release mac", "upload mac", or invokes /release-desktop.
user-invocable: true
---

# Release macOS to App Store Connect

Build, sign, and package the macOS app, then open Transporter for upload.

## User Input

```text
$ARGUMENTS
```

## Process

### Step 1: Show Current State

Run these and report the results:

1. Read the current marketing version from `package.json`
2. Read the current macOS build number: `/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" src-tauri/Info.plist`
3. `git status --short` — ensure working directory is clean (warn if not, but don't block)

Display:
```
Current version: X.Y.Z (macOS build N)
```

### Step 2: Ask About Version Bumping

Use AskUserQuestion with these options:

- **Bump version** — Bump the marketing version (will also bump macOS build number). Ask the user for the new version string as a follow-up.
- **Bump build only** — Just increment the macOS build number (keeps current marketing version)
- **No bump** — Use the current version and build as-is

### Step 3: Run the Script

Based on the user's choice, run the appropriate command:

- **Bump version**: `./scripts/release-desktop.sh --bump-version X.Y.Z`
- **Bump build only**: `./scripts/release-desktop.sh --bump-build`
- **No bump**: `./scripts/release-desktop.sh`

Use a 10-minute timeout — building a universal binary takes a while.

### Step 4: Report Result

If successful:
```
Build complete!
Version X.Y.Z (macOS build N) packaged as OpenChat.pkg.
Transporter should be open — click Deliver to upload.
```

If the script modified version/build numbers, remind the user to commit those changes.

## Error Handling

If the build or packaging fails:
1. Show the error output
2. Common fixes:
   - Missing x86_64 target → `rustup target add x86_64-apple-darwin`
   - Signing identity not found → check certificates: `security find-identity -v -p codesigning`
   - Provisioning profile expired → download new one from developer.apple.com
