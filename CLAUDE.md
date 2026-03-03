# WoW Settings Backup — Coding Standards

## Project Overview
Cross-platform Electron app for backing up, syncing, and cloud-storing World of Warcraft settings (Interface + WTF folders).

## Tech Stack
- **Framework**: Electron 27+ with React 18 + TypeScript
- **Styling**: Tailwind CSS with WoW-themed dark palette
- **Bundler**: Vite with vite-plugin-electron
- **Compression**: tar-stream + lz4-napi → `.tar.lz4`
- **Config**: electron-store
- **Logging**: winston with daily rotation
- **Cloud**: googleapis (Google Drive), dropbox SDK
- **Peer sync**: bonjour-service (mDNS) + ws (WebSocket)

## Architecture
- `src/main/` — Electron main process (Node.js)
- `src/main/services/` — All business logic as injectable services
- `src/main/serviceContainer.ts` — DI container, creates all services
- `src/main/ipcHandlers.ts` — All IPC handler registrations
- `src/renderer/` — React frontend
- `src/preload.ts` — Secure IPC bridge (contextBridge)

## TypeScript Rules
- Strict mode enabled
- No `any` types — use `unknown` + type guards
- Async/await only (no raw callbacks or `.then()` chains)
- Services use constructor injection via ServiceContainer
- All IPC handlers go in `ipcHandlers.ts`

## React Rules
- Functional components only
- Cleanup listeners on unmount (return unsubscribe from `useEffect`)
- Types in `src/renderer/types.ts`
- Error boundaries around major UI sections

## Tailwind Theme
- Colors: `wow-blue`, `wow-gold`, `wow-dark`, `wow-border`, `wow-text`, `wow-text-muted`
- Component classes: `.btn-primary`, `.btn-secondary`, `.btn-gold`, `.card`, `.input-field`

## Commands
- `npm run dev` — Development with hot reload
- `npm run build` — Production build
- `npm run dist` — Build + create installers
- `npm run typecheck` — TypeScript type checking

## File Naming
- Services: `camelCase.ts` (e.g., `backupService.ts`)
- Components: `PascalCase.tsx` (e.g., `BackupTab.tsx`)
- Types: `camelCase.ts` for type-only files
