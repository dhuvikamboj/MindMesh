# Share Extension Setup

All code is in place. One manual step remains in Xcode (App Groups requires your Apple account).

## One-time Xcode step

1. Open `ios/MindMesh.xcworkspace` in Xcode.
2. Select the **MindMesh** project in the navigator.
3. Select the **MindMesh** target → **Signing & Capabilities** tab.
4. Click **+ Capability** → add **App Groups**.
5. Add group: `group.com.dhuviads.MindMesh.share`
6. Repeat steps 3–5 for the **MindMeshShare** target (same group id).
7. Build → `Cmd+B`.

## What was done automatically

| File | Change |
|------|--------|
| `android/app/src/main/AndroidManifest.xml` | `ACTION_SEND` intent-filters for `text/plain` and `image/*` |
| `ios/MindMesh/MindMesh.entitlements` | App Groups key added |
| `ios/MindMeshShare/ShareViewController.swift` | Extension UI — reads shared text/URL, writes to UserDefaults, opens `mindmesh://share-intent` |
| `ios/MindMeshShare/Info.plist` | Extension metadata (activation rules: text + web pages) |
| `ios/MindMeshShare/MindMeshShare.entitlements` | App Groups key for extension |
| `ios/MindMesh.xcodeproj` | `MindMeshShare` app extension target added + embed phase |
| `hooks/useShareIntent.ts` | Cross-platform hook — reads on cold start + listens for deep-link on iOS |
| `contexts/ShareIntentContext.tsx` | Context wrapper so any screen can read pending items |
| `app/_layout.tsx` | `ShareIntentProvider` added |
| `components/screens/ChatScreen.tsx` | `useEffect` pre-fills composer draft from shared content |

## How it works

**Android**  
Share sheet → `ACTION_SEND` → MainActivity (singleTask, reuses existing) →
`react-native-receive-sharing-intent` reads the Intent extras → `useShareIntent` hook →
ChatScreen draft pre-filled.

**iOS**  
Share sheet → MindMeshShare extension → `ShareViewController` writes to
`UserDefaults(suiteName: "group.com.dhuviads.MindMesh.share")` → opens
`mindmesh://share-intent` deep-link → main app receives URL via `expo-linking` →
`useShareIntent` hook reads UserDefaults via `react-native-receive-sharing-intent` →
ChatScreen draft pre-filled.

## Build commands

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```
