#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: bump-version.sh <version>"
    echo "  version: semver string (e.g. 0.3.0)"
    echo ""
    echo "Only updates the marketing version. Build numbers are managed"
    echo "per-platform by the release scripts (release-ios.sh, release-desktop.sh)."
    exit 1
fi

VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Error: version must be semver (e.g. 1.2.3)"
    exit 1
fi

echo "Bumping marketing version to $VERSION"

# 1. package.json
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"
echo "  updated package.json"

# 2. src-tauri/tauri.conf.json (version only, not bundleVersion)
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
echo "  updated src-tauri/tauri.conf.json"

# 3. src-tauri/Cargo.toml (only the package version, line 3)
sed -i '' '3s/version = "[0-9]*\.[0-9]*\.[0-9]*"/version = "'"$VERSION"'"/' "$ROOT/src-tauri/Cargo.toml"
echo "  updated src-tauri/Cargo.toml"

# 4. src-tauri/gen/apple/project.yml (marketing version only)
sed -i '' "s/CFBundleShortVersionString: [0-9]*\.[0-9]*\.[0-9]*/CFBundleShortVersionString: $VERSION/" "$ROOT/src-tauri/gen/apple/project.yml"
echo "  updated src-tauri/gen/apple/project.yml"

# 5. src-tauri/gen/apple/open-chat_iOS/Info.plist (marketing version only)
sed -i '' "/<key>CFBundleShortVersionString<\/key>/{n;s/<string>[0-9]*\.[0-9]*\.[0-9]*<\/string>/<string>$VERSION<\/string>/;}" "$ROOT/src-tauri/gen/apple/open-chat_iOS/Info.plist"
echo "  updated src-tauri/gen/apple/open-chat_iOS/Info.plist"

# 6. src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj (marketing version only)
sed -i '' "s/MARKETING_VERSION = [0-9]*\.[0-9]*\.[0-9]*/MARKETING_VERSION = $VERSION/g" "$ROOT/src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj"
echo "  updated src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj"

# 7. Update Cargo.lock
cd "$ROOT/src-tauri" && cargo generate-lockfile 2>/dev/null && cd "$ROOT"
echo "  updated Cargo.lock"

echo ""
echo "Done! Marketing version updated to v$VERSION"
echo "Build numbers are unchanged — they'll be bumped by the release scripts."
