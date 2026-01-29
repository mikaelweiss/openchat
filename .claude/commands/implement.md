# Implement Linear Issue

You are implementing a Linear issue that has a spec from `/ideate`. Execute the spec precisely — no searching required.

## Input
Issue ID: $ARGUMENTS

---

## Phase 1: Fetch & Validate

### Fetch the Issue
Get the issue details and all comments from Linear.

### Find the Spec
Look for the `<!-- SPEC -->` marker in:
1. The issue description
2. Issue comments (most recent first)

### If No Spec Found
**Stop immediately.** Tell the user:

> This issue doesn't have a spec. Run `/ideate $ARGUMENTS` first to create one.

Do not proceed with exploration or planning. The spec is required.

### If Spec Found
Parse the spec sections:
- Summary
- Behaviors
- Out of Scope
- Changes Required (file:line references)
- Documentation
- Implementation Order

---

## Phase 2: Execute

Follow the **Implementation Order** from the spec exactly.

### For Each Change
- Go directly to the file and line number specified
- Make the change described
- Trust the spec — do not search for additional context
- Use the Documentation section for API reference

### Writing Code
- Follow existing patterns in the codebase
- Keep changes focused to what the spec describes
- Do not add extra features or "improvements" beyond the spec

---

## Phase 3: Verify

After all changes are complete:

- [ ] Run the build: `set -o pipefail && xcodebuild -project Strive.xcodeproj -scheme Strive -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 16 Plus,OS=latest' build 2>&1 | xcbeautify`
- [ ] Run tests: `set -o pipefail && xcodebuild test -project Strive.xcodeproj -scheme Strive -destination 'platform=iOS Simulator,name=iPhone 16 Plus,OS=latest' 2>&1 | xcbeautify`
- [ ] Run formatter: `swiftformat .`
- [ ] Confirm all tests pass
- [ ] Review changes against the Behaviors section in the spec

---

## Phase 4: Wrap Up

After verification passes:

### 1. Changelog Update
Ask if the user wants to update the changelog with this change. If yes, add an appropriate entry to the changelog.

### 2. Commit
Run `/commit` to commit the code changes.

### 3. Mark Linear Issue as Done
Ask if the user wants to mark the Linear issue as done.

**Important:** If they say yes, update the issue status to **"Dev"** (development complete), **not** "App Store" (fully released). The "Dev" status indicates the code is implemented and verified, but hasn't been released to users yet.

---

## Guidelines

- **Trust the spec** — It was created with full codebase exploration and research. Don't second-guess it.
- **No searching** — Go directly to the file:line locations. The spec has everything you need.
- **Stay in scope** — Only implement what's in the spec. Anything else belongs in a separate issue.
- **Use the docs** — The Documentation section has the API references and patterns to follow.
- **Verify thoroughly** — Build, test, format. Don't skip verification.
- **Wrap up properly** — Ask about changelog and Linear status after verification succeeds.
