#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE_PATH="$ROOT/src-tauri/gen/apple/build/open-chat_iOS.xcarchive"
EXPORT_OPTIONS="$ROOT/scripts/ExportOptions.ios.plist"

BUMP_VERSION=""
BUMP_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --bump-version)
            BUMP_VERSION="$2"
            shift 2
            ;;
        --bump-build)
            BUMP_BUILD=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

get_version() {
    grep -m1 '"version"' "$ROOT/package.json" | sed 's/.*"\([0-9.]*\)".*/\1/'
}

get_ios_build() {
    grep 'CFBundleVersion' "$ROOT/src-tauri/gen/apple/project.yml" | sed 's/.*"\([0-9]*\)".*/\1/'
}

bump_ios_build() {
    local BUILD=$1
    sed -i '' "s/\"bundleVersion\": \"[0-9]*\"/\"bundleVersion\": \"$BUILD\"/" "$ROOT/src-tauri/tauri.conf.json"
    sed -i '' "s/CFBundleVersion: \"[0-9]*\"/CFBundleVersion: \"$BUILD\"/" "$ROOT/src-tauri/gen/apple/project.yml"
    sed -i '' "/<key>CFBundleVersion<\/key>/{n;s/<string>[0-9]*<\/string>/<string>$BUILD<\/string>/;}" "$ROOT/src-tauri/gen/apple/open-chat_iOS/Info.plist"
    echo "  iOS build number → $BUILD"
}

if [[ -n "$BUMP_VERSION" ]]; then
    echo "==> Bumping marketing version to $BUMP_VERSION"
    "$ROOT/scripts/bump-version.sh" "$BUMP_VERSION"
    BUMP_BUILD=true
fi

if [[ "$BUMP_BUILD" == true ]]; then
    CURRENT_BUILD=$(get_ios_build)
    NEW_BUILD=$((CURRENT_BUILD + 1))
    echo "==> Bumping iOS build number"
    bump_ios_build "$NEW_BUILD"
fi

PBXPROJ="$ROOT/src-tauri/gen/apple/open-chat.xcodeproj/project.pbxproj"
if [[ ! -f "$PBXPROJ" ]]; then
    echo "==> Generating Xcode project from project.yml..."
    (cd "$ROOT/src-tauri/gen/apple" && xcodegen generate)
fi

echo "==> Version: $(get_version)"
echo "==> iOS Build: $(get_ios_build)"

echo "==> Building iOS app..."
cd "$ROOT"
bun tauri ios build --export-method app-store-connect 2>&1

echo "==> Uploading to App Store Connect..."
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -allowProvisioningUpdates \
    2>&1

echo "==> Done! Upload complete."
