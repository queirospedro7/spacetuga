# Nebula Chat UI — Implementation Review

All six files exist and implement their described sections. The WebRTC signaling roles are correct in structure, but a null-PC race window, a broken idempotency guard, and a missing unread-count update path are blocking issues.

**Watch for:**
- **confirmed** — `startCall` stores `pc: null as unknown as RTCPeerConnection`; the `signal` handler has a null guard but still silently drops early ICE candidates, and the `call:accept` idempotency guard is logically dead and will fail to prevent PC overwrites on duplicate events.
- **confirmed** — Unread badges accumulate on the active conversation because Sidebar has no way to know which conversation is currently open; `lastSeen` is only updated on click.
- **confirmed** — Typing signals fire on every keystroke with no client-side rate-limiting.
- **confirmed** — `build.txt` was not found in `.agents/tasks/`; build success cannot be verified.

**Verdict**: NEEDS_CHANGES

---

## High-level view

`use-chat.ts` owns all WebSocket subscriptions and WebRTC state with correct cleanup. The caller-side flow (create PC and send offer after receiving `call:accept`) and the acceptee-side flow (`acceptCall` creates the PC, `signal` handler awaits the offer) match the protocol. The gap is the window between `startCall` and `call:accept`: `activeCall.pc` is a null cast, the null guard in `signal` silently drops any ICE candidate that arrives early, and the idempotency guard in `call:accept` is written against `call.pc` being non-null — which never happens given `startCall`'s null cast — so duplicate `call:accept` events will overwrite a live PC.

Sidebar tracks unread counts entirely via a local `lastSeen` Map that updates only on click. Because `activeUserId` is not a prop to Sidebar, there is no mechanism to mark messages read while a conversation is open; the badge accumulates for the duration of the session.

`ChatPanel` calls `onSendTyping()` on every `onChange`, and `use-chat.sendTyping` forwards each call directly to the WebSocket. The receiver-side 2-second auto-clear is a display debounce, not a send throttle; a 100-character message generates 100 WebSocket frames.

The auth error map covers all five required codes with a fallback for unknown ones. Client-side validation in `handleRegister` enforces the username regex, display name presence, and minimum password length before any network call.

---

<details>
<summary>Issues (5)</summary>

1. **Early ICE candidate drop** — Between `startCall` and `call:accept`, `activeCall.pc` is null. The `signal` handler guards with `if (!pc) return`, silently discarding any ICE candidate that arrives in this window. Under server load or out-of-order delivery, the call will never connect. Fix: create the `RTCPeerConnection` eagerly in `startCall`, or queue candidates until the PC is ready.

2. **Dead idempotency guard allows PC overwrite** — In the `call:accept` handler, `if (call.pc && call.pc.signalingState !== 'closed') return` is intended to prevent duplicate `call:accept` events from overwriting a live PC. Because `startCall` always stores `pc: null`, this condition is never true, the guard never fires, and a duplicate `call:accept` will create a second PC and send a second offer over the live connection. Fix: create the PC in `startCall` so the guard can actually see a non-null PC.

3. **Unread badge accumulates on open conversation** — `lastSeen` updates only in `handleSelectUser`. Sidebar receives no `activeUserId` prop, so it cannot detect that the conversation is already visible. Every inbound message while the conversation is open increments the badge. Fix: pass `activeUserId` as a prop to Sidebar and reset `lastSeen` in a `useEffect` whenever `activeUserId` or the message count for that user changes.

4. **Typing flood on every keystroke** — `sendTyping` has no rate-limiting; each character produces a WebSocket frame. The `typingTimerRef` pattern already in the hook can be reused: fire `api.sendTyping` at most once per 500 ms and skip subsequent calls until the timer expires.

5. **Build not verified** — `build.txt` was absent from `.agents/tasks/`. The `null as unknown as RTCPeerConnection` cast passes the TypeScript compiler under `strict`, but other type gaps cannot be ruled out without a build pass.

</details>

---

<details>
<summary>Details</summary>

## Null PC window and broken idempotency guard

`startCall` stores a pending `ActiveCall` with `pc: null as unknown as RTCPeerConnection`. The real PC is created inside `call:accept`, which is the correct protocol sequence — the caller should not send an offer until the callee confirms. The problem is that the server can relay a `signal` (ICE candidate) before it relays `call:accept`, especially under load. The `signal` handler has:

```ts
const pc = call.pc;
if (!pc) return;
```

This guard fires, and the candidate is dropped. The call will stall at ICE gathering because the candidates exchanged in that window are gone. Queuing candidates until the PC is ready (a `pendingCandidates` array, drained after `setRemoteDescription`) is the standard fix. The alternative — creating the PC eagerly in `startCall` — also resolves the duplicate-accept problem described below.

The `call:accept` idempotency guard:

```ts
if (call.pc && call.pc.signalingState !== 'closed') {
  // PC already set up; nothing more to do
  return;
}
```

`call.pc` is always null here (from `startCall`), so this condition is never true. The guard does nothing. If a duplicate `call:accept` event arrives after the first one has already created a PC and sent an offer, the handler runs again, creates a second PC, and sends a second offer over the signaling channel. The callee receives two offers and the signaling state machine breaks. Creating the PC in `startCall` gives the guard a non-null `call.pc` to check, making it effective.

## Unread count visibility while conversation is open

```ts
const unread = messages.filter(
  (m) => m.from !== profile.id && m.at > seenAt
).length;
```

`seenAt` comes from `lastSeen.get(user.id) ?? 0`, and `lastSeen` is written only in `handleSelectUser`. Sidebar does not receive `activeUserId` as a prop, so it has no way to know the conversation is currently visible. Every message that arrives while the conversation is open increments `unread` for that user, and the badge stays non-zero until the user clicks the row again.

The fix requires passing `activeUserId` as a prop and running:

```ts
useEffect(() => {
  if (!activeUserId) return;
  setLastSeen((prev) => new Map(prev).set(activeUserId, Date.now()));
}, [activeUserId, conversations]);
```

This ensures `seenAt` advances whenever new messages arrive on the active conversation.

## Typing signal rate

```ts
// ChatPanel onChange:
onChange={(e) => {
  setText(e.target.value);
  onSendTyping();
}}
```

`use-chat.sendTyping` calls `api.sendTyping(activeUserId)` unconditionally. A user typing a 60-character message sends 60 WebSocket frames. The `typingTimerRef` ref already present in the hook for the receive-side debounce can be repurposed on the send side:

```ts
const sendTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const sendTyping = useCallback(() => {
  if (!activeUserId || sendTypingTimerRef.current) return;
  api.sendTyping(activeUserId);
  sendTypingTimerRef.current = setTimeout(() => {
    sendTypingTimerRef.current = null;
  }, 500);
}, [activeUserId]);
```

This keeps the outbound rate to 2 frames per second regardless of typing speed.

## Test coverage

No tests were added. The call state machine — particularly the null-PC window, the candidate queuing race, and the duplicate-accept scenario — are exactly the kind of async state transitions that are hard to verify by inspection and easy to cover with a hook test using `@testing-library/react-hooks` or Vitest's fake timer support.

</details>

---

<details>
<summary>File map</summary>

| File | What changed |
|---|---|
| `src/hooks/use-chat.ts` | New — central state hook, all WebSocket subscriptions, WebRTC call state machine |
| `src/sections/AuthForm.tsx` | New — login/register tabs with client-side validation and server error mapping |
| `src/sections/Sidebar.tsx` | New — user list with search, sort, unread badges, inline call buttons, profile edit popover |
| `src/sections/ChatPanel.tsx` | New — message thread, auto-scroll, typing indicator, textarea input |
| `src/sections/CallOverlay.tsx` | New — incoming call dialog, active call full-screen overlay with video/voice modes and mute control |
| `src/pages/Home.tsx` | Replaced placeholder — root layout, responsive split between desktop sidebar and mobile Sheet |

Full diff: `git diff main` from `c:\Users\pedro\Desktop\dc\video\nebula`

</details>
