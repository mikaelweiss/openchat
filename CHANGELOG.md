# Changelog

All notable changes to Open Chat will be documented in this file.

## [0.2.2] - TBD
### Added
- Added keyboard shortcut command/control + shift + f to search
- Added keybaord shortcut command/control + option + f to send feedback
- Added a shimmer effect

## [0.2.1] - 2025-08-25
### Added
- Added search to the sidebar

## [0.2.0] - 2025-08-25
### Added
- Beautiful app intro animation
- Added the ability to choose a model for smart title generation
- Better token and cost counting
- Added keyboard command to quickly switch the model (command + j and command + k)

### Fixed
- Fixed issue where changing the star value of a conversation would change it's last updated date
- Fixed issue where clicking the x button wouldn't close the app
- Fixed issue where draging an attachment into the chat would result in multiple duplicates
- Fixed bug where you couldn't start a new chat while waiting for the assistant to finish responding
- Fixed issue where you couldn't send a message to some models because of an issue with reasoning

## [0.1.9] - 2025-08-13
### Added
- Added local LLM support

## [0.1.8] - 2025-08-12
### Added
- Multi-model query support: Send the same message to multiple AI models simultaneously

### Changed
- Users can now type in the input field while the assistant is responding
- Simplified chat interface by removing avatar icons and redundant user/assistant bubbles
- Message bubbles now have a maximum width of 950px and center themselves in the chat area
- Changed model selector keyboard shortcut from Cmd+F to Shift+Cmd+M

## [0.1.7] - 2025-08-11
### Fixed
- Fixed get api key link in onboarding flow

## [0.1.6] - 2025-08-11
### Changed  
- Added keyboard navigation support to EmptyState action buttons

### Fixed
- Fixed get API key button in onboarding flow not working (now uses Tauri shell plugin instead of window.open)

## [0.1.5] - 2025-08-11
### Fixed
- Hopefully fixed auto update

## [0.1.4] - 2025-08-10

### Added
- Random placeholder text in message input (25 different variations)

## [0.1.3] - 2025-08-10

### Added
- App now checks for updates on startup

## [0.1.2] - 2025-08-10

### Changed
- Updated settings modal to use actual version number
- Updated keyboard shortcut input colors to match theme instead of hard-coded orange

## [0.1.1] - 2025-08-10

### Changed
- Conversation settings are now only sent to AI providers when explicitly configured by the user (no default settings sent)

### Fixed
- Fixed slow app startup caused by blocking telemetry initialization

## [0.1.0] - 2025-08-10

First release!!!

