# MindMesh Implementation Plan

This plan turns MindMesh into a minimalist local assistant that is usable every day without becoming a cluttered “AI dashboard”.

## Product Goal

MindMesh should behave like a quiet local memory layer:

- capture quickly
- enrich automatically when confidence is high
- ask for review only when needed
- stay searchable first
- use the graph as navigation, not as decoration

If a feature does not improve capture, understanding, connection, or retrieval, cut it.

## Product Principles

1. One primary object per screen.
2. One primary action per screen.
3. Hide secondary metadata until requested.
4. Show recommendations, not every internal model step.
5. Default to calm list views over dense dashboards.
6. Use AI to reduce clicks, not add more UI.

## Final App Shape

Keep only four top-level surfaces:

1. `Inbox`
   Purpose:
   - import notes, images, and audio
   - review new and low-confidence items

   Primary action:
   - `Add`

   Primary content:
   - list of `new` and `needs-review` items

2. `Library`
   Purpose:
   - search and browse ready knowledge

   Primary action:
   - `Search`

   Primary content:
   - compact list of items with title, summary, and match reason

3. `Item`
   Purpose:
   - inspect and improve a single memory item

   Primary action:
   - `Enrich`

   Primary content:
   - summary
   - preview
   - editable source context
   - tags/topics/links in collapsed sections

4. `Map`
   Purpose:
   - navigate relationships around the selected item

   Primary action:
   - `Expand`

   Primary content:
   - selected node and nearest related nodes only

Do not keep a top-level chat screen. Assistant behavior should be embedded into Inbox, Item, and Map flows.

## What To Remove

These should not be part of the main product surface:

- permanent raw chat output as a primary panel
- multiple stats blocks competing for attention
- large always-open forms
- file metadata shown by default
- full-library graph rendering by default
- multiple equal-weight CTAs in one card

## User Flows

### 1. Capture

1. User taps `Add`.
2. User imports a note, image, or audio file.
3. App copies the file into local storage.
4. App creates a new item with minimal default fields.
5. App runs enrichment automatically if the model is attached.
6. If confidence is low, item stays in `needs-review`.
7. If confidence is high, item becomes `ready`.

### 2. Review

1. User opens Inbox.
2. User sees only items in `new` or `needs-review`.
3. User selects one item.
4. User edits transcript, OCR text, or notes if needed.
5. User taps `Enrich` or `Approve`.
6. Item moves to `ready`.

### 3. Retrieval

1. User searches Library.
2. Results prioritize title, summary, content, transcript, topics.
3. User opens one item.
4. User can jump to related items or open the local map.

### 4. Navigation

1. User opens Map from an item.
2. App centers the selected node.
3. App shows one-hop neighbors only.
4. User expands a cluster only when needed.

## Screen Specs

### Inbox

Visible:

- page title
- one `Add` button
- segmented filter: `All`, `New`, `Needs Review`
- review list

Each row shows:

- icon by type
- title
- one-line summary
- confidence or status
- one suggested next action

Hidden behind tap:

- full metadata
- links
- action items

### Library

Visible:

- search field
- optional filter button
- result list

Each result row shows:

- title
- one-line summary
- small type badge
- why it matched

Do not show:

- confidence, file size, timestamps, transcript preview, and tags all at once

### Item

Visible by default:

- title
- status
- summary
- source preview
- one editable source-context area
- one primary `Enrich` button

Collapsed sections:

- tags
- topics
- people
- action items
- related links
- raw file details

### Map

Visible:

- selected node
- nearest related nodes
- relationship labels only for visible edges

Behavior:

- zoom and pan
- dim weak links
- expand neighbors manually
- return to item quickly

Do not render the entire graph by default.

## State Model

Keep the state architecture simple and explicit.

### Persistent State

Stored locally:

- knowledge items
- asset file locations
- item status
- item confidence
- links
- extracted text/transcript/description
- app preferences
- last attached model path if feasible

### Session State

In memory only:

- current selected item
- current search query
- temporary editor text
- current model session
- current enrichment job state
- current graph focus

### Derived State

Computed, not stored:

- inbox items
- review queue
- search result ranking
- one-hop graph neighborhood
- item counts

## Data Model

Keep the core item shape narrow:

- `id`
- `type`
- `title`
- `summary`
- `content`
- `description`
- `transcript`
- `tags`
- `topics`
- `people`
- `actionItems`
- `links`
- `status`
- `confidence`
- `sourceUri`
- timestamps

Do not add more fields unless a real workflow requires them.

## AI Behavior Plan

### Stage 1: safe automation

- title cleanup
- summary generation
- tags/topics extraction
- action item suggestion
- confidence scoring
- related item suggestions

### Stage 2: retrieval intelligence

- summarize this item
- summarize this cluster
- what is unfinished
- what relates to X

### Stage 3: proactive assistance

- suggest duplicate merges
- surface stale `needs-review` items
- weekly review prompt

Do not build proactive behaviors before search and review quality are good.

## Minimal UI System

Use one restrained design system.

Colors:

- one warm background
- one dark text color
- one accent color
- one success color
- one warning color

Typography:

- one sans family
- title
- body
- meta

Spacing:

- `8`
- `16`
- `24`

Controls:

- one primary button
- one secondary button
- one chip style
- one list row style
- one card style

If a screen needs more than this, it is getting noisy.

## Repo Refactor Plan

### Keep

- [`hooks/useKnowledgeBase.ts`](/Users/davindersingh/projects/MindMesh/hooks/useKnowledgeBase.ts)
- [`hooks/useLlama.ts`](/Users/davindersingh/projects/MindMesh/hooks/useLlama.ts)
- [`lib/storage.ts`](/Users/davindersingh/projects/MindMesh/lib/storage.ts)
- [`lib/knowledge.ts`](/Users/davindersingh/projects/MindMesh/lib/knowledge.ts)
- [`types/knowledge.ts`](/Users/davindersingh/projects/MindMesh/types/knowledge.ts)
- [`components/MindMapCanvas.tsx`](/Users/davindersingh/projects/MindMesh/components/MindMapCanvas.tsx)

### Split

Current [`app/index.tsx`](/Users/davindersingh/projects/MindMesh/app/index.tsx) is carrying too many responsibilities. Split it into:

- `components/screens/InboxScreen.tsx`
- `components/screens/LibraryScreen.tsx`
- `components/screens/ItemScreen.tsx`
- `components/screens/MapScreen.tsx`
- `components/items/ItemRow.tsx`
- `components/items/ItemEditor.tsx`
- `components/items/MetadataChips.tsx`
- `components/items/SourcePreview.tsx`
- `components/review/ReviewQueue.tsx`
- `components/layout/TopBar.tsx`

### Remove Later

These look like starter-template leftovers unless reused intentionally:

- [`app/(tabs)/index.tsx`](/Users/davindersingh/projects/MindMesh/app/(tabs)/index.tsx)
- [`app/(tabs)/explore.tsx`](/Users/davindersingh/projects/MindMesh/app/(tabs)/explore.tsx)
- [`app/(tabs)/_layout.tsx`](/Users/davindersingh/projects/MindMesh/app/(tabs)/_layout.tsx)
- [`app/modal.tsx`](/Users/davindersingh/projects/MindMesh/app/modal.tsx)
- [`components/ChatMessage.tsx`](/Users/davindersingh/projects/MindMesh/components/ChatMessage.tsx)
- starter themed/parallax demo components if they are no longer used

## Concrete Build Sequence

### Phase 1: Simplify the shell

- replace the current single giant screen with a top-level navigation model
- make Inbox the default landing screen
- move raw assistant output off the main surface
- reduce visible stats to one small summary line

Success criteria:

- app opens directly into Inbox
- only one primary CTA is visible
- no large dashboard blocks remain

### Phase 2: Finish the review system

- add `new`, `needs-review`, `ready` filtering
- add explicit approve/edit flow
- show one suggested next step per item
- make low-confidence enrichment land in review automatically

Success criteria:

- user can clear Inbox without touching Library or Map

### Phase 3: Improve retrieval

- add ranked search
- add “why this matched”
- add quick related-items jump from item page

Success criteria:

- search becomes faster than browsing the graph for most tasks

### Phase 4: Make the map calm

- center on selected item
- show one-hop neighbors only
- support manual expand
- cluster by topic if possible

Success criteria:

- map stays readable with larger libraries

### Phase 5: Add smart assistant behaviors

- “summarize cluster”
- “what is unfinished”
- “show duplicates”
- “what needs review first”

Success criteria:

- assistant helps with retrieval and curation instead of acting like a generic chatbot

## Acceptance Criteria

The app is in the right shape when:

- a new capture takes one clear action
- the Inbox is the place for unresolved work
- the Library is the place for retrieval
- the Item page is the place for correction and enrichment
- the Map is readable without zooming out into noise
- the user can ignore most metadata unless they need it

## Immediate Next Refactor

Do this next in code:

1. Move the current home screen into `Inbox`.
2. Add a `Library` list screen with ranked search.
3. Move item editing into a dedicated `Item` screen.
4. Change the map to selected-node-plus-neighbors only.
5. Remove raw assistant output from the main layout and keep it behind a debug or details affordance.
