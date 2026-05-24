# MindMesh

A local AI-powered knowledge management app for iOS and Android. All inference runs on-device — no server, no account, no data leaving your phone.

## What it does

- **Chat with an on-device LLM.** Pick from 10 open-weight models (Gemma 4, Qwen3, Qwen2.5, Phi-4, Llama 3.2, SmolLM2) ranging from 847 MB to 4.1 GB.
- **Builds a knowledge base from conversation.** The assistant autonomously saves notes, edits them, links related ideas, and stores persistent facts about you — all through tool calls, no manual filing.
- **Retrieval-Augmented Generation.** Every message is embedded using Nomic Embed Text v1.5 and matched against your knowledge base before inference, so the model always has relevant context.
- **Mind map.** Force-directed graph of knowledge items connected by semantic similarity.
- **Share from anywhere.** iOS share extension and Android intent filter pipe content from any app into MindMesh's inbox.
- **@mention notes in chat.** Type `@` in the composer to search and reference a note inline. Tap the chip in a message bubble to open it.
- **Periodic knowledge digest.** Configurable interval digest surfaces forgotten notes and suggests connections.
- **Everything stays local.** SQLite database, vector index, and model weights all live in the app's sandboxed storage.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React Native, Expo SDK 54, Expo Router 4 |
| On-device LLM | llama.rn 0.12.0-rc.9 (llama.cpp bindings) |
| Embedding model | Nomic Embed Text v1.5 Q4_K_M (84 MB) |
| Database | op-sqlite 16.1.0 + sqlite-vec (vector search) |
| Model format | GGUF Q4_K_M quantization |
| Share extension | Swift ShareViewController (iOS) + ACTION_SEND intent (Android) |

## Model catalog

| Model | Params | Size | Notable |
|---|---|---|---|
| Gemma 4 E2B | 2B | 3.1 GB + 986 MB | Vision support (default) |
| Qwen3 1.7B | 1.7B | 1.1 GB | Fast + reasoning |
| Qwen3 4B | 4B | 2.7 GB | Best quality ≤ 4B |
| Qwen2.5 1.5B Instruct | 1.5B | 986 MB | Fast, strong tool use |
| Qwen2.5 3B Instruct | 3B | 1.9 GB | Multilingual |
| Phi-4 Mini Instruct | 3.8B | 2.5 GB | Top benchmark at ≤ 4B |
| Phi-4 Mini Reasoning | 3.8B | 2.5 GB | Chain-of-thought variant |
| Llama 3.2 1B Instruct | 1B | 847 MB | Fastest, works on older devices |
| Llama 3.2 3B Instruct | 3B | 2.2 GB | General assistant |
| SmolLM2 1.7B Instruct | 1.7B | 1.0 GB | Apache 2.0, HuggingFace |

## Requirements

- Node.js 20 LTS
- Expo CLI
- **iOS:** Xcode 16+, CocoaPods
- **Android:** Android Studio with NDK 27.1.12297006 and SDK Platform 34

## Setup

```bash
git clone <repo>
cd MindMesh
npm install

# iOS
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install --project-directory=. && cd ..
npx expo run:ios --device

# Android
npx expo run:android --device
```

> **Android NDK:** If the build hangs downloading the NDK, install NDK `27.1.12297006` manually via Android Studio → SDK Manager → SDK Tools → NDK (Side by side).

## iOS share extension — one manual step

The share extension requires an App Groups capability that must be added in Xcode:

1. Open `ios/MindMesh.xcworkspace`
2. Select the **MindMesh** target → Signing & Capabilities → **+ Capability** → App Groups
3. Add `group.com.dhuviads.MindMesh.share`
4. Repeat for the **MindMeshShare** target

See [`docs/SHARE_EXTENSION_SETUP.md`](docs/SHARE_EXTENSION_SETUP.md) for full instructions.

## Project structure

```
app/                    # Expo Router routes
  _layout.tsx           # Root layout + provider tree
  index.tsx             # Onboarding gate
  chat.tsx / library.tsx / map.tsx / sessions.tsx
  settings.tsx / models.tsx / inbox.tsx / item/[id].tsx

components/screens/     # Full-screen React components
contexts/
  AssistantContext.tsx   # Central AI state + service orchestrator
  ShareIntentContext.tsx

hooks/
  useChatSessions.ts    # Session + turn CRUD
  useDigest.ts          # Periodic knowledge digest
  useEmbedder.ts        # Nomic embed model lifecycle
  useKnowledgeBase.ts   # Knowledge item CRUD
  useKnowledgeSearch.ts # RAG retrieval + embedding storage
  useLlama.ts           # llama.rn lifecycle + streaming
  useMemory.ts          # User fact storage + recall

lib/
  agent.ts              # Tool definitions (9 tools) + system prompt
  db.ts                 # SQLite init, schema, sqlite-vec, migration
  modelCatalog.ts       # 10-model catalog
  modelStorage.ts       # GGUF download + validation
  theme.ts              # Design tokens

ios/MindMeshShare/      # Swift share extension
android/app/src/main/   # AndroidManifest with intent filters
```

## Agent tools

The assistant has nine tools it calls autonomously:

| Tool | Purpose |
|---|---|
| `create_note` | Save a new knowledge item |
| `search_notes` | Semantic search over the knowledge base |
| `read_note` | Fetch full content of a note by ID |
| `edit_note` | Replace or append to a note |
| `link_notes` | Connect two notes in the mind map |
| `save_memory` | Persist a lasting fact about the user |
| `recall_memory` | Retrieve saved facts by query |
| `create_file` | Write a text/markdown file and attach it as a note |
| `update_profile` | Rewrite the persistent user profile in context |

## Known limitations

- **4 GB devices:** Models ≥ 2.5 GB may be terminated by the OS under memory pressure. Stick to ≤ 1.7 B models on 4 GB RAM devices.
- **No background inference:** iOS suspends CPU-heavy work when the app is backgrounded mid-generation.
- **Vision only on Gemma 4 E2B:** The mmproj file (986 MB) is required. Other models are text-only.
- **Audio/image items:** No on-device OCR or speech-to-text yet. Transcript must be entered manually or via the AI after the model reviews an image.

## License

MIT
