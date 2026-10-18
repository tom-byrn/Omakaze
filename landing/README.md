# Omakaze landing page

A static copy of the app's landing page (`src/app/page.tsx` and `src/components/landing/`) for showing
the project off publicly. Every sign-in button links to the GitHub repository instead, and the agent
setup prompt uses a placeholder instance URL, since this page isn't an Omakaze instance.

It's a separate package with its own dependencies: cloning and running the app never installs or builds it.

## Run locally

```sh
cd landing
pnpm install
pnpm dev        # http://localhost:3001
pnpm build      # static site in landing/out
```

## Deploy

**Vercel:** import the repository, set **Root Directory** to `landing`, and deploy. No environment
variables are needed.

**Any static host:** run `pnpm build` and upload `landing/out`.

## Keeping it in sync

The components are copies, not imports, so the page builds on its own. When you change the app's
landing page, copy the change here. The only intended differences are:

- `src/lib/site.ts` holds the repository URL and the placeholder instance URL.
- `page.tsx`, `SiteHeader.tsx` and `Footer.tsx` link to GitHub where the app has sign-in, and have no
  signed-in state.
