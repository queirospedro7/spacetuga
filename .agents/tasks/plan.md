# Implementation Plan — Tuga Multi-Feature Fix

> Build command: `npm run build` (tsc -b && vite build)
> Test command: `node --test scripts/audit.test.mjs` (no browser tests required for these changes)
> All paths are relative to the workspace root `c:\Users\pedro\Desktop\dc`.

---

- [ ] 1. **ITEM 12 — Larger server invite codes**
      Change invite code generation in `server/index.mjs` from 6 hex chars (`TUGA-XXXXXX`) to 16 random base62-like chars using `crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase()` so codes are 16 chars and significantly more secure.
      Files: `server/index.mjs` (line ~1071: `const inviteCode = \`TUGA-...\``)
      Verify: `npm run build` passes. Optionally run `node --test scripts/audit.test.mjs`.

- [ ] 2. **ITEM 11 — Default channel names on server creation**
      In `server/index.mjs` (community:create handler ~line 1084), change default channel names from `"general"` → `"geral"` (text) and `"Lounge"` → `"call"` (voice). The static seed community (`comm-lagg-hq`) already has correct channels; only the creation template needs updating.
      Files: `server/index.mjs`
      Verify: `npm run build` passes. Create a test server in the UI and confirm the two default channels are named "geral" and "call".

- [ ] 3. **ITEM 15c — Fix MaxListenersExceededWarning in server**
      In `server/index.mjs`, the `ws.on('close', ...)` and `res.on('close', ...)` listeners are added to many individual WebSocket and response objects, each an EventEmitter. The warning fires because `wss` or `ws` accumulates listeners. Add `ws.setMaxListeners(20)` immediately after each new WebSocket connection is accepted (inside the `wss.on('connection', ...)` handler), and add `res.setMaxListeners(20)` for HTTP responses. Also add `wss.setMaxListeners(50)`.
      Files: `server/index.mjs`
      Verify: `npm run build` passes. Start the server with `node server/index.mjs` and confirm no MaxListenersExceededWarning in console after multiple connections.

- [ ] 4. **ITEM 9 — Rate limit error message**
      The generic fallback `"Não foi possível concluir. (rate_limit)"` was mentioned by the user. In `src/hooks/use-chat.ts` the toast already says "Demasiadas ações seguidas..." — keep that. The specific case to fix is any place that builds a message by inserting the raw `code` into a string. Search all `src/` for patterns like `` `Não foi possível concluir. (${code})` `` or `'Não foi possível concluir. (' + code + ')'`. The only confirmed source is in `src/sections/Sidebar.tsx` around the `memberError` state: ``setMemberError(`Não foi possível adicionar a pessoa. (${code})`)`` — ensure `rate_limit` is handled before the generic fallback to emit the friendly message "Demasiadas tentativas. Aguarda uns segundos e tenta novamente." Add the `rate_limit` case to every remaining generic error fallback that constructs a user-visible message by interpolating `code` directly (audit `ServerRail.tsx` — already handled; `Sidebar.tsx` member error — needs fixing).
      Files: `src/sections/Sidebar.tsx`
      Verify: `npm run build` passes.

- [ ] 5. **ITEM 4 — Voice call: don't leave on re-click**
      In `src/sections/Sidebar.tsx`, inside `renderChannelItem`, the button's `onClick` handler (line ~512) currently calls `onLeaveVoice()` when `isConnectedVoice` is true. Change it so clicking an already-connected voice channel does nothing (or just navigates to it). Remove the `if (isConnectedVoice) onLeaveVoice()` branch so only non-connected channels trigger `onSelectChannel(chan.id)`. Only the explicit leave button (the "Sair" button at the bottom voice bar and the context menu item) should disconnect.
      Files: `src/sections/Sidebar.tsx`
      Verify: `npm run build` passes. Join a voice channel and click the same channel again — confirm you stay in the call.

- [ ] 6. **ITEM 3 — Remove server image without typing**
      In `src/components/ServerSettingsDialog.tsx`, the "Remover Banner" button already works with a simple click (no text gate). Confirm the same is true for the server icon "Remover Foto" button. If any confirmation text input exists (e.g. the `confirmDeleteServer` state that requires typing for server deletion), verify it is NOT blocking the banner/icon remove buttons. The banner `Input` for URL below the preview can be kept for URL paste, but the "Remover Banner" and "Remover Foto" buttons must work on first click — which they already do. **The delete-server flow does have a text gate** (`confirmDeleteServer` toggle + confirmation text input). The user request is specifically about **image** removal, not server deletion; confirm the image-remove buttons work without any text input. If any text gate blocks them, remove it.
      Files: `src/components/ServerSettingsDialog.tsx`
      Verify: `npm run build` passes. Open server settings, upload a banner, click "Remover Banner" — it clears immediately.

- [ ] 7. **ITEM 1 — Banner color picker + fix `background` shorthand React warnings**
      In `src/components/ServerSettingsDialog.tsx`:
      a) Add a `serverBannerColor` state (default `''`). Add a small color picker (use `<input type="color">` or a palette of swatches) below the "Banner do Servidor" section. When a color is picked, set `serverBannerColor` and clear `serverBannerUrl`. When saving, pass `bannerColor` alongside `bannerUrl` in `api.updateCommunity`. Add `bannerColor?: string` to the `Community` type in `src/types.ts` and persist it in `server/index.mjs`.
      b) In `src/sections/Sidebar.tsx` (banner header div, line ~308), replace the shorthand `background:` style with individual `backgroundColor` / `backgroundImage` / `backgroundPosition` properties to fix React warnings. Apply `bannerColor` as `backgroundColor` when no `bannerUrl` is present.
      c) In `src/sections/SettingsPage.tsx` (profile banner preview card, ~line 780), replace the shorthand `background:` with `backgroundColor` + `backgroundImage` + `backgroundPosition` separately.
      d) In `server/index.mjs`, ensure `community:update` handler accepts and stores `bannerColor` (validate it as a CSS hex color or `linear-gradient`).
      Files: `src/components/ServerSettingsDialog.tsx`, `src/sections/Sidebar.tsx`, `src/sections/SettingsPage.tsx`, `src/types.ts`, `server/index.mjs`
      Verify: `npm run build` passes. No React warnings about `background` shorthand in console.

- [ ] 8. **ITEM 2 — Member profile photos missing in server members list**
      The `memberList` in `src/components/ServerSettingsDialog.tsx` iterates `community.members` (array of user IDs) and calls `allUsers.find(u => u.id === userId)`. Offline members not in `allUsers` get a fallback object with no `avatarUrl`. This is correct. The actual bug is in the **Sidebar's voice channel participant avatars** and the **ChatPanel member panel** where `users` (the `PublicUser[]` prop) may not include offline users. The server's `visibleUsersFor()` only returns users who share a community or have DM history — offline members of a server that the viewing user shares may be missing. The fix is: the server's `ready` / `users` payload already includes all shared-community members; ensure the client's `allUsers` array passed to `ServerSettingsDialog` and `CallStage` is the full `users` list from `useChat`. Audit `Home.tsx` prop passing: `ServerSettingsDialog` receives `allUsers={users}` from `Sidebar` props, and `Sidebar` receives `users={users}` from `Home.tsx`. Check that `ServerRail` members panel avatars also use `backgroundImage`. The main rendering in `ServerSettingsDialog.tsx` member list uses `backgroundImage: user.avatarUrl ? url(${user.avatarUrl}) : undefined` — this is correct. The Sidebar voice channel peer list uses `backgroundImage: userObj.avatarUrl ? url(${userObj.avatarUrl}) : undefined` — also correct. **Root issue**: the voice channel peer render in `Sidebar.tsx` (around line ~460) uses a small 4×4 div with inline `backgroundImage` style for `avatarUrl` — this is the correct pattern. Check that `users` prop contains `avatarUrl`. The `publicUser()` function in `server/index.mjs` passes `avatarUrl` through (it uses `safeUser()` which only strips `salt`, `hash`, `blockedUserIds`, `authVersion`). The bug is that the server sends some user objects without `avatarUrl` when it hasn't been set — this is expected. **The real fix needed**: In the Sidebar voice channel peer avatars, the `div` uses `style={{ backgroundImage: userObj.avatarUrl ? ... }}`. When `avatarUrl` is `undefined`, the fallback letter is shown. The issue per user report is that profile photos are **not appearing at all** — this means avatarUrl exists on the profile but isn't rendering. Look at the CSS: the voice peer avatars in Sidebar use `w-4 h-4` (16px) divs — too small for `backgroundImage` to be visible if `backgroundSize` is not set. Add `backgroundSize: 'cover'` and `backgroundPosition: 'center'` to those style objects. Do the same audit for ChatPanel member panel.
      Files: `src/sections/Sidebar.tsx`, `src/sections/ChatPanel.tsx`
      Verify: `npm run build` passes. Set an avatar in profile settings and rejoin a voice channel — profile photo should display.

- [ ] 9. **ITEM 7 — Logout confirmation popup**
      In `src/components/SettingsNavigation.tsx`, the "Terminar sessão" button calls `onLogout` directly. Wrap it in an `AlertDialog` (already in `package.json` via `@radix-ui/react-alert-dialog`): clicking "Terminar sessão" opens the dialog with title "Tens a certeza que queres terminar sessão?", description "Perderás a sessão atual.", "Cancelar" and "Terminar sessão" buttons. Only confirm calls `onLogout()`. Also apply the same pattern to `src/components/ProfileModal.tsx` (the LogOut button at line ~330) and `src/components/SystemSettingsDialog.tsx` (the "Terminar sessão" button).
      Files: `src/components/SettingsNavigation.tsx`, `src/components/ProfileModal.tsx`, `src/components/SystemSettingsDialog.tsx`
      Verify: `npm run build` passes. Click "Terminar sessão" — confirmation dialog appears before logout.

- [ ] 10. **ITEM 8 — Styled selects everywhere**
       Find all raw `<select>` elements in `src/`. Results: `src/sections/Sidebar.tsx` has a `<select>` in the "Create Channel" dialog for category selection (line ~1289). Replace it with `<StyledSelect>` from `src/components/StyledSelect.tsx`. Audit all other files for any remaining `<select>` tags. The `StyledSelect` component already wraps shadcn `Select`. Ensure it also has dark-themed styling (the shadcn Select components in `CallSettingsDialog.tsx` are already using `SelectTrigger` with className — those are fine). Verify `StyledSelect` renders with consistent `rounded-xl border-border bg-background text-xs` classes.
       Files: `src/sections/Sidebar.tsx`, `src/components/StyledSelect.tsx` (minor class improvements if needed)
       Verify: `npm run build` passes. Open "Criar Canal" dialog in a server with categories — the category dropdown is styled like the rest of the UI.

- [ ] 11. **ITEM 10 — Pages appearing behind other elements (z-index fix)**
        The Settings page renders at `z-[80]`, Admin Panel at `z-[80]`, CallOverlay at `z-50`. The issue is that Settings/Admin render as siblings in `Home.tsx` (rendered AFTER the main layout `div`). They already use `fixed inset-0 z-[80]` which should cover everything. Check if `ServerRail` (the leftmost rail) has `z-30` — it does. The `Dialog` overlay is `z-[200]` and content `z-[201]`, which means dialogs WITHIN the settings page are fine. The reported bug "pages appear from underneath" is likely because in mobile view, the Settings page renders inside the main `<>` fragment AFTER the `div.app-main-layout`, and the main div does NOT use `overflow:hidden` at the settings layer — `fixed inset-0` should always overlay. The actual issue: the `SettingsPage` and `AdminPanel` are rendered **conditionally** inside `settingsView`/`adminView` variables and placed AFTER the main layout `<div>`. This should be fine with `fixed inset-0`. Check if any parent has `transform`, `filter`, or `perspective` CSS that creates a new stacking context and traps `fixed` children. The `app-main-layout` div uses `overflow-hidden` but NO transform. The `<motion.div>` animations in various components may create stacking contexts. Ensure the Settings/Admin portal renders at body level. **Fix**: Wrap `settingsView` and `adminView` in a React Portal (`ReactDOM.createPortal(..., document.body)`) so they render directly on `document.body` and bypass any parent stacking context. This is the proper fix.
        Files: `src/pages/Home.tsx`, `src/sections/SettingsPage.tsx` (ensure `fixed inset-0 z-[80]`), `src/sections/AdminPanel.tsx` (ensure `fixed inset-0 z-[80]`)
        Verify: `npm run build` passes. Open Settings — it should cover the entire screen including the server rail.

- [ ] 12. **ITEM 5 — Screen share expandable/collapsible panel**
        In `src/sections/CallStage.tsx`, the current screen share section is a large `div` that shows when `showLocalScreen || remotePresenter`. Add three states: `screenPanelSize: 'normal' | 'large' | 'hidden'` (default `'normal'`). Add control buttons overlaid on the screen share panel:
        - "Expandir" button: sets `screenPanelSize` to `'large'` (increases `max-h` from `72vh` to `85vh` and `max-w` from `5xl` to `full`)
        - "Reduzir" button: sets `screenPanelSize` to `'normal'`
        - "Ocultar" button: sets `screenPanelSize` to `'hidden'` (panel collapsed/hidden, show a small "Ver partilha" pill button that restores it)
        Keep the existing "Ecrã completo" button. Do NOT call `requestFullscreen` for the expand feature — it's an inline resize only.
        Files: `src/sections/CallStage.tsx`
        Verify: `npm run build` passes. Start screen share — three buttons appear; clicking "Expandir" grows the panel, "Ocultar" hides it, a restore button brings it back.

- [ ] 13. **ITEM 6 — Server folder grouping**
        Add server folders to `src/sections/ServerRail.tsx`. Persist in localStorage under key `tuga.server_folders`.
        Data model: `type ServerFolder = { id: string; name: string; serverIds: string[]; color?: string }`.
        - Add `folders` state, loaded from localStorage.
        - A folder renders as a stacked icon button (up to 4 server icons at 25% each overlaid, or just the first icon with a badge).
        - Clicking a folder button toggles expand/collapse showing individual server icons below it.
        - Context menu on a server button: add "Criar pasta" item → opens a small dialog to name the folder; the dragged server and target server are grouped.
        - Context menu on a folder: "Renomear", "Adicionar servidor" (opens list), "Remover pasta" (disperses servers).
        - Dragging a server onto another server creates a folder (same drag-and-drop hooks already exist).
        - The existing `customOrder` in localStorage already reorders servers; folders should sit at a position in that order.
        Files: `src/sections/ServerRail.tsx`
        Verify: `npm run build` passes. Create a folder from context menu, confirm it persists after page refresh.

- [ ] 14. **ITEM 13 — Downloads page content (already exists, enhance)**
        The Downloads section already exists in `src/sections/SettingsPage.tsx` (`activeTab === 'downloads'`). It shows Windows + Web/Mobile cards. Enhance it to add macOS and Linux placeholder cards with clear "Em breve" badges, and improve the card layout. Add a direct link to the running web URL. No new page/route needed — this lives inside the existing settings Downloads tab.
        Files: `src/sections/SettingsPage.tsx`
        Verify: `npm run build` passes. Open Settings → Aplicação — four platform cards visible (Windows, macOS, Linux, Web).

- [ ] 15. **ITEM 15a+15b — Fix React warnings (DialogDescription + Select controlled state)**
        a) In `src/sections/Sidebar.tsx`, `src/components/ServerSettingsDialog.tsx`, `src/sections/SettingsPage.tsx`, `src/sections/AdminPanel.tsx`, and anywhere `DialogContent` is used without a `DialogDescription` — add a visually-hidden `DialogDescription` or the `aria-describedby={undefined}` prop to each `DialogContent`. Use a shared pattern: import `DialogDescription` and add `<DialogDescription className="sr-only">...</DialogDescription>` inside each `DialogHeader` that lacks one.
        b) In `src/components/CallSettingsDialog.tsx`, the `Select` for audio/video devices uses `value={props.audioDeviceId || undefined}` — when `audioDeviceId` is `''` (empty string), it passes `undefined` making it uncontrolled initially then switches to controlled when a value is chosen. Fix: always pass `value={props.audioDeviceId}` and use an empty placeholder `SelectItem` with value `''` so the Select is always controlled. Same fix for `videoDeviceId`.
        Files: `src/components/CallSettingsDialog.tsx`, `src/sections/Sidebar.tsx`, `src/components/ServerSettingsDialog.tsx`, `src/sections/SettingsPage.tsx`
        Verify: `npm run build` passes; no React warnings in browser console about DialogDescription or Select controlled/uncontrolled switching.

- [ ] 16. **ITEM 14 — Login/Register page redesign**
        The AuthForm is already well-designed (clean card, proper inputs, tabs, dark theme). The user's complaint was "random text" — check the left panel for lorem ipsum. The current left panel text is "O teu espaço para conversar.", "Mensagens, servidores e chamadas num só lugar." — these are intentional brand messages, NOT lorem ipsum. **The actual issue is the layout on mobile**: on mobile it's just the right panel (left panel is `hidden md:flex`), which already looks clean. Review the full AuthForm — it uses proper shadcn Input and Labels. The user may want a simpler single-panel approach. **Decision**: keep the two-panel desktop layout but make the left panel more minimal; remove the footer text "Ao continuar, acedes..."; ensure the form card has a subtle border; make the tab switcher more visually distinct. These are polish changes to `src/sections/AuthForm.tsx`.
        Files: `src/sections/AuthForm.tsx`
        Verify: `npm run build` passes. Auth page renders clean at both mobile and desktop widths.

---

## Verification

After all items are complete:

```
npm run build
```

Expected: exit code 0, no TypeScript errors, Vite bundle successful.

```
node --test scripts/audit.test.mjs
```

Expected: all audit tests pass.
