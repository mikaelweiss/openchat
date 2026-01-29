#!/bin/bash
#
# iOS Development Setup Script
#
# Fixes:
# 1. Xcode 26.x missing Swift compatibility libraries
#    See: https://github.com/actions/runner-images/issues/13135
# 2. macOS firewall blocking dev server (needed for physical device testing)

set -e

TOOLCHAIN_BASE="$(xcode-select -p)/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift"

LIBS=(
    "libswiftCompatibility50.a"
    "libswiftCompatibility51.a"
    "libswiftCompatibility56.a"
    "libswiftCompatibilityConcurrency.a"
    "libswiftCompatibilityDynamicReplacements.a"
    "libswiftCompatibilityPacks.a"
)

PLATFORMS=(
    "iphonesimulator"
    "iphoneos"
)

for platform in "${PLATFORMS[@]}"; do
    echo "=== $platform ==="
    TOOLCHAIN="$TOOLCHAIN_BASE/$platform"
    SDK="$(xcrun --sdk $platform --show-sdk-path)/usr/lib/swift"

    echo "Toolchain: $TOOLCHAIN"
    echo "SDK:       $SDK"
    echo ""

    for lib in "${LIBS[@]}"; do
        if [ -e "$SDK/$lib" ]; then
            echo "✓ $lib already exists, skipping"
        else
            echo "Creating symlink for $lib..."
            sudo ln -s "$TOOLCHAIN/$lib" "$SDK/$lib"
        fi
    done
    echo ""
done

echo "Done! Swift compatibility libraries are now available for both simulator and device."

echo ""
echo "=== macOS Firewall (for physical device dev) ==="
NODE_PATH="$(which node)"
if [ -n "$NODE_PATH" ]; then
    echo "Adding node to firewall allow list: $NODE_PATH"
    sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$NODE_PATH" 2>/dev/null || true
    sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$NODE_PATH" 2>/dev/null || true
    echo "✓ Node firewall rule updated"
else
    echo "⚠ Could not find node - you may need to manually allow it in System Settings → Network → Firewall"
fi
