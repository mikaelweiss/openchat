---
description: Brainstorm and fully specify an idea, producing a spec ready for implementation.
argument-hint: [issue-id]
---

# Ideation Assistant

Help the user think through and fully specify an idea. The goal: produce a spec so complete that implementation requires zero searching — no codebase exploration, no documentation lookups, no web searches.

The spec is written to a Linear issue, ready for `/implement` to execute.

## Process

### Phase 1: Issue Discovery

Determine which Linear issue this spec will attach to:

**If user provides an issue ID** (e.g., `/ideate DEV-456`):
- Fetch the issue details
- Confirm with user: "Found DEV-456: [title]. Is this the right issue?"

**If user describes a feature/idea without an issue ID**:
- Search Linear for potentially related issues
- If found: "I found DEV-456: [title] which seems related. Is this the issue, or should I create a new one?"
- If not found: "I didn't find an existing issue for this. I'll create one at the end with the spec."

Track whether we're attaching to an existing issue or creating a new one.

### Phase 2: Quick Skim

Before asking any questions, do a fast codebase exploration:
- Identify the general area of code relevant to the idea
- Understand existing patterns and conventions
- Note key files, types, and relationships

This prevents asking obvious questions you should already know. Don't go deep — just enough context to have an informed conversation.

### Phase 3: Structured Brainstorm

Ask numbered questions, 3-5 at a time. The user responds by number.

**What to probe for:**
- **Core behavior** — What exactly should happen? What triggers it?
- **Edge cases** — Errors? Empty states? Boundary conditions?
- **Scope boundaries** — What is explicitly NOT part of this?
- **User experience** — How will someone actually use this?
- **Dependencies** — What does this interact with? What needs to exist first?
- **Constraints** — Performance? Platform limitations? Compatibility?

**Example format:**
```
Based on my skim of the events system, a few questions:

1. **Trigger** — Should this activate on app launch, or only when the user navigates to the events view?

2. **Empty state** — If there are no events, should we show a placeholder message or hide the section entirely?

3. **Caching** — The current EventStorageManager caches aggressively. Should this new feature respect that cache or always fetch fresh?
```

Continue until you have enough to specify implementation without ambiguity.

### Phase 4: Deep Research

Once the design is clear, gather everything needed for implementation:

**Codebase:**
- Find exact files and line numbers that need changes
- Identify all affected types, functions, and relationships
- Note any existing patterns to follow

**Documentation:**
- Use Context7 for relevant library/framework docs
- Web search for APIs, patterns, or techniques discussed
- Pull specific code snippets and API signatures

**For each piece of documentation, include:**
- The relevant snippet or signature
- Why it applies to this implementation
- Link for deeper reading

### Phase 5: Summary Review

Before writing to Linear, present the complete spec to the user for review.

**Format:**
```
Here's the spec I've drafted:

[Full spec in the format below]

---

Does this look right? Let me know if you'd like any changes, or say "looks good" to write it to Linear.
```

**Handle feedback:**
- If user suggests changes, revise and present again
- If user approves ("looks good", "yes", "ship it", etc.), proceed to Phase 6
- Don't write to Linear until explicit approval

### Phase 6: Write Spec to Linear

**If existing issue:** Add a comment with the spec
**If new issue:** Create the issue with the spec as the description

Always include the `<!-- SPEC -->` marker so `/implement` can find it.

## Spec Format

```markdown
<!-- SPEC -->

## Summary
[1-2 sentences describing what this is]

## Behaviors
- [Each bullet = one clear behavior or requirement]
- [Include edge cases inline]
- [Atomic — one idea per bullet]

## Out of Scope
- [Things explicitly not included]
- [Decisions made against during brainstorming]

## Changes Required

### `Path/To/File.swift:42-58`
**Change:** [Description of what to modify]

### `Path/To/OtherFile.swift:120`
**Add:** [Description of what to add]

### `Path/To/NewFile.swift` (new file)
**Create:** [Description of new file purpose]

## Documentation

### [Topic: e.g., "SwiftUI NavigationStack"]

**Relevant API:**
```swift
NavigationStack(path: $path) { ... }
```

**Why:** [Brief explanation of why this applies]

**Link:** [URL for deeper reading]

## Implementation Order
1. [First thing to do]
2. [Second thing]
3. [Continue in logical sequence]
```

## Linear Integration

This project uses Linear for issue tracking.
- Team: Development
- Team ID: 78cc5578-c4f4-4e9d-b3d0-984e7b5089fe

Use the appropriate Linear CLI or API commands to:
- Search for issues: `linear issue list --filter "title contains X"`
- View issue details: `linear issue view DEV-456`
- Create issue: `linear issue create --title "..." --description "..." --team-id 78cc5578-c4f4-4e9d-b3d0-984e7b5089fe`
- Add comment: `linear comment create --issue DEV-456 --body "..."`

## Guidelines

- Spec should be implementable by someone with no prior context
- Every file change must have exact line numbers
- Don't show existing code — just reference locations
- Documentation snippets should be minimal but sufficient
- Implementation order should account for dependencies
- If something was discussed but rejected, put it in "Out of Scope"
- Always verify the issue with the user before writing the spec
