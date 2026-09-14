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

Projects support the original browser runtime or a controlled Next.js runtime with React, TypeScript, routes and server functions. Hosted background builds use Vercel Workflow and isolated Sandbox execution. Direct design editing, reusable blueprints, visual reviews and two-way GitHub source sync are available. Arbitrary packages, automatic SQL execution, automatic production credentials in previews, and full Lovable feature parity are not claimed. Review SQL and app access policies before applying them.

## Usage controls (September 11, 2026)

The Token usage page reports provider input, cached input, output, reasoning, and total tokens for new requests, including failed responses when usage is available. Cached input is a subset of input; reasoning is a subset of output. Older browser revisions appear separately as historical totals. These counts cover this Studio installation, not other applications using the same OpenAI account, and are not a billing invoice.

Defaults are 150,000 tokens and 20 build attempts per rolling 24 hours, 12,000 maximum output tokens, and 90,000 input characters. Studio reserves a conservative input allowance plus the output cap before submitting; uncertain requests retain that allowance. One request can run per API key. Automatic SDK retries are disabled. Exact repeated requests reuse stored results; edits request changed files only. Browser builds save pending request identifiers and recover completed results when reopened without regenerating. Preview navigation and reload never call OpenAI.

Usage is encrypted with a key derived from the API credential. Hosted usage is stored in a server-only Supabase table with optimistic version checks to coordinate concurrent instances. Vercel builds require the server secret and storage migration. Local development without that key uses `.studio/usage`; never commit this directory. See the deployment guide for transferring local usage before the first hosted build. Rotating credentials creates a separate ledger.

Provider integration tests mock OpenAI and verify deduplication, concurrent-request rejection, budgets, token accounting, incomplete responses, and encrypted persistence without spending API credits.

## Images, saving, direct editing, and GitHub

Chat accepts up to three PNG/JPEG/WebP images through drag/drop, paste, or Add images. Originals are limited to 15 MB and resized to at most 1024 pixels per side, then compressed before upload. Only attachments on the submitted message are sent to OpenAI as vision inputs; they are included in request fingerprints and token reservations. They are design/context references, not automatically hosted app assets.

Save project creates or renames a project and stores its pending prompt and reference images in browser IndexedDB. Reopen it from Your projects. Completed builds and direct text edits already save as immutable revisions. Unsigned projects and pending drafts stay in this browser; authenticated project versions are in the cloud workspace. Download source or publish to GitHub for a portable source copy.

Edit design opens an element inspector for HTML and static React JSX. Click an element or choose it from the list, change text, image/link attributes or supported styles, then save a zero-token revision. Undo/redo affects the draft; History restores saved versions. Dynamic expressions and computed styles are preserved and require code/chat changes. Next.js previews show the last saved version: after a draft change, use the source element list, then save and relaunch to inspect the result.

Settings → GitHub accepts a token and also supports OAuth browser sign-in. Create an OAuth app at https://github.com/settings/applications/new with your Studio homepage and callback `/api/github/oauth/callback`. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_REDIRECT_URI on the server and restart. The local callback is http://127.0.0.1:3001/api/github/oauth/callback; use your HTTPS domain in production. OAuth uses state and PKCE; tokens are held in HTTP-only cookies, never sent to the model. Expired tokens require reconnecting.

Per-project Publish to GitHub creates a private repository by default or selects an existing dedicated repository with write access. Existing repos need an initialized default branch. Fine-grained tokens need Contents read/write; creating repos additionally needs Administration write and access covering new repositories, subject to GitHub organization policies. Existing unrelated apps and repositories bound to another Studio project are rejected. Publishing creates one commit without force-pushing; duplicate unchanged exports create no commit. Repository, branch and last synced commit are saved with the project. Pull & review reads committed source and performs a three-way merge against the last synced commit. Independent file changes merge automatically; conflicting files require a Studio/incoming choice, including deletions. Saves reject stale project revisions. Pushes reject a changed remote head and never force-push. This supports repositories previously published by the same Studio project, not arbitrary repository import.

Browser repositories contain a standalone root index.html, editable original source in source/, schema.sql, README, and Vercel settings. Use the Other preset with no build command and root output. Next.js repositories contain app/, components/ and lib/ directly and use the Next.js preset. Subsequent Studio publishes go to GitHub; Vercel deploys commits through its Git integration. The editor no longer publishes directly to Vercel and needs no Vercel token. Legacy direct-deployment endpoints remain for compatibility.


## Model routing and focused context

Simple, short visual-only refinements to an existing static page use `OPENAI_FAST_MODEL` (default `gpt-5.4-mini`). They receive HTML and CSS; JavaScript and SQL are omitted and preserved. Only the stylesheet may be returned. Inline styles or detected JavaScript DOM/style generation retain the capable route. New builds, image references, functional or compound requests, and unrecognized instructions use `OPENAI_MODEL` (default `gpt-5.5`) with full source and SQL context.

The router is a conservative local heuristic, not an AI planning call. Usage history records model, routing reason, and omitted source character count. No model escalation occurs on failure. The build plan now offers one explicitly enabled, budget-bounded repair for known output or verification failures. Cache keys include the entire saved source, including omitted files, so changes outside the selected context cannot reuse a stale merged result. Existing input/output and daily limits still apply. The fast model reduces cost for qualifying edits; it does not guarantee lower token counts or eliminate output-limit failures. Provider tests are mocked; live model quality has not been benchmarked.

## Staged builds, project memory and dollar budgets

Build now opens a reviewable plan before any paid request. New apps and larger requests default to three editable stages (foundation, features, polish); small edits use one stage. Each accepted stage saves a revision. Foreground browser builds need an open browser; pause takes effect after the current request. Signed-in background jobs continue independently. Reopening a plan does not submit requests automatically. Completed browser requests can be recovered; a changed project must be reviewed before continuing.

Project memory stores purpose, brand, pages/features, data rules and accepted decisions. Every generation receives that specification. Signed-in projects save it with the project under existing owner/editor/viewer permissions; guests save it in IndexedDB. New cloud installations also need `supabase/migrations/20260914_build_workspace.sql` (already applied to the dedicated Studio project on September 14).

Refinements support exact-match patches, checked atomically before they replace a saved version. Projects support up to 80 source files. Browser projects can use native JavaScript modules or Web Components in `components/` and `lib/`; full-stack projects use the controlled React/TypeScript runtime described below. Local imports are resolved for the preview and standalone GitHub export; legacy classic scripts remain supported. Syntax and missing imports are checked before saving. Existing projects are not automatically rewritten into components.

Check preview runs free, isolated browser smoke tests. Staged builds run those checks after the last stage. Checks cover JavaScript errors, local navigation targets, basic control labels and up to eight explicitly marked local button interactions. They do not prove complete business correctness or verify live authentication/payments/database writes; network writes are blocked. A failed report remains visible. Optional automatic repair is limited to one additional paid request within the build's ceiling, for known output/check failures only. Timeouts and uncertain usage are not automatically retried. Preparing a manual new attempt requires a separate click; earlier costs still count.

Usage now includes an estimated monthly USD total and reservations, with defaults of $100/month and $3/build across stages and repair. Each paid request is reserved atomically against token and dollar limits. Standard pricing covers GPT-5.5 and GPT-5.4-mini and accounts separately for cached input; unsupported models fail before billing. These estimates exclude other applications, keys, taxes, hosting and provider surcharges. Unknown costs remain reserved for the UTC calendar month even after their daily token reservation ages out. Pricing must be updated when provider rates change. The plan shows a conservative next-request estimate; later stages are re-estimated from the updated source.

## Phase 1 runtime update

Signed-in cloud projects can now enqueue durable Vercel Workflow jobs. New projects can use React/TypeScript with Next.js routes and server functions; existing browser-native projects keep their format. Full-stack source is compiled in an isolated Vercel Sandbox before each checkpoint, and final `studio.tests.json` requirements run through a trusted Playwright runner. Background status and checkpoints are shared through Supabase. Closing the browser does not cancel a dispatched hosted workflow.

Full-stack edits use a dependency graph for explicit file or named-component requests, including imports, consumers, local fetch routes and shared layouts/styles. Ambiguous/dynamic dependencies retain full context. Existing requirement identities are preserved, and output cannot modify omitted existing files. GitHub export emits a directly deployable Next.js project with pinned approved dependencies; arbitrary packages/install hooks are not supported.

Activation requires the server settings described in [the deployment guide](docs/DEPLOYMENT.md). Full-stack runtime and cross-device background execution have not yet been verified on the owner's hosted deployment. Sandbox compute is separate from OpenAI's monthly dollar ceiling. This update includes explicit readiness indicators rather than silently falling back to a fake runtime.


## Phase 2 editor tools

- **Design review:** free rendered DOM checks for the current desktop/mobile viewport, plus an optional budgeted GPT-5.4-mini critique of uploaded screenshots and design references. Select findings to prepare a chat request; nothing is automatically regenerated. Reviews can be downloaded. DOM checks are advisory and do not certify accessibility or business behavior.
- **Features:** install FAQ, price-calculator or personal-checklist packs with no AI call. Next.js packs add independent routes and acceptance requirements. Save any version as a reusable blueprint, review file conflicts before reuse, and export/import blueprint JSON. Cloud libraries are private to the signed-in user; share via an explicitly exported file. Guest libraries stay in IndexedDB. Blueprint source is code, not a live connection to its original project.
- **Edit design:** static text, links, image URLs/alt text, color, background, typography, spacing, radius and gap. Draft undo/redo and immutable revision saves. Nested/dynamic JSX, component props, arbitrary CSS expressions and structural drag-and-drop are outside this inspector's scope.
- **GitHub sync:** per-project repository/branch, immutable commit reads, three-way file conflict review, safe managed-file deletions and no force push. Unrelated files are preserved. Branch protection may reject direct pushes; this release does not create pull requests or support line-by-line merges.

The Phase 2 migration is applied to Studio's connected Supabase project. See [Phase 2 usage and verification](docs/PHASE_TWO.md) and [deployment instructions](docs/DEPLOYMENT.md). Production activation still requires uploading the updated source to the owner's actual GitHub repository and redeploying its Vercel project.
