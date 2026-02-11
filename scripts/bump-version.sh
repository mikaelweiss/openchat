#!/bin/bash
set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: bump-version.sh <version> <build-number>"
    echo "  version:      semver string (e.g. 0.3.0)"
    echo "  build-number: integer build number for iOS (e.g. 4)"
    exit 1
fi

VERSION="$1"
BUILD="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Error: version must be semver (e.g. 1.2.3)"
    exit 1
fi

# Validate build number is an integer
if ! echo "$BUILD" | grep -qE '^[0-9]+$'; then
    echo "Error: build number must be a positive integer"
    exit 1
fi

echo "Bumping to version $VERSION (build $BUILD)"

# 1. package.json
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"
echo "  updated package.json"

# 2. src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"
echo "  updated src-tauri/tauri.conf.json"

# 3. src-tauri/Cargo.toml (only the package version, line 3)
sed -i '' '3s/version = "[0-9]*\.[0-9]*\.[0-9]*"/version = "'"$VERSION"'"/' "$ROOT/src-tauri/Cargo.toml"
echo "  updated src-tauri/Cargo.toml"

# 4. src-tauri/gen/apple/project.yml
sed -i '' "s/CFBundleShortVersionString: [0-9]*\.[0-9]*\.[0-9]*/CFBundleShortVersionString: $VERSION/" "$ROOT/src-tauri/gen/apple/project.yml"
sed -i '' "s/CFBundleVersion: \"[0-9]*\"/CFBundleVersion: \"$BUILD\"/" "$ROOT/src-tauri/gen/apple/project.yml"
echo "  updated src-tauri/gen/apple/project.yml"

# 5. src-tauri/gen/apple/open-chat_iOS/Info.plist
# CFBundleShortVersionString is followed by a <string> on the next line
sed -i '' "/<key>CFBundleShortVersionString<\/key>/{n;s/<string>[0-9]*\.[0-9]*\.[0-9]*<\/string>/<string>$VERSION<\/string>/;}" "$ROOT/src-tauri/gen/apple/open-chat_iOS/Info.plist"
# CFBundleVersion is followed by a <string> on the next line
sed -i '' "/<key>CFBundleVersion<\/key>/{n;s/<string>[0-9]*<\/string>/<string>$BUILD<\/string>/;}" "$ROOT/src-tauri/gen/apple/open-chat_iOS/Info.plist"
echo "  updated src-tauri/gen/apple/open-chat_iOS/Info.plist"

# 6. src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj
sed -i '' "s/MARKETING_VERSION = [0-9]*\.[0-9]*\.[0-9]*/MARKETING_VERSION = $VERSION/g" "$ROOT/src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj"
sed -i '' "s/CURRENT_PROJECT_VERSION = [0-9]*/CURRENT_PROJECT_VERSION = $BUILD/g" "$ROOT/src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj"
echo "  updated src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj"

# 7. Update Cargo.lock
cd "$ROOT/src-tauri" && cargo generate-lockfile 2>/dev/null && cd "$ROOT"
echo "  updated Cargo.lock"

echo ""
echo "Done! All files updated to v$VERSION (build $BUILD)"
