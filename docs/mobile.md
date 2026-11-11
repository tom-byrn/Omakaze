# Mobile app

The mobile app (iOS and Android) is in `mobile/`. It is an [Expo](https://expo.dev) app (SDK 58, Expo Router) that talks to your Omakaze instance; there is no separate backend. Use it to review on the go: read guides section by section, mark sections reviewed, comment, approve, and get push notifications.

## Design

The app is drawn like the web app, not with the system's controls: the same color tokens in light and dark (`src/app/globals.css` → `mobile/src/lib/theme.tsx`), Newsreader for headings and buttons, Geist and Geist Mono for text and labels, square corners, 1px borders and dashed rules, square avatars, mono uppercase tags, and the web's Remix icons. The header, bottom navigation, dropdown menus, dialogs, sheets and checkboxes are the app's own components (`mobile/src/components/Chrome.tsx`, `Overlays.tsx` and `ui.tsx`), so iOS does not draw its translucent "Liquid Glass" bars, menus or alerts over them. The icons are generated from the web app's `@remixicon/react` by `node mobile/scripts/remix-icons.mjs`.

## Signing in

1. Enter the address of your instance (`omakaze.example.com`; plain hosts use `https`, local addresses such as `localhost:3000` or `192.168.1.20:3000` use `http`).
2. The app registers itself with the instance's OAuth server (dynamic client registration, once per server) and opens the consent page in the system browser, where you sign in as usual and pick a workspace.
3. The app gets an access token and a refresh token (PKCE, no client secret) that act as you in that workspace. Tokens are kept in the iOS keychain or the Android keystore and refreshed automatically.

Each sign-in is one workspace. **Settings → Add a workspace** signs in to another workspace or server; switch between them in **Settings**. Signing out revokes the tokens and unregisters the device for push. The app's access is listed in **Settings → API tokens & MCP** on the web as an OAuth client named "Omakaze for iOS" or "Omakaze for Android", where it can be revoked.

## Features

| Tab or screen | What it does |
| --- | --- |
| **Reviews** | Pull requests with **Needs my review**, **Mine**, **Assigned** and **All** (with counts), a state and repository filter, search, your section progress and the guide status. Pull to refresh asks GitHub for changes. |
| Pull request | Title, branches, size, requested reviewers, the guide check, the guide's summary and its sections with your review marks (tap the circle to mark one). Banners for drafts, generation in progress (with its progress), failures, outdated guides, versions published since your last visit and missing template sections. The menu switches versions, shares a link, exports Markdown, generates or regenerates with AI, copies the agent prompt and opens the pull request on GitHub or the web. Without a guide: generate one, or copy the agent prompt. |
| Section | The explanation (GitHub-flavored markdown; Mermaid diagrams and math are shown as source) and the diff it covers, with syntax highlighting, context that expands 20 lines at a time and conversations on their lines. **Mark reviewed & next** steps through the guide. Sections that changed since you reviewed them, or since your last visit, are marked. `diff:` links open the file with the lines highlighted. |
| Files | Every changed file with its sections and open conversations; a file opens its whole diff. |
| Comments | Long-press a line to comment on it, or tap line numbers to select several lines. **Suggest change** inserts a `suggestion` block with the selected lines. Conversations can be replied to, resolved and unresolved; your own comments can be deleted (long-press a comment). |
| Review | Comment, approve or request changes on GitHub, or post a comment in the pull request conversation. |
| Share | Create read-only share links (latest version or this version, an expiry, optionally with comments) and revoke them. |
| **Activity** | The workspace activity log; entries about a pull request open it. |
| **Insights** | The insights panels for 7, 30 or 90 days and a repository. |
| **Settings** | Workspaces and servers, notification settings, members, share links, appearance (system, light or dark) and sign-out. Other workspace settings stay on the web. |

What stays on the web: the guide editor, workspace and repository settings (GitHub connections, repositories, AI, automation, templates, tokens, invites and roles), the account page, and CSV downloads of insights.

## Push notifications

The app registers the device with `POST /api/mobile/push-devices` after you sign in (it asks for permission once). A member then gets the notifications they would get by email (a guide is ready for your review, a new version of a guide you reviewed, replies to you, comments and reviews on your pull requests) as push notifications, right away rather than grouped. The same per-kind settings and workspace mutes apply, and **Push notifications** in the app's notification settings turns push off for all workspaces. Tapping a notification switches to its workspace and opens the guide at the section it is about.

The server sends them through Expo's push service (`https://exp.host/--/api/v2/push/send`): only the notification title, text and a link leave your server. `PUSH_NOTIFICATIONS_ENABLED=false` turns push off for the instance (see [Configuration](configuration.md#notifications)). Push needs an app built with an Expo project ID (below).

## Running and building

Requirements: Node.js 22 and pnpm. iOS builds need Xcode 26.4 or later on a Mac (Expo SDK 58; with older Xcode versions the `ExpoModulesJSI` pod fails to compile); Android builds need Android Studio. You can also build in the cloud with [Expo's build service](https://docs.expo.dev/build/introduction/) (`npx eas-cli build`).

To try the app without building it, run `pnpm start` and open it in [Expo Go](https://expo.dev/go) (version 58) on a simulator or phone. Everything works there except push notifications, which need a build of your own.

```sh
cd mobile
pnpm install
pnpm ios        # builds and opens the iOS simulator (expo run:ios)
pnpm android    # builds and opens an Android emulator (expo run:android)
pnpm start      # the development server, after a build is installed
```

To try it against local data, run the demo server from the repository root (`pnpm e2e:serve`, see [Development](development.md#demo-data-and-end-to-end-tests)) and sign in to `localhost:3100` as `demo@omakaze.dev`. On a phone, use your computer's network address instead of `localhost`, and set `APP_URL` to it.

Building your own copy (for your team's App Store or Play Store account, or for push) uses these variables when building:

| Variable | Description |
| --- | --- |
| `OMAKAZE_IOS_BUNDLE_ID` | iOS bundle identifier. Default `dev.omakaze.app`. |
| `OMAKAZE_ANDROID_PACKAGE` | Android package name. Default `dev.omakaze.app`. |
| `EAS_PROJECT_ID` | The Expo project ID (`npx eas-cli init` creates one). Needed for push notifications; without it the app works without push. |
| `OMAKAZE_DEFAULT_SERVER` | Server address pre-filled on the sign-in screen. |

Push on iOS also needs an APNs key and on Android an FCM configuration in the Expo project ([Expo's push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)).

Checks: `pnpm typecheck`, `pnpm lint` and `pnpm test` (unit tests of the app's helpers). The diff model in `mobile/src/lib/diff-model.ts` is a copy of the web viewer's (`src/components/guide/diff-model.ts`); keep them in sync.

## API

The app uses these routes. Like the [REST API](api.md), they need `Authorization: Bearer <token>` with a token bound to one workspace (the app's OAuth access token, or an API token), and answer errors as `{"error": "..."}`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/mobile/me` | The user, the token's workspace, the member's role, followed repositories and what the app may offer (`features.ai`, `features.shareLinks`, `features.push`) |
| `GET /api/mobile/pulls` | Pull requests with `state`, `filter`, `repo` and `q` like the web list, the counts for the state and filter tabs, and `sync=1` (repositories not refreshed in the last minute) or `sync=force` to refresh from GitHub first |
| `GET /api/mobile/pull?repo=owner/name&number=N&v=V` | A pull request, its guide versions, the guide check, and one guide version (the latest without `v`) with its sections, review marks, changes since your review or last visit, files, coverage and members. Records a visit and carries review marks forward, like opening the guide on the web. |
| `GET`, `POST`, `DELETE /api/mobile/share-links` | List active links (of one pull request with `repo` and `number`), create one (`{guideId, target: "version" | "latest", expires: "1" | "7" | "30" | "never", comments}`, returns the URL once), revoke one (`?id=`) |
| `GET /api/mobile/activity?before=<date>` | The activity log, 50 entries at a time, described as on the web |
| `GET /api/mobile/insights?days=30&repo=owner/name` | Every insights panel as JSON |
| `GET`, `PATCH /api/mobile/notifications` | The member's notification settings, and changing some of them (`email`, `push`, `guideReady`, `newVersion`, `replies`, `pullActivity`, `digest`, and `workspaceMuted` for the token's workspace) |
| `POST`, `DELETE /api/mobile/push-devices` | Register an Expo push token (`{token, platform: "ios" | "android", deviceName}`) for the member, or remove one (`?token=`) |
| `GET /api/mobile/members` | The workspace's members and roles |

It also uses the routes the web viewer uses, which accept the same tokens: `GET /api/guides/<id>/file?path=`, `GET`, `POST` and `DELETE /api/guides/<id>/comments`, `POST /api/guides/<id>/threads`, `POST /api/guides/<id>/review`, `POST /api/guides/<id>/progress`, `GET /api/guides/<id>/status` and `GET /api/guides/<id>/export?format=md`, and `POST /api/v1/generate` to start AI generation.
