URL: citizensbankfund.com
Designed and Engineered by Robert Bishop a Accounting & Finance student at ETSU on behalf of the Citizens Bank Fund....

## Official Website of ETSU's Citizens Bank & Laporte Fund

- Created by Robert Bishop

## Publishing and stock prices

One-time setup:

1. Add `FINNHUB_API_KEY` under Settings → Secrets and variables → Actions → New repository secret.
2. Push the workflow to `main`, then change Settings → Pages → Source to **GitHub Actions**.
3. Run **Publish site and refresh portfolio prices** from the Actions tab. Confirm the build and deploy jobs succeed.

The workflow builds from source on each push and refreshes prices approximately every 15 minutes on weekdays, 9:30 AM–4:30 PM New York time, including daylight saving changes.

**Portfolio Dynamic Data** \
Basically the site works weird way in which because we are a static website, we have 2 potoccols, basically as stated above the site refreshes about 15 minutes, where a Cronjob runs an action that then runs Github's actions feature and then goes through our price updating procedure.

And because of the way our portfolio works you have to manually upload the export Raymond James CSV file, which is then parsed through our system and then once you push it everything in the site dynamically updates..

For the uhh csv holdings, run `npm run portfolio:prepare -- "path/to/export.csv" --as-of YYYY-MM-DD`, review `content/portfolio/holdings.json`, and commit and push it. The workflow builds the site and prices the new quantities. Rebuilding or committing `docs` is no longer required because I switched from pages to actions..

Just check to make sure the actions actually went through..

**Black-Litterman Model** \
Quick note on the Black-Litterman addition, the system implements a dynamic version of my testing repo at "https://github.com/BobbyBishopCodes/Black-Litterman-Model"...

As noted within that project's README.md, we use a similair approach to the traditional Black-Litterman model, negating a few factors but primarily integrating our own portfolio's dynamic positions and hard caps for some of the stuff that we wanted to do...

So if you are interested in extrapolating on that system, check out that repo as we use static data. Here we use dynamic data that follows a pipeline that fuels all of our calculations & analysis in regards to uploading CSV statements from Raymond James. Definetly more efficient ways to do this, so if it looks like a mess in that regards its because of the limited ability to better source data. Still works tho!

Oh also entirely uneccesary to utilize Rust, actually substantially more of a headache to implement and jumbles the code a bit more, but I just wanted to.

10/6/2026 note, basically because of the current accesibility to long-term historical pricing being an issue, we are setting a cloudflare worker which bascially then uses a worker to utilize a API to grab information then run the rust calculations within the browser itself, once again all of this is entirely uneccesary if you are not using a static webpage. But we like to keep things cheap around here.

Furthermore to anyone interested in changing this to a non-static page, would be better off re-writing practically everything....

**Possible Future Editions**

```
Macro Tab Implementation

Research Paper Display Format

Partnership / event details for homepage

Signup / Login Accounts

Macro Tab with dynamic CPI & PPI forecasts, historical accuracy, IRFs, macro event impact research

Events

Macro monthly reports

Excel export of better data from the portfolio's calculations.

```
