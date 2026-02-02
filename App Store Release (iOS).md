# App Store Release (iOS)

Guide for releasing Open Chat to the iOS App Store.

## Prerequisites

- **Apple Developer Program** membership ($99/year) - [developer.apple.com/programs](https://developer.apple.com/programs)
- **Xcode** installed (latest version)
- **Transporter** app from Mac App Store - [Download](https://apps.apple.com/us/app/transporter/id1450874784)

## One-Time Setup

### 1. Register Bundle ID

1. Go to [Apple Developer Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. Click **+** → **App IDs** → **App**
3. Set Bundle ID to `org.weisssolutions.openchat` (must match `tauri.conf.json`)
4. Click **Register**

### 2. Create App in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com/apps)
2. Click **+** → **New App**
3. Fill in:
   - **Platforms**: iOS
   - **Name**: Open Chat
   - **Bundle ID**: Select `org.weisssolutions.openchat`
   - **SKU**: `orgweisssolutionsopenchat`
4. Click **Create**

### 3. Configure Xcode Signing

1. Open iOS project:
   ```bash
   bun tauri ios open
   ```
2. Select **open-chat** project → **open-chat_iOS** target
3. Go to **Signing & Capabilities**
4. Check **Automatically manage signing**
5. Select your Team

### 4. Configure App Icon

1. In Xcode, open `Assets.xcassets` → `AppIcon`
2. In Attributes Inspector (right panel), set iOS to **Single Size**
3. Drag a **1024x1024** PNG icon into the slot

## Releasing a New Version

### Step 1: Update Version Numbers

Update version in all three locations (must match):

1. `package.json` → `"version": "x.y.z"`
2. `src-tauri/Cargo.toml` → `version = "x.y.z"`
3. `src-tauri/tauri.conf.json` → `"version": "x.y.z"`

Also increment the build number in `src-tauri/tauri.conf.json`:
- `bundle.iOS.bundleVersion` → increment each upload ("1", "2", "3", etc.)

> **Note:** The version is what users see (e.g., 0.2.3). The build number is internal and must be unique per upload. If a build is rejected and you re-upload, increment the build number but keep the same version.

### Step 2: Build the IPA

```bash
bun tauri ios build --export-method app-store-connect
```

### Step 3: Upload via Transporter

1. Open **Transporter** (download from Mac App Store if needed)
2. Drag in the IPA from:
   ```
   src-tauri/gen/apple/build/arm64/Open Chat.ipa
   ```
3. Click **Deliver**

### Step 4: Configure in App Store Connect

1. Go to your app in [App Store Connect](https://appstoreconnect.apple.com/apps)
2. Click **+** next to iOS App to create a new version
3. Select your uploaded build under **Build**
4. Fill in "What's New in This Version"
5. Update screenshots if UI changed

### Step 5: Submit for Review

1. Ensure all sections show green checkmarks
2. Click **Add for Review**
3. Answer export compliance questions
4. Click **Submit to App Review**

Review typically takes 24-48 hours.

## Required App Store Assets

### Screenshots (Required)
- **iPhone 6.9" or 6.7"**: 1290 × 2796 px (mandatory)
- **iPad 13"**: 2064 × 2752 px (if app runs on iPad)

### Metadata (Required)
- App description
- Keywords (comma-separated, 100 chars max)
- Support URL
- Privacy Policy URL
- Category: Productivity

## Troubleshooting

### "Missing required icon file" error
Ensure the AppIcon in Xcode is set to Single Size mode with a 1024x1024 icon (see One-Time Setup).

### Build rejected for privacy
Ensure you have:
- Privacy Policy URL in App Store Connect
- Privacy Policy accessible from within the app
- Completed the App Privacy section in App Store Connect

## Useful Commands

```bash
# Open iOS project in Xcode
bun tauri ios open

# Build IPA for App Store
bun tauri ios build --export-method app-store-connect

# Regenerate app icons from source
bun tauri icon /path/to/1024x1024-icon.png

# Check IPA contents
unzip -l "src-tauri/gen/apple/build/arm64/Open Chat.ipa"
```

## References

- [Tauri iOS Distribution](https://v2.tauri.app/distribute/app-store/)
- [Tauri iOS Code Signing](https://v2.tauri.app/distribute/sign/ios/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
