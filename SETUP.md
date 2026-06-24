# Setup — Relation Blueprint

Relation Blueprint is a **serverless PWA**: there is no backend and no accounts. Your
entire database lives in **your own** Google Drive (Mega.nz arrives in a later
milestone). To connect Google Drive, the app uses Google Identity Services (GIS) in
the browser, and that requires a one-time, per-developer setup step that **cannot be
automated**: you must create an OAuth 2.0 Client ID in your own Google Cloud project.

This is a **blocking prerequisite**. Until the OAuth Client ID exists with
`drive.file`-only consent, no Drive-touching feature (Plan 06 onward) can be exercised.

---

## 1. Run the app locally

```bash
npm install
npm run dev      # serves the app shell at http://localhost:5173
```

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Type-check + produce the static `dist/` bundle (GitHub Pages base path) |
| `npm run preview` | Serve the built bundle locally |
| `npm run typecheck` | `tsc --noEmit` under `strict: true` |
| `npm run lint` | ESLint (flat config) |
| `npm test` | Vitest (single CI-safe pass) |
| `npm run test:e2e` | Playwright E2E (builds + previews, then runs `e2e/`) |

---

## 2. Create the Google Cloud OAuth 2.0 Client ID (BLOCKING prerequisite)

> This grants the app permission to read and write **only the files it creates** in
> your Drive — never your whole Drive. Creating the client is a manual step in the
> Google Cloud Console; it cannot be done headlessly.

### Step-by-step

1. Go to **Google Cloud Console → APIs & Services → Credentials**
   (<https://console.cloud.google.com/apis/credentials>). Create a project first if
   you don't have one.

2. Click **Create Credentials → OAuth client ID**. Choose application type
   **Web application**.

3. Under **Authorized JavaScript origins**, add **both**:
   - `http://localhost:5173` (Vite dev server)
   - `https://<your-user>.github.io` (your GitHub Pages origin — replace
     `<your-user>` with your GitHub username)

   GIS rejects any origin not listed here, so both dev and production origins must be
   present.

4. Go to **APIs & Services → OAuth consent screen**. Add **only** this scope:

   ```
   https://www.googleapis.com/auth/drive.file
   ```

   ⚠️ **Verify the consent summary does NOT say "See and manage all of your Google
   Drive files."** It must reference only files **this app creates**. If you see the
   broad wording, you have requested the wrong scope — fix it before continuing.
   The broad `drive` scope triggers an annual CASA security audit and is a permanent
   blocker for a free/OSS project.

5. **Publish** the consent screen, **or** add your own Google account under
   **Test users** (so you can sign in while the app is in testing).

6. Copy the resulting **Client ID** into a local `.env` file at the repo root:

   ```bash
   cp .env.example .env
   # then edit .env:
   VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
   ```

   The Client ID is a **public client identifier**, not a secret — it is embedded in
   the static bundle, which is correct and expected for the GIS token model. **No
   client secret is used** by the token model; do not create or store one.

7. For the deployed GitHub Pages build, set a repository **variable** named
   `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables).
   The deploy workflow reads it at build time.

---

## 3. Why `drive.file` and a visible folder

- **`drive.file` only (least privilege):** the app can only touch files it created.
  This keeps the OAuth verification posture light and means a compromised app token
  can never read the rest of your Drive.
- **Visible named folder ("Relation Blueprint"):** your data is created in a normal,
  visible Drive folder you can see at <https://drive.google.com> — **not** the hidden
  `appDataFolder` (which would be deleted if you ever remove the app). You own your
  data, always.
- **Token in memory only:** the ~1-hour access token is held in memory and never
  written to storage. On expiry the app shows a non-destructive "Reconnect to Drive"
  prompt; your local (IndexedDB) copy is always the source of truth and is never
  blocked on the network.

---

## Checkpoint

Once you have completed Step 2 — the OAuth Client ID exists, the consent screen lists
**only** `drive.file`, and `VITE_GOOGLE_CLIENT_ID` is set in your local `.env` — the
blocking prerequisite is satisfied and Drive-touching plans can proceed.
