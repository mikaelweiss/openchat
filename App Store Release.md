# Mac App Store Release Guide

This guide covers the complete process for building and publishing Open Chat to the Mac App Store.

## Prerequisites

- Apple Developer Program membership ($99/year)
- Xcode installed
- Rust with universal target: `rustup target add x86_64-apple-darwin`

## One-Time Setup

### 1. Create Certificates (via Xcode)

1. Open **Xcode**
2. Go to **Settings → Accounts**
3. Select your Apple ID and team
4. Click **Manage Certificates...**
5. Click **+** and create:
   - **Mac App Distribution** (signs the app) — creates "3rd Party Mac Developer Application" certificate
   - **Mac Installer Distribution** (signs the .pkg) — creates "3rd Party Mac Developer Installer" certificate

Verify installation:
```bash
security find-identity -v -p codesigning
```

You should see:
- `3rd Party Mac Developer Application: Weiss Solutions LLC (976SMHMA6R)`
- `3rd Party Mac Developer Installer: Weiss Solutions LLC (976SMHMA6R)`

> **Note:** Apple has two certificate paths: "Apple Distribution" (newer, unified) and "3rd Party Mac Developer" (older, Mac-specific). Both work, but **your provisioning profile must be created with the same certificate you sign with**. This project uses "3rd Party Mac Developer" certificates.

### 2. Create App ID

1. Go to [developer.apple.com/account/resources/identifiers](https://developer.apple.com/account/resources/identifiers)
2. Click **+** to register a new identifier
3. Select **App IDs** → **App**
4. Platform: **macOS**
5. Bundle ID: `org.weisssolutions.openchat`

### 3. Create Provisioning Profile

1. Go to [developer.apple.com/account/resources/profiles](https://developer.apple.com/account/resources/profiles)
2. Click **+** to create new profile
3. Select **Mac App Store Connect** under Distribution
4. Select App ID: `org.weisssolutions.openchat`
5. Select your **3rd Party Mac Developer Application** certificate (must match what you'll sign with!)
6. Name it (e.g., "Open Chat")
7. Download and save to `src-tauri/Open_Chat.provisionprofile`

### 4. App Store Connect Setup

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Create your app or add macOS platform to existing app
3. Bundle ID must match: `org.weisssolutions.openchat`

## Project Configuration

The following files are already configured in the project:

### `src-tauri/entitlements.mac.plist`
Defines sandbox permissions for App Store:
- `com.apple.security.app-sandbox` — Required for App Store
- `com.apple.security.network.client` — Outbound network (API calls)
- `com.apple.security.network.server` — Inbound network (Tauri IPC)
- `com.apple.application-identifier` — Team ID + Bundle ID
- `com.apple.developer.team-identifier` — Team ID

### `src-tauri/Info.plist`
Declares encryption compliance (required for export):
- `ITSAppUsesNonExemptEncryption: false`

### `src-tauri/tauri.conf.json`
Main config with:
- `bundle.macOS.entitlements` — Points to entitlements file
- `bundle.macOS.signingIdentity` — "Apple Distribution" (Tauri's initial signing)
- `bundle.macOS.files.embedded.provisionprofile` — Points to provisioning profile

### `src-tauri/tauri.appstore.conf.json`
App Store-specific overrides:
- Disables auto-updater (Apple handles updates for App Store apps)
- Disables updater artifacts

## Publishing a New Version

### Step 1: Update Version Numbers

Update version in all three locations (must match):

1. `package.json` → `"version": "x.y.z"`
2. `src-tauri/Cargo.toml` → `version = "x.y.z"`
3. `src-tauri/tauri.conf.json` → `"version": "x.y.z"`

Also increment the build number in `src-tauri/Info.plist`:
- `CFBundleVersion` → increment each upload (1, 2, 3, etc.)

> **Note:** The version is what users see (e.g., 0.2.3). The build number is internal and must be unique per upload. If a build is rejected and you re-upload, increment the build number but keep the same version.

### Step 2: Build the App

```bash
bun tauri build --config src-tauri/tauri.appstore.conf.json --bundles app --target universal-apple-darwin
```

The app bundle will be at:
```
src-tauri/target/universal-apple-darwin/release/bundle/macos/Open Chat.app
```

### Step 3: Re-sign the App Bundle

Tauri's automatic signing may not use the correct certificate. Re-sign with the certificate that matches your provisioning profile:

```bash
codesign --deep --force \
  --sign "3rd Party Mac Developer Application: Weiss Solutions LLC (976SMHMA6R)" \
  --entitlements "./src-tauri/entitlements.mac.plist" \
  "./src-tauri/target/universal-apple-darwin/release/bundle/macos/Open Chat.app"
```

### Step 4: Create Signed PKG

```bash
xcrun productbuild \
  --sign "3rd Party Mac Developer Installer: Weiss Solutions LLC (976SMHMA6R)" \
  --component "./src-tauri/target/universal-apple-darwin/release/bundle/macos/Open Chat.app" \
  /Applications \
  "OpenChat.pkg"
```

The signed PKG will be created at the project root:
```
/Users/mikaelweiss/code/openchat/OpenChat.pkg
```

### Step 5: Upload to App Store Connect

**Option A: Using Transporter (Recommended)**
1. Download **Transporter** from the Mac App Store
2. Open Transporter and sign in with your Apple ID
3. Drag `OpenChat.pkg` into Transporter
4. Click **Deliver**

**Option B: Using altool**
```bash
xcrun altool --upload-app --type macos --file "OpenChat.pkg" \
  --apiKey YOUR_API_KEY_ID --apiIssuer YOUR_API_ISSUER
```

### Step 6: Submit for Review

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app
3. The build will appear under **TestFlight** after processing (can take 15-30 min)
4. Test via TestFlight if desired
5. Go to your App Store version
6. Select the build
7. Fill in required metadata:
   - Screenshots (required sizes for Mac)
   - Description
   - Keywords
   - Support URL
   - What's New (for updates)
8. Submit for Review

## Build Commands Reference

| Purpose | Command |
|---------|---------|
| App Store build | `bun tauri build --config src-tauri/tauri.appstore.conf.json --bundles app --target universal-apple-darwin` |
| Re-sign for App Store | `codesign --deep --force --sign "3rd Party Mac Developer Application: Weiss Solutions LLC (976SMHMA6R)" --entitlements "./src-tauri/entitlements.mac.plist" "./src-tauri/target/universal-apple-darwin/release/bundle/macos/Open Chat.app"` |
| Create PKG | `xcrun productbuild --sign "3rd Party Mac Developer Installer: Weiss Solutions LLC (976SMHMA6R)" --component "./src-tauri/target/universal-apple-darwin/release/bundle/macos/Open Chat.app" /Applications "OpenChat.pkg"` |
| Direct distribution (DMG) | `bun tauri build --target universal-apple-darwin` |
| List signing certificates | `security find-identity -v -p codesigning` |

## Important Notes

### Auto-Updates
- **App Store version**: Apple handles all updates. The auto-updater is disabled.
- **Direct distribution**: Uses `tauri-plugin-updater` for self-updates.

### Notarization
- **App Store**: Not required (Apple handles trust verification)
- **Direct distribution**: Required for the app to run without security warnings

### Sandbox
- Mac App Store apps **must** be sandboxed
- The entitlements file defines what the sandboxed app can access
- Test your app thoroughly in sandbox mode before submitting

### Provisioning Profile Expiration
- Provisioning profiles expire after 1 year
- Download a new one from the Developer portal when expired
- Replace `src-tauri/Open_Chat.provisionprofile`

### Certificate Types
Apple has two certificate paths for App Store distribution:

| Certificate | Type | Use |
|-------------|------|-----|
| Apple Distribution | Newer, unified | Works for iOS and macOS |
| 3rd Party Mac Developer Application | Older, Mac-specific | macOS only |

**Important:** The certificate you select when creating your provisioning profile MUST match the certificate you sign with. If you get "Invalid Code Signing" errors, this mismatch is likely the cause.

## Troubleshooting

### "Invalid Code Signing" validation error
The app was signed with a different certificate than what the provisioning profile expects.

**To check which certificate your profile expects:**
```bash
security cms -D -i src-tauri/Open_Chat.provisionprofile | grep -A5 "DeveloperCertificates"
```

**Fix:** Re-sign the app with the correct certificate (Step 3), or create a new provisioning profile linked to the certificate you want to use.

### "No signing identity found"
Run `security find-identity -v -p codesigning` to verify certificates are installed. If missing, recreate them in Xcode → Settings → Accounts → Manage Certificates.

### "Provisioning profile not found"
Ensure the `.provisionprofile` file exists at the path specified in `tauri.conf.json` under `bundle.macOS.files.embedded.provisionprofile`.

### Build fails with target not installed
Run: `rustup target add x86_64-apple-darwin`

### App rejected for sandbox violation
Review `entitlements.mac.plist` and ensure all required permissions are declared. Test the app in sandbox mode before submitting.
