# Omakaze mobile

The iOS and Android app for [Omakaze](../README.md): review guided pull requests on your phone, with push notifications. It is an Expo app (SDK 58, Expo Router) that signs in to your Omakaze instance through its OAuth server.

See **[docs/mobile.md](../docs/mobile.md)** for features, signing in, push notifications, building your own copy and the API it uses.

```sh
pnpm install
pnpm ios          # or: pnpm android
pnpm typecheck && pnpm lint && pnpm test
```

Layout:

| Path | Contents |
| --- | --- |
| `src/app/` | Screens (Expo Router): sign-in, the tabs (`(tabs)/pulls`, `activity`, `insights`, `settings`) and the pull request screens (`pr/[owner]/[repo]/[number]/`) |
| `src/components/` | The web app's design as components (`ui.tsx`), the header, tab bar and sheets (`Chrome.tsx`), menus, dialogs and messages (`Overlays.tsx`), markdown, the diff view and conversations |
| `src/lib/` | Sign-in (`oauth.ts`), accounts and tokens (`accounts.ts`, `session.tsx`), the API client and queries, push, the diff model shared with the web viewer, theme |
| `scripts/remix-icons.mjs` | Regenerates `src/components/remix-icons.ts` from the web app's icon set |
| `tests/` | Unit tests of the pure helpers (`node --test`) |
