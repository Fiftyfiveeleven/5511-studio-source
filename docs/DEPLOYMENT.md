# Host 5511 Studio through GitHub → Vercel

This deploys the Studio editor itself as a **Next.js** app. Repositories published from inside Studio contain generated apps and use the **Other** preset instead.

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
