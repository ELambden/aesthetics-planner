# Share the map privately with Cloudflare

This setup uses Cloudflare Pages to host the map and Cloudflare Access to admit only approved email addresses. Partners receive a login code by email. Use the supplied `pages.dev` address; no domain, GitHub repository, database or always-on laptop is needed.

The map is a shared snapshot of the files in `public/data`. Partners can explore it and adjust their own filters and scoring weights. Changes to the underlying dataset are published by rebuilding and redeploying.

The code is prepared and tested locally. Cloudflare account setup, publication and real email login checks still need to be completed.

## 1. Prepare your terminal

Open a terminal in this folder:

```bash
cd path/to/lina
node --version
```

Use Node 22 or newer. This laptop was running Node 18 when the project was prepared. Install Node 22 LTS or Node 24 LTS using the [official Node download instructions](https://nodejs.org/en/download). If you use nvm, the project's `.nvmrc` selects Node 22:

```bash
nvm install
nvm use
```

Then install the recorded package versions and run the checks:

```bash
npm ci
npm run check
```

The checks validate the real data, exercise the login verification and compile both the website and its Cloudflare Functions.

## 2. Create your free Cloudflare account and email login

Create an account or sign in at [Cloudflare](https://dash.cloudflare.com/). In Zero Trust / Cloudflare One, create your team and select the Free plan. Record the team address, for example `https://your-team.cloudflareaccess.com`. This is different from the eventual website address.

Cloudflare's free plan supports up to 50 users. Account onboarding may ask for payment details even for the free plan. [Plan details](https://www.cloudflare.com/plans/).

In Zero Trust, open **Integrations → Identity providers → Add new identity provider → One-time PIN**. Save it. This allows your partners to sign in using an emailed code; they do not need a Cloudflare account. [Email login instructions](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

## 3. Create an empty Pages deployment

In the project terminal:

```bash
npm run pages:login
npm run pages:create -- lina-location-map
npm run pages:bootstrap -- --project-name lina-location-map
```

The login command opens a browser for you to approve access to your own Cloudflare account. Choose the same account throughout.

If the project name is taken, choose another and substitute it in every command and website address below. Also update `name` in `wrangler.toml` to match.

The bootstrap command publishes only a setup page and the authentication Functions. It uploads no map data. Its initial response should say that private access is not configured yet; that is expected.

Run these commands from the project root. The `functions` folder must be included. Dashboard drag-and-drop does not compile these Functions. Direct Upload also cannot later be converted to Git integration on the same project; a new project would be needed for that. [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## 4. Protect the main address and preview addresses

In **Workers & Pages → your Pages project → Settings**, select **Enable access policy**, then **Manage** the created application.

Following Cloudflare's Pages instructions:

1. Edit the application's public hostname: remove the leading wildcard so it protects `lina-location-map.pages.dev`.
2. Save, then return to the Pages project and enable its access policy again.
3. Confirm that there are now two Access applications: one for `lina-location-map.pages.dev` and one for `*.lina-location-map.pages.dev`.

The wildcard covers generated deployment and branch addresses; it does not cover the main address. [Official Pages Access setup](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain).

In **each** application, set:

| Setting | Value |
| --- | --- |
| Login method | One-time PIN |
| Session duration | 24 hours |
| Policy action | Allow |
| Include selector | Emails |
| Email values | Your own address and each partner's exact address |
| Path | Leave empty to cover the whole hostname |

Replace any initial policy that allows a larger group. There should be no Everyone, Bypass, whole-email-domain or unrelated Allow rule. People who match no Allow rule are denied. [Access policy rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

Record the **Application Audience (AUD) Tag** from each application's details. Each is a 64-character value. These identify the two applications to the server.

If you later add a custom domain, add Access protection for that hostname too.

## 5. Set the Pages runtime settings

In the Pages project's **Settings → Runtime → Fail open / closed**, select **Fail closed**. If the daily Functions allowance is exhausted, the site must show an error instead of serving its files without the server check. [Cloudflare's fail-closed setting](https://developers.cloudflare.com/pages/functions/routing/#fail-open--closed).

In **Settings → Variables and Secrets**, add the following as **Secrets** for both **Production** and **Preview**. Using Secrets keeps the values out of source control and preserves them separately from Wrangler configuration.

| Name | Value |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | Your team URL, e.g. `https://your-team.cloudflareaccess.com` |
| `ACCESS_AUD` | Both AUD tags, separated by a comma, with no quotes |
| `OS_API_KEY` | The OS project API key you already use locally |

You can find the existing OS project key in your local `.env.local` as `VITE_OS_API_KEY`; copy its value into Cloudflare under the name `OS_API_KEY`. Do not paste it into chat or use the OS API secret. The browser necessarily receives this project key after login.

`GOOGLE_MAPS_BROWSER_KEY` is optional if you want Google Maps / Street View features. The backend `GOOGLE_PLACES_API_KEY` is only needed by your local refresh script and should not be added to this deployment.

The old `APP_PASSWORD` and `AUTH_SALT` settings are no longer used.

The OS service has its own usage allowance, separate from hosting. Check the existing OS project's plan and any domain restrictions, and allow the actual hosted address. Without an OS key the app uses its existing fallback basemap. [OS Data Hub plans](https://www.ordnancesurvey.co.uk/developers/os-data-hub).

## 6. Publish the real map

Once Access and the runtime settings above are in place:

```bash
npm run pages:deploy -- --project-name lina-location-map
```

This runs all checks, builds the current map and uploads `dist` together with the authentication Functions. The large raw ONS files, local environment files and development dependencies are not part of the hosted application.

New variables and secrets take effect on the new deployment. Save its generated deployment URL as well as the main `https://lina-location-map.pages.dev` address.

## 7. Check access before sharing the link

Run the automatic anonymous-access check against both addresses, substituting the generated deployment URL printed by Wrangler:

```bash
npm run pages:verify -- https://lina-location-map.pages.dev https://DEPLOYMENT-ID.lina-location-map.pages.dev
```

It checks the page, configuration, JavaScript, CSS and each data file, including requests with a forged login token. Every request should be blocked or redirected to Cloudflare login. A 503 means setup is incomplete or the service is unavailable, so it does not count as ready.

Then check in a private browser window:

1. Visit the main address. Cloudflare should ask you to sign in.
2. Use your approved email and enter the code. The map should load with the full location and clinic lists.
3. Change a score preset and clinic filter to check that the map responds.
4. Use **Sign out**, then check the login page again in a fresh private window.
5. Try an email address that is not on the list. It must not gain access.
6. In a fresh private window, open `/data/clinics.json` directly on each hostname. It must require login too.

The automated check cannot confirm which email addresses are allowed; the browser checks and policy review establish that.

Now share the main website link with your partners. Their email address must exactly match an allowed address.

## Updating the map and managing partners

After changing the app or regenerating the local datasets, run:

```bash
npm run pages:deploy -- --project-name lina-location-map
```

Both new and old deployment URLs remain behind the preview Access policy. Do not roll back to the empty bootstrap deployment unless you intend to show the setup page.

To add a partner, update the email Allow rule in both Access applications. To remove a partner, remove their email from both and revoke their active sessions in Cloudflare Zero Trust. [Session revocation](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

For normal local work use `npm run dev` and open the printed localhost address. Local development intentionally has no login and binds to this computer only. `npm run pages:dev` runs the Cloudflare emulator and remains locked without a valid Access token. `npm run preview` only previews static build output and cannot provide the authenticated configuration endpoint.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| “Private access is not configured yet” / 503 | Both Access settings exist in the right deployment environment; team domain is an HTTPS Cloudflare Access URL; AUD values are the actual 64-character tags; redeploy after changing settings. |
| A JSON 403 instead of an email login page | This exact hostname needs a Cloudflare Access application in front of it. |
| Login succeeds but the app returns 403 | The team URL and both audience tags must match the Access applications. |
| “The map could not load” | Reload to renew the login. If it persists, check the deployment includes all three `public/data` files and inspect Pages logs. There is no silent switch to sample locations. |
| OS basemap missing | Check `OS_API_KEY`, the OS project allowance and any key restrictions for the website address. |
| CLI says Node is unsupported | Install or activate Node 22 or newer in that terminal. |
| A raw data file opens without login | Stop sharing the link. Check both hostname policies, Fail closed, and that deployment used the root-level `functions` folder. |

## Local validation record

Prepared on 11 September 2026. All 33 tests passed, and the production build and Pages Functions compilation succeeded. The checks validate 1,264 areas and 570 clinics. The three data files are approximately 11 MiB in total.

The local Cloudflare emulator blocked the main page, configuration, data, JavaScript and CSS before configuration. The compiled Worker was also exercised with locally generated test signing keys: signed-in requests loaded the real data, while anonymous and forged requests were denied. These are local tests, not a test of a live Cloudflare account.

The production dependency audit reported no known vulnerabilities. The existing local development/data-processing toolchain has audit findings in Vite, Vitest and xlsx; those tools are not deployed as the hosted runtime. No live Cloudflare account or email policy has been tested yet.
