# Sharpe & Beta

### How We Calculate the Portfolio Metrics

Robert Bishop

---

## Imports / Packages

- Yahoo Finance adjusted closing prices, retrieved with Python's `yfinance` package, for each security currently held.
- Federal Reserve FRED series `SP500` (S&P 500 price index) and `DGS3MO` (annualized 3-month Treasury yield).
- The final calculations use ordinary JavaScript arithmetic no R....

## Timeframe

We use **36 monthly returns** over three years, ending with the latest completed calendar month in New York time. That requires **37 month-end closing prices**: one starting value and 36 ending values. For example, on October 1, 2026, the intended return window is October 2023 through September 2026, using closing prices from September 2023 through September 2026. If the latest month is incomplete in the source data, we use the preceding 36-month window. If that window is also incomplete, Sharpe and beta are unavailable.

## Monthly returns

**Each security's monthly return** = (adjusted close this month / adjusted close last month) - 1.

**Portfolio monthly return** = sum of each security's monthly return multiplied by its current portfolio weight. The weights come from the current portfolio value and include cash in the total. Cash contributes a zero return. These are historical returns at today's weights, not the fund's actual historical account returns.

**S&P 500 monthly return** = (SP500 month-end value / prior month-end value) - 1. SP500 is a price index, while the security prices are adjusted for splits and dividends.

**Monthly risk-free return** = (1 + prior month's DGS3MO yield / 100)^(1/12) - 1. We use the last available Treasury observation in the prior month. Monthly excess return = portfolio monthly return - monthly risk-free return.

## Beta

**Beta** = covariance of the 36 portfolio and S&P 500 monthly returns / variance of the 36 S&P 500 monthly returns. Both use the sample calculation (divide by 35). A beta of 1 means the portfolio's monthly returns moved about one-for-one with the index over this window.

## Sharpe ratio

**Sharpe** = square root of 12 × average monthly excess return / sample standard deviation of the 36 monthly excess returns. The square root of 12 annualizes the ratio. Higher values mean more excess return per unit of monthly return variability over this window.
