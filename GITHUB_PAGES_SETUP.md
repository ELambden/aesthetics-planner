# Publish the map when you need it

The project is prepared for a public GitHub Pages website. GitHub builds it for you; no Cloudflare account or local Node upgrade is required to publish through the Actions tab.

Publishing is manual. Pushing code alone does not publish or restore the website.

## First upload

1. Use [ELambden/aesthetics-planner](https://github.com/ELambden/aesthetics-planner). Keep the repository **private** while uploading and reviewing the project.
2. Push this project to that repository. Its `.gitignore` excludes local keys, build output, downloaded source datasets and installed dependencies. Include all three files in `public/data` and the `.github/workflows` folder.
3. When ready to share, change the repository to **Public** in **Settings → General → Danger Zone → Change repository visibility**.
4. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
5. Open **Actions → Publish Pages → Run workflow**, select the default branch (normally `main`), and run it.
6. Wait for the green completion result. Open the website link shown by the deployment or in **Settings → Pages**.

The workflow determines the repository path automatically. This repository will normally use `https://ELambden.github.io/aesthetics-planner/`. You do not have to edit the code for your GitHub username or repository name.

GitHub Free requires a public repository for Pages. The source code and included datasets are public during that time. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## After using the map

1. Wait for any publishing workflow to finish, or cancel it.
2. Go to **Settings → Pages**, open the menu beside the live site address, and choose **Unpublish site**.
3. Change the repository back to **Private** under **Settings → General → Danger Zone**.
4. Check the website address in a fresh private browser window.

On GitHub Free, making the repository private also automatically unpublishes Pages. Explicitly unpublishing works if your plan later changes. On paid plans, a Pages website can remain public when its repository is private. [Repository visibility rules](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), [unpublishing a site](https://docs.github.com/en/pages/getting-started-with-github-pages/unpublishing-a-github-pages-site).

For the next session, make the repository public, check that Pages still uses GitHub Actions, and run **Publish Pages** again. Allow several minutes for publishing. Copies, forks and browser caches obtained while public cannot be recalled by hiding the site.

## Map appearance and keys

The initial public build uses the existing OpenStreetMap fallback basemap. All population-density polygons, location rankings, clinics, filters and scoring controls use the same prepared data as the local map.

Local `.env.local` values are deliberately ignored by this build. No map key is required.

If you later want the OS basemap, add a repository Actions secret named `PAGES_OS_API_KEY` and run **Publish Pages** again. For Google Street View, the optional secret is `PAGES_GOOGLE_MAPS_BROWSER_KEY`. Only add browser/project keys that you intend to expose to visitors, with suitable provider restrictions and usage allowances. GitHub's secret setting does not keep a value secret after it has been embedded into browser JavaScript. Never use an OS API secret or the backend Places key here.

## Local checks, if desired

Use Node 22 or newer for local builds:

```bash
npm ci
npm run check:github
npm run preview:github
```

To test the repository subpath:

```bash
GITHUB_PAGES_BASE=/aesthetics-planner/ npm run build:github
GITHUB_PAGES_BASE=/aesthetics-planner/ npm run preview:github
```

Open `http://127.0.0.1:4173/aesthetics-planner/`.

The GitHub build is in `dist-github`; the optional Cloudflare build remains in `dist`. The publishing workflow uploads only `dist-github` and does not deploy the Cloudflare Functions.

## Repository and publishing

The repository is [ELambden/aesthetics-planner](https://github.com/ELambden/aesthetics-planner). Uploading the source does not publish the website. When ready to share, follow the visibility and manual publishing steps above.
