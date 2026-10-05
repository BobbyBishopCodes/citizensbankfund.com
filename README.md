URL: citizensbankfund.com
Designed and Engineered by Robert Bishop a Accounting & Finance student at ETSU on behalf of the Citizens Bank Fund..

## Official Website of ETSU's Citizens Bank & Laporte Fund

- Created by Robert Bishop

## Publishing and stock prices

One-time setup:

1. Add `FINNHUB_API_KEY` under Settings → Secrets and variables → Actions → New repository secret.
2. Push the workflow to `main`, then change Settings → Pages → Source to **GitHub Actions**. Keep the custom domain and HTTPS settings.
3. Run **Publish site and refresh portfolio prices** from the Actions tab. Confirm the build and deploy jobs succeed.

The workflow builds from source on each push and refreshes prices approximately every 15 minutes on weekdays, 9:30 AM–4:30 PM New York time, including daylight saving changes.

For the uhh csv holdings, run `npm run portfolio:prepare -- "path/to/export.csv" --as-of YYYY-MM-DD`, review `content/portfolio/holdings.json`, and commit and push it. The workflow builds the site and prices the new quantities. Rebuilding or committing `docs` is no longer required because I switched from pages to actions.

Check Actions for failed runs. Public repositories can have scheduled workflows disabled after 60 days without repository activity; re-enable the workflow in Actions if that happens.

** Possible Future Editions**

```
CPI & PPI Forecasting

User Logins & Direct Blog Uploads with LinkedIn bot auto-uploads of some sort
Events

Macro based effects on each equity per month or per investing period

Macro monthly reports

Excel export of better data from the portfolio's calculations.

3d version of Riley's AI algo stuff & it doesn't matter amount so it doesn't needd to be dynamic maybe everytime we notice a change in positions



```
