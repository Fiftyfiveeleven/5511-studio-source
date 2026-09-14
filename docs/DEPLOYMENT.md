# Host 5511 Studio through GitHub → Vercel

This deploys the Studio editor itself as a **Next.js** app. Browser apps published from Studio use **Other**; React/TypeScript apps use **Next.js**.

## 1. Activate the Studio database

Use the dedicated Studio project `bauompqruymbnezlgbxm` in Outdoor Marketin Group.
The base `supabase/schema.sql` is already applied there; do not run it again.
These migrations are now applied (September 13, 2026); do not run them again on this project:

1. `supabase/migrations/20260912_project_access.sql` — live migration `20260913211314`
2. `supabase/migrations/20260913_studio_storage.sql` — live migration `20260913211322`

The first enables owner-controlled editor/viewer access and private per-user drafts. The second creates the private `studio-projects` bucket, role-based file access, and a server-only encrypted usage ledger. No employee grants were created automatically. Files have no public read policy and cannot be overwritten by employees.

The owner explicitly approved both changes before application. Live migration history and storage policies were verified. The security advisor reports two expected findings: no client RLS policy for the server-only ledger (deliberately inaccessible to browser roles), and authenticated execution of `save_project_revision` as a security-definer function. That function explicitly checks project owner/editor access, locks the project, rejects stale revisions, and preserves ownership. These checks are covered by the PostgreSQL access tests. References: [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [authenticated security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The Supabase server secret still needs to be entered in Vercel environment settings to enable hosted token tracking. No GitHub push or Vercel deployment has been performed for this update.

## 2. Put Studio in its own GitHub repository

Run `python3 scripts/package-studio.py` to create `dist/5511-studio-source.zip` containing only this app, its lockfile, migrations, tests, and documentation. Extract it to a new folder and publish that folder as a private repository using GitHub Desktop, or upload its contents through GitHub. Include hidden `.gitignore` and `.env.example` files.

The archive excludes `.env.local`, `.studio`, `node_modules`, `.next`, `.vercel`, browser data, and unrelated workspace projects. It does not include your existing browser projects or local usage history. No repository has been created or pushed automatically.

## 3. Import that repository in Vercel

In Vercel choose **Add New → Project → Import Git Repository** and select the Studio repository.

- Framework preset: **Next.js**
- Root directory: the directory containing `package.json` (repository root for the packaged source)
- Node.js: **24.x**
- Build command: `pnpm build`
- Output directory: leave the Next.js default
- Install command: leave automatic detection; `packageManager` pins pnpm

Add these environment variables before deploying:

| Variable | Value / purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bauompqruymbnezlgbxm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Studio project's publishable key from Supabase Project Settings → API Keys |
| `SUPABASE_SECRET_KEY` | Studio project's server secret from Supabase API Keys; used only by the encrypted token ledger. A legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported. Never give this a `NEXT_PUBLIC_` prefix. |
| `OPENAI_MODEL` | `gpt-5.5` (or an intentionally configured supported model) |
| `STUDIO_ALLOWED_EMAILS` | Optional comma-separated employee emails for server workspace access |

Keep secrets in Vercel's environment settings, never in GitHub files or chat. Mark the server secret as sensitive. Vercel deployment credentials are not needed by the app. Users enter their OpenAI and GitHub keys through Studio Settings after deployment. GitHub OAuth is optional; the token connection works without an OAuth app.

For optional GitHub browser sign-in, add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_REDIRECT_URI=https://YOUR-DOMAIN/api/github/oauth/callback`, matching your registered OAuth application.

Click **Deploy**. Public environment settings are bundled at build time; redeploy after changing them. Configure preview environments deliberately: using the same Supabase project shares real data and token budgets with production.

## 4. Set the authentication URL and move projects

In Supabase → Authentication → URL Configuration, set Site URL to your deployed HTTPS address and add the exact redirect URLs used by Studio (the site's root and any approved local development URL). Configure email delivery and require email confirmation so employee email grants establish identity.

Sign in to the hosted Studio site and save your provider keys in Settings. Each browser/device needs its own saved keys. Owners grant verified employee email addresses through **Team & storage** on each cloud project. Employees open the same hosted URL to work on shared projects. Grants do not send invitation emails.

Existing projects on `127.0.0.1:3001` are stored under that browser origin. Sign in there with your Studio account and use **Settings → Employee workspace → Copy to cloud**. This copies the current saved version and pending image/prompt draft; older browser history remains on the original device. Then sign in with the same account on the hosted URL. Existing cloud copies are never overwritten by this import action.

## Token history when moving to hosting

Vercel builds require the Supabase server key and ledger migration; failures stop new requests before sending them to OpenAI. Encrypted records use atomic version checks to coordinate budgets and duplicate requests across Vercel instances. Raw API keys are not stored in the table.

Local installations without a server key retain the encrypted filesystem ledger. To preserve its history when switching, configure the same Studio server key locally after migration and save your limits in Token usage once for each OpenAI key **before using that key on Vercel**. The first shared write imports the existing local ledger if no cloud ledger exists. An existing cloud ledger is authoritative and is never overwritten by local history. Deploying source alone does not transfer old local token counts. Credential rotation creates a separate ledger; Studio cannot track API use outside this installation.

## 5. Verify the hosted app

Before an AI build, sign in, create a cloud project, save/reopen it on another browser, and check viewer/editor permissions with test accounts. Save a direct text change and confirm the private storage copy can be restored. Check Token usage loads successfully. Run an intentional small AI build only when ready to consume API credits. Later pushes to the connected production branch trigger Vercel deployments automatically.

References: [Vercel Git deployments](https://vercel.com/docs/git), [Supabase private storage](https://supabase.com/docs/guides/storage/security/access-control).

## Connection diagnostics

Settings → Studio Supabase checks the workspace tables, private bucket configuration, and shared token ledger using read-only requests. Local token tracking is labelled Local storage; a missing server key on Vercel is labelled Setup required. A server key is needed to verify bucket privacy. These checks do not test a signed-in employee's write permissions or consume AI tokens.

If the old “configure durable usage storage” message remains after adding the key, confirm that the GitHub repository contains `src/lib/shared-usage.ts`, then redeploy the latest commit. Set the variable on the same Vercel project and environment as the URL being opened (Production versus Preview). Changing environment settings alone does not update an existing deployment. The updated code names missing variables in the error message.

## September 14 builder update

The project-memory/build-plan migration `supabase/migrations/20260914_build_workspace.sql` is applied to `bauompqruymbnezlgbxm`. It adds metadata columns under existing project access policies and preserves existing projects. For a different Studio database, apply it after the prior migrations.

Upload the updated source archive contents to the existing GitHub repository and let Vercel deploy that commit. No new environment variables are required for these builder features. Refresh Studio after deployment; Project memory, Build plan, Check preview, and monthly dollar limits should appear. The local update does not automatically change an existing Vercel deployment.

## Phase 1: full-stack runtime and background builds

Target supplied by owner: https://5511-studio-source.vercel.app/ . This project is not visible in the currently connected Vercel team's project list; deployment has not been changed by this update.

The migration `supabase/migrations/20260914175156_phase_one_jobs.sql` is applied to the dedicated Studio database. It adds project-scoped job progress, a server-only encrypted authorization table, an atomic enqueue limit, and an atomic revision commit. Authenticated users cannot write job records or read job credentials. Job commits recheck editing access and the expected project revision. The server-only credential table intentionally has no browser RLS policy.

For activation on the Studio Vercel project:

1. Keep the existing Studio Supabase URL, publishable key and server secret configured.
2. Generate a **new stable secret** with `openssl rand -hex 32`. Set it as `STUDIO_JOB_ENCRYPTION_KEY` (Secret, never NEXT_PUBLIC). Keep it unchanged while jobs are pending; changing it invalidates their encrypted authorization.
3. Set `STUDIO_SANDBOX_ENABLED=true` (Config). Sandbox uses the deployed project's OIDC credentials. For local development, configure VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID instead. Existing user publishing-token cookies are not borrowed for background compute.
4. Push this update to the GitHub repository behind Studio and deploy. The package build command uses webpack; Workflow's `withWorkflow` integration generates the durable step/flow endpoints. Do not protect `/.well-known/workflow/*` with custom middleware that blocks the SDK.
5. Sign in to the cloud workspace. Settings → Full-stack runtime & background builds should show all checks configured. Create a new project, choose React + TypeScript + server routes in its build plan, then choose Build in background.
6. Verify a build, close the browser, reopen the project on another signed-in device, and inspect Background builds. This cross-device hosted check remains required after activation; local mocks do not establish deployment health.

No generated code runs on the Studio host. Sandbox code executes as an unprivileged OS user without Studio, OpenAI or GitHub credentials. Only registry.npmjs.org is allowed during app dependency installation, lifecycle scripts are disabled, and external VM egress is denied during compilation/testing. The trusted test runner uses a separate user and browser contexts that block external requests. Previews receive no production database credentials. Live authentication, payment and persistent database workflows require an explicitly configured test environment and separate verification; passing the supplied local acceptance tests does not certify those integrations.

Sandbox compute is **separate from AI budgets**. Limits: 20 enqueued jobs/previews per user per rolling 24 hours, one active job per project, two vCPUs and ten minutes per sandbox session. A staged build can use one VM per stage plus a final test VM. Preview sessions expire rather than renewing automatically. For fast startups, provision a snapshot with the system Chromium libraries, `playwright@1.58.2` under `/vercel/checker`, and Chromium installed, then set STUDIO_SANDBOX_SNAPSHOT. Without it, the test VM installs these trusted dependencies before receiving generated code.

Job OpenAI authorization expires after two hours and its encrypted copy is deleted on completion/failure/cancellation. No long-lived user session token is passed to Workflow. Workflow inputs contain only the job UUID. AI steps disable automatic retries; existing provider request IDs and atomic checkpoint commits protect replay. Unknown provider usage stays reserved. Background compilation/test failures stop with diagnostics; they do not silently spend on repair. A job cancelled during a request may still incur that request's cost, but cannot commit a later result.

Background browser-native builds currently receive source checks; the existing free browser Check preview remains available for interactive checks. Full-stack builds receive compilation and final declarative acceptance tests. Requirements and results are stored in the source/job record. Existing requirement IDs/descriptions cannot silently disappear on refinement. Model-authored assertions should still be reviewed for coverage.

Benchmark: `node --import tsx scripts/benchmark-phase-one.ts` validates the fixed two-page server-form fixture without any provider charge and writes `dist/phase-one-benchmark.json`. Add `--runtime` only after configuring Sandbox to run the isolated browser suite (Vercel compute charges apply). Structural checks explicitly report runtime as NOT RUN. Future versions should use the same fixture and compare pass rate, elapsed time and recorded costs. No live model quality or dollar savings claim is established by this fixture.


## Phase 2 activation

1. Replace the Studio repository source with the updated source archive, keeping your existing Vercel project connected to that repository. Push to its production branch.
2. Apply `supabase/migrations/20260914184120_phase_two_tools.sql` after the existing migrations. **Already applied** to the connected Studio database `bauompqruymbnezlgbxm` on September 14. This adds a private reusable-blueprint table and a non-secret project GitHub connection field. No new environment variables are required for Phase 2 itself.
3. Keep Phase 1's database, job encryption and Sandbox settings. React runtime previews still require that setup. OpenAI review and GitHub sync use the employee's existing private browser credentials.
4. After redeploying, open an app: Preview → Edit design / Design review / Features. Publish to GitHub opens the two-way sync panel. Previously selected browser-only repository destinations are suggested for reconnection; pull existing Studio repositories before pushing.
5. Verify using a dedicated test project and repository: save a direct edit, reopen from another signed-in device, save a blueprint, edit one source file in GitHub, pull/review/save, then push. If GitHub has a branch rule requiring PRs, use a writable development branch; this release does not bypass branch protection.

Hosted GitHub writes, live OpenAI image-review quality, and Vercel Sandbox execution were not exercised with real credentials during implementation. Tests use mocked provider responses and a compiled local Next.js fixture. Do not interpret the automated checks as production activation.

## Required Supabase login

Studio now requires an existing, non-anonymous Supabase Auth email account. There is no public sign-up or guest editor. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the **Studio** database before building. Create at least one email/password account in that project's Supabase Authentication → Users screen before deploying this update; employees use their own accounts. Existing project ownership and team roles still determine which projects each user can edit. `STUDIO_ALLOWED_EMAILS`, when set, additionally limits which accounts may enter.

Login exchanges a Supabase access token for an HTTP-only, Secure-on-HTTPS cookie. The server verifies tokens with Supabase Auth; it does not trust unverified session contents. Supabase's browser client refreshes tokens and synchronizes the server cookie. Pages and all Studio API routes require auth; the login/session exchange, static assets, and separately authenticated Workflow runtime endpoints remain reachable. Sign-out clears the Studio session and browser provider keys. Switching accounts also clears provider keys to avoid sharing them on the same browser. Users may need to reconnect OpenAI/GitHub after their first login.

Previously saved browser projects are preserved; a signed-in user can copy them to the cloud using Settings → Cloud workspace. Local and hosted Studio both require authentication. No database migration is needed for this update.

Authentication implementation reference: https://supabase.com/docs/reference/javascript/auth-getuser

If Vercel import reports `Environment variable "VERCEL_TOKEN" is invalid`, remove that entry from the import form. It is not required for GitHub deployments. Hosted Sandbox uses deployment OIDC; explicit VERCEL_TOKEN credentials are for local development only.
