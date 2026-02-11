#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos/Open Chat.app"
PKG_PATH="$ROOT/OpenChat.pkg"
SIGN_APP="3rd Party Mac Developer Application: Weiss Solutions LLC (976SMHMA6R)"
SIGN_PKG="3rd Party Mac Developer Installer: Weiss Solutions LLC (976SMHMA6R)"
ENTITLEMENTS="$ROOT/src-tauri/entitlements.mac.plist"

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

get_macos_build() {
    /usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$ROOT/src-tauri/Info.plist"
}

bump_macos_build() {
    local BUILD=$1
    /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "$ROOT/src-tauri/Info.plist"
    echo "  macOS build number → $BUILD"
}

if [[ -n "$BUMP_VERSION" ]]; then
    echo "==> Bumping marketing version to $BUMP_VERSION"
    "$ROOT/scripts/bump-version.sh" "$BUMP_VERSION"
    BUMP_BUILD=true
fi

if [[ "$BUMP_BUILD" == true ]]; then
    CURRENT_BUILD=$(get_macos_build)
    NEW_BUILD=$((CURRENT_BUILD + 1))
    echo "==> Bumping macOS build number"
    bump_macos_build "$NEW_BUILD"
fi

VERSION=$(get_version)
MACOS_BUILD=$(get_macos_build)

echo "==> Version: $VERSION"
echo "==> macOS Build: $MACOS_BUILD"

echo "==> Building macOS universal app..."
cd "$ROOT"
bun tauri build --config src-tauri/tauri.appstore.conf.json --bundles app --target universal-apple-darwin 2>&1

echo "==> Fixing file permissions..."
chmod -R a+r "$APP_PATH"

echo "==> Updating app bundle build number..."
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $MACOS_BUILD" "$APP_PATH/Contents/Info.plist"

echo "==> Re-signing app bundle..."
codesign --deep --force \
    --sign "$SIGN_APP" \
    --entitlements "$ENTITLEMENTS" \
    "$APP_PATH"

echo "==> Creating signed pkg..."
rm -f "$PKG_PATH"
xcrun productbuild \
    --sign "$SIGN_PKG" \
    --component "$APP_PATH" \
    /Applications \
    "$PKG_PATH"

echo "==> Package created at: $PKG_PATH"
echo "==> Opening Transporter for upload..."
open -a Transporter "$PKG_PATH" 2>/dev/null || open "$(dirname "$PKG_PATH")"

echo "==> Done! Drag the pkg into Transporter and click Deliver."
