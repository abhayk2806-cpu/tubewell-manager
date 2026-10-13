# Deployment — Tubewell Hisab

How the rebuilt app runs on Netlify and how a fix goes live. Claude cannot see the Netlify account or the Supabase dashboard settings, so every step here is done **by hand by the owner**.
- Dashboard menu names change from time to time. A step marked **(verify in the dashboard)** is the path as far as it is known on 2026-10-07; if the menu differs, look for the same setting name.
- `main` (old v1) and its Netlify project are untouched by everything in this file.

## 0. Live setup and deploy routine (maintenance)

**Live setup (since 10D, in daily use; maintenance mode since 2026-10-13)**
- Live app: `https://tubewell-hisab-rebuild.netlify.app/`, a **separate** Netlify project built from branch `rebuild/fresh-system`: build `pnpm run build`, publish `dist`, the two `VITE_*` variables set in Netlify, no secret keys.
- Database: Supabase project `tubewell-hisab` (`ciszgagzhfubuqhpmyeh`), 7 migrations, RLS locked to the owner, sign-ups OFF. It holds the owner's REAL data.
- Netlify **Build status = Stopped** (deliberately, to save build credits). A push to GitHub does **not** go live by itself.
- The old v1 app stays online and untouched at `https://tubewellhisab.netlify.app/` (its own Netlify project, `main` = `46e3872`, the old Supabase project).

**Deploying a fix (owner, after Claude has pushed it)**
1. Netlify → the live project → Project configuration → Build & deploy → Continuous deployment → Build settings → Configure → Build status = **Active** **(verify in the dashboard)**.
2. Deploys → Trigger deploy → Deploy project.
3. Wait for "Published", then check the fix on the live URL (phone too) and run the short smoke test (section 4) for the screens the fix touches.
4. Set Build status back to **Stopped**.

**Rollback:** Deploys → open an older "Published" deploy → **Publish deploy**. Instant, no build, no credits. The database is not touched by a rollback.

**If builds are ever left Active:** keep branch deploys and deploy previews OFF (section 2, steps 5–6), so only `rebuild/fresh-system` builds.

## 1. What the build needs

| Item | Value | Where it is set |
|---|---|---|
| Install | `pnpm install` (on Netlify CI it runs with a frozen lockfile) | automatic: Netlify sees `pnpm-lock.yaml` |
| Build command | `pnpm run build` (= `tsc -b && vite build`) | `netlify.toml` |
| Publish directory | `dist` | `netlify.toml` |
| Node | major 24 (LTS "Krypton"; the project builds and tests on 24.14.0) | `netlify.toml` → `NODE_VERSION` |
| pnpm | 11.1.3 (the version that wrote the lockfile) | `package.json` → `"packageManager": "pnpm@11.1.3"`, read by Corepack. Without it Netlify would use its own default (pnpm 10.x). |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (nothing else) | Netlify UI (section 2, step 4) |

- The app calls only the Supabase project URL (REST and Auth). No fonts, CDNs or other hosts. No source maps are emitted.
- The two values are read at **build** time (Vite puts them into the bundle). After changing either, run a new deploy.
- If a value is **missing**, or the URL is not a valid `https://` address, the app shows a full-screen Hinglish message instead of a blank page: "App shuru nahi ho paya.", the NAMES of the variables to fix (never their values) and "Netlify mein Environment variables check karo, phir dobara deploy karo." If the values point at the wrong project, the login screen loads but login fails with "Login nahi ho paya…" or "Email ya password galat hai.".

`netlify.toml` also sets the single-page-app rewrite (every path → `/index.html`, status 200), safe response headers on every path (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that turns off camera, microphone, location, payment, USB and motion sensors), a one-year immutable cache for `/assets/*` (hashed file names) and `no-cache` for `/index.html`. There is **no Content-Security-Policy** yet (section 7).

## 2. Owner's Netlify checklist (in this order)

Done for the live project in 10D; kept as the reference for re-creating it.

1. **Project.** A separate project for the rebuild (the live one is `tubewell-hisab-rebuild`): Add new project → Import an existing project → GitHub → `abhayk2806-cpu/tubewell-manager` **(verify in the dashboard)**. If Netlify asks to start a build right away, cancel it until step 4 is done. The old v1 project behind `tubewellhisab.netlify.app` is not touched.
2. **Production branch.** Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts → Production branch = `rebuild/fresh-system` **(verify in the dashboard)**.
3. **Build settings.** Same area → Build settings: leave Build command and Publish directory **empty** (or exactly `pnpm run build` / `dist`), so `netlify.toml` wins. Base directory empty.
4. **Environment variables.** Project configuration → Environment variables → Add a variable **(verify in the dashboard)**. Scope: all scopes; Values: same value for all deploy contexts. Do **not** tick "Contains secret values": both values are public and appear in the built JavaScript, and Netlify's secret check would then stop the build.

   | Name | Purpose | Copy the value from (Supabase dashboard, project `tubewell-hisab`) |
   |---|---|---|
   | `VITE_SUPABASE_URL` | The project's API address | Project Settings → Data API → Project URL, or the "Connect" button **(verify in the dashboard)** |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The public browser key (starts with `sb_publishable_`) | Project Settings → API Keys → Publishable key **(verify in the dashboard)** |

   Never add the secret / service-role key (`sb_secret_…` or the legacy `service_role` JWT) to Netlify or to any `VITE_*` variable.
5. **Branch deploys OFF.** Branches and deploy contexts → Branch deploys = "Deploy only the production branch" (none) **(verify in the dashboard)**.
6. **Deploy previews OFF.** Same area → Deploy previews = "Don't deploy pull requests" / None **(verify in the dashboard)**.
7. **First deploy** (only when you choose to). Deploys → Trigger deploy → Deploy project **(verify in the dashboard)**. In the deploy log check: Node `v24.x`, pnpm `11.1.3` (from `packageManager` in `package.json`; if the log shows pnpm 10.x, Corepack did not pick up the field: tell Claude), "built in …", and no "secrets scanning" failure (box below).
   > **If the build fails with a secrets-scanning message.** Netlify scans the built files for values that look like secrets (smart detection) and may flag one of the two Supabase values. Only if the deploy log shows such a failure, add ONE of these Netlify environment variables (Project configuration → Environment variables), per Netlify's docs:
   > - `SECRETS_SCAN_OMIT_KEYS` = `VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY` (the names of variables that must not be scanned), or
   > - `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` = the exact flagged string shown in the log.
   >
   > Both Supabase values are public by design (they ship in the browser bundle; RLS protects the data). Never do this for a secret / service-role key. Then trigger the deploy again.
8. **Stop builds to save credits.** Project configuration → Build & deploy → Continuous deployment → Build settings → Configure → Build status = "Stopped builds" **(verify in the dashboard)**. The last published deploy stays online; pushes no longer build. Turn it back to "Active builds" only when you want a deploy.
9. Custom domain, HTTPS: the `*.netlify.app` address already has HTTPS. Nothing else is needed.

## 3. Owner's Supabase checklist (project `tubewell-hisab`, `ciszgagzhfubuqhpmyeh`)

1. **Sign-ups OFF.** Authentication → Sign In / Providers → turn off "Allow new users to sign up" **(verify in the dashboard)**. Claude cannot read this setting; the owner set it OFF (PROJECT_STATUS, action 1).
2. **Site URL.** Authentication → URL Configuration → Site URL = the live app, `https://tubewell-hisab-rebuild.netlify.app` (it replaces `http://localhost:3000`; not `tubewellhisab.netlify.app`, which is the old v1 app) **(verify in the dashboard; Claude cannot see the current value)**. The app logs in with email and password only and sends no email links, so it needs no Redirect URLs. The Site URL is used by emails the dashboard sends (for example a password reset).
3. **Leaked-password protection.** Authentication → Attack Protection (or Password security) → "Prevent use of leaked passwords" **(verify in the dashboard; it may need a paid plan)**. The security advisor reports it as off (WARN), as on 2026-10-07.
4. **Keys.** Use only the publishable key in Netlify. If the secret key was ever pasted anywhere public, rotate it in Project Settings → API Keys **(verify in the dashboard)**.
5. Known advisor WARN, intentional: `restore_backup` is a SECURITY DEFINER function callable by signed-in users; it checks the owner inside (Phase 8). No action.

## 4. Smoke test after a deploy (on the Netlify URL, phone and laptop)

1. Open the site: the login screen shows. Log in with the owner account: the Dashboard opens.
2. Tap every tab (Dashboard, Kisan, Pani, Paisa, Mahine, Backup): each loads, figures match the local app.
3. Open a farmer, then press refresh: the same profile reloads (no Netlify 404). Do the same on `/months?month=YYYY-MM`.
4. Open `/nahi-hai`: the app's "Yeh page nahi mila" page.
5. Log out: the login screen. Open `/payments` while logged out: the login screen.
6. Wrong or missing variables show the Hinglish config message ("App shuru nahi ho paya." with the variable names), not a blank page.
7. Optional: browser devtools → Network → the page response shows `X-Frame-Options: DENY`; an `/assets/…js` file shows `max-age=31536000, immutable`. (These headers are served only by Netlify, never by `pnpm run preview`.)

## 5. Where the app is hosted (decided in 10D)

The four pre-test options listed in 10A (production branch switched for a test, a branch deploy, a separate project, no pre-test) are history. The owner chose a **separate Netlify project**, built from `rebuild/fresh-system` (section 0). Its production URL is the live app; the old v1 project was not changed. Uploading a locally built `dist` by drag-and-drop is still not an option: it skips `netlify.toml`, so deep URLs and headers would not work.

## 6. Rollback

- **Netlify rollback:** Deploys → open an earlier "Published" deploy → "Publish deploy" **(verify in the dashboard)**. Instant, no build.
- **Code rollback:** `git revert <commit>` on the branch, push (only as the prompt's push step), then deploy with the routine in section 0. Never force-push.
- **Data:** the owner takes a JSON backup from the Backup screen before any risky step; only the owner restores it (Merge or Replace). Claude never restores or wipes the live database.
- **`main`:** untouched. A cutover of the repo to `main` is the owner's own decision and is not scheduled; Claude never starts it.

## 7. Not done yet

- **Content-Security-Policy:** not set, because it can only be tested on a real Netlify deploy with Supabase calls. A starting point to try later (only on the owner's request, in a deploy the owner checks at once, with the rollback in section 0 ready): `default-src 'self'; connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
- ~~Missing env screen~~ done (P10A-fix1): `src/main.tsx` checks the two variables with `parseConfig` before it loads the app module, and shows `ConfigErrorScreen` (names only) when one is missing or not `https://`. Cost: the first load now fetches a 3.6 kB entry before the app chunks (one extra round trip; the app chunks then load in parallel).
