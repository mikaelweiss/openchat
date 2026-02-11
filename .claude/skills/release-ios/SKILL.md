---
name: release-ios
description: Build and upload iOS app to App Store Connect. Use when the user says "release ios", "upload ios", "testflight", or invokes /release-ios.
user-invocable: true
---

# Release iOS to App Store Connect

Archive and upload the iOS app to App Store Connect.

## User Input

```text
$ARGUMENTS
```

## Process

### Step 1: Show Current State

Run these and report the results:

1. Read the current marketing version from `package.json`
2. Read the current iOS build number from `src-tauri/gen/apple/project.yml` (`CFBundleVersion` line)
3. `git status --short` — ensure working directory is clean (warn if not, but don't block)

Display:
```
Current version: X.Y.Z (iOS build N)
```

### Step 2: Ask About Version Bumping

Use AskUserQuestion with these options:

- **Bump version** — Bump the marketing version (will also bump iOS build number). Ask the user for the new version string as a follow-up.
- **Bump build only** — Just increment the iOS build number (keeps current marketing version)
- **No bump** — Use the current version and build as-is

### Step 3: Run the Script

Based on the user's choice, run the appropriate command:

- **Bump version**: `./scripts/release-ios.sh --bump-version X.Y.Z`
- **Bump build only**: `./scripts/release-ios.sh --bump-build`
- **No bump**: `./scripts/release-ios.sh`

Use a 10-minute timeout — building and uploading takes a while.

### Step 4: Report Result

If successful:
```
Upload complete!
Version X.Y.Z (iOS build N) submitted to App Store Connect.
```

If the script modified version/build numbers, remind the user to commit those changes.

## Error Handling

If the archive or upload fails:
1. Show the error output
2. Common fixes:
   - Signing issues → open Xcode, check signing settings: `bun tauri ios open`
   - Duplicate build number → run with --bump-build
   - Network issues → retry
