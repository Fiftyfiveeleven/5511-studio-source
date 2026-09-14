# 5511 Studio

A Fifty Five 11 branded AI app builder using Next.js, OpenAI, Supabase, and GitHub.

## Run and deploy

Use Node.js 24 and pnpm 11.19.0. Run `pnpm install`, then `pnpm dev`. Enter your OpenAI key in Settings. Guest projects stay in browser IndexedDB; sign in to the Studio Supabase workspace to save across machines.

**Hosting:** follow [GitHub → Vercel deployment](docs/DEPLOYMENT.md). Studio uses the Next.js preset. Run `python3 scripts/package-studio.py` for a source archive excluding credentials, local data, and unrelated projects.

## Cloud workspace and private storage

Studio's own Supabase project stores accounts, projects, revisions, personal prompt/image drafts, and shared usage records. This is separate from each generated app's optional Supabase connection. Supabase Storage holds immutable private version bundles, with project editor/viewer access controls. Saved credentials are omitted from bundles. Failed storage copies preserve the database revision and can be retried from Team & storage; restores create a new zero-token revision.

Owners grant access by verified employee email. Editors can save, viewers can read, and only owners manage access. Personal drafts are visible only to their author while they retain edit access. Each employee connects their own OpenAI and GitHub credentials. Simultaneous editing uses conflict detection; this is not live multiplayer editing.

**Database activated September 13:** both team-access and private-storage migrations are live on `bauompqruymbnezlgbxm`, following explicit owner approval. The private bucket and server-only usage table are ready. Hosted token tracking still requires the Supabase server secret in Vercel; it is not configured locally. See the deployment guide for verification details and the two intentional security-advisor findings.

## Verification and scope

`pnpm test` covers PostgreSQL RLS, team roles and revocation, private storage access, immutable revisions, conflicting saves, encrypted shared usage, duplicate requests, budgets, credentials, and GitHub isolation. Storage/OpenAI/GitHub provider requests are mocked in tests. `pnpm build` checks the production build. No paid AI calls are required for these checks.

Generated apps contain HTML, CSS, JavaScript, and optional SQL. The sandboxed preview supports navigation and static text edits. Arbitrary server code, package installation, background generation jobs, automatic SQL application, external GitHub pull/import, and full Lovable feature parity are not implemented. Builds use one bounded request and require a connected browser. Review generated SQL and app access policies before applying them.

## Usage controls (September 11, 2026)

The Token usage page reports provider input, cached input, output, reasoning, and total tokens for new requests, including failed responses when usage is available. Cached input is a subset of input; reasoning is a subset of output. Older browser revisions appear separately as historical totals. These counts cover this Studio installation, not other applications using the same OpenAI account, and are not a billing invoice.

Defaults are 150,000 tokens and 20 build attempts per rolling 24 hours, 12,000 maximum output tokens, and 90,000 input characters. Studio reserves a conservative input allowance plus the output cap before submitting; uncertain requests retain that allowance. One request can run per API key. Automatic SDK retries are disabled. Exact repeated requests reuse stored results; edits request changed files only. Browser builds save pending request identifiers and recover completed results when reopened without regenerating. Preview navigation and reload never call OpenAI.

Usage is encrypted with a key derived from the API credential. Hosted usage is stored in a server-only Supabase table with optimistic version checks to coordinate concurrent instances. Vercel builds require the server secret and storage migration. Local development without that key uses `.studio/usage`; never commit this directory. See the deployment guide for transferring local usage before the first hosted build. Rotating credentials creates a separate ledger.

Provider integration tests mock OpenAI and verify deduplication, concurrent-request rejection, budgets, token accounting, incomplete responses, and encrypted persistence without spending API credits.

## Images, saving, direct editing, and GitHub

Chat accepts up to three PNG/JPEG/WebP images through drag/drop, paste, or Add images. Originals are limited to 15 MB and resized to at most 1024 pixels per side, then compressed before upload. Only attachments on the submitted message are sent to OpenAI as vision inputs; they are included in request fingerprints and token reservations. They are design/context references, not automatically hosted app assets.

Save project creates or renames a project and stores its pending prompt and reference images in browser IndexedDB. Reopen it from Your projects. Completed builds and direct text edits already save as immutable revisions. Unsigned projects and pending drafts stay in this browser; authenticated project versions are in the cloud workspace. Download source or publish to GitHub for a portable source copy.

Edit text enables inline editing for static HTML text in the saved page. Save text edits creates a zero-token version; Cancel edits discards the session. Nested markup and separate script/style files are preserved. Text generated dynamically by JavaScript or loaded from a database must be changed in the corresponding source/data flow. History can restore a previous revision.

Settings → GitHub accepts a token and also supports OAuth browser sign-in. Create an OAuth app at https://github.com/settings/applications/new with your Studio homepage and callback `/api/github/oauth/callback`. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_REDIRECT_URI on the server and restart. The local callback is http://127.0.0.1:3001/api/github/oauth/callback; use your HTTPS domain in production. OAuth uses state and PKCE; tokens are held in HTTP-only cookies, never sent to the model. Expired tokens require reconnecting.

Per-project Publish to GitHub creates a private repository by default or selects an existing dedicated repository with write access. Existing repos need an initialized default branch. Fine-grained tokens need Contents read/write; creating repos additionally needs Administration write and access covering new repositories, subject to GitHub organization policies. Existing unrelated apps and repositories bound to another Studio project are rejected. Publishing creates one commit without force-pushing; duplicate unchanged exports create no commit. Repository choices are remembered in this browser; the GitHub project marker allows reselecting the same repository elsewhere. Sync is one-way: external GitHub edits are not imported into Studio.

Each repository contains a standalone root index.html, original source in source/, schema.sql, README, and Vercel settings. Import it in Vercel using the Other framework preset, no build command, and root output directory. Subsequent Studio publishes go to GitHub; Vercel deploys commits through its Git integration. The editor no longer publishes directly to Vercel and needs no Vercel token. Legacy direct-deployment endpoints remain for compatibility.

