// Yes I understand the total unneccesity of using Yahoo finance data in Python, Javascript and now Rust.....
use chrono::{Datelike, Duration, NaiveDate, Utc, Weekday};
use reqwest::blocking::Client;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration as StdDuration;

const MIN_WEEKLY_RETURNS: usize = 104;
const ANNUAL_WEEKS: f64 = 52.0;
const OFF_DIAGONAL_SHRINKAGE: f64 = 0.90;

struct PriceSeries {
    daily: BTreeMap<NaiveDate, (f64, f64)>,
    session_end: Option<i64>,
}

pub struct MarketData {
    pub as_of_date: String,
    pub prices: Vec<f64>,
    pub annual_covariance: Vec<Vec<f64>>,
    pub observation_count: usize,
    pub first_week: String,
    pub last_week: String,
    pub weeks: Vec<String>,
    pub weekly_returns: Vec<Vec<f64>>,
}

// Love codex error handling
fn parse_chart(body: &Value, symbol: &str) -> Result<PriceSeries, String> {
    let result = body["chart"]["result"]
        .as_array()
        .and_then(|results| results.first())
        .ok_or_else(|| {
            format!(
                "Yahoo returned no chart for {symbol}: {}",
                body["chart"]["error"]
            )
        })?;
    if result["meta"]["currency"].as_str() != Some("USD") {
        return Err(format!("{symbol} did not return USD prices"));
    }
    if result["meta"]["symbol"]
        .as_str()
        .is_none_or(|returned| !returned.eq_ignore_ascii_case(symbol))
    {
        return Err(format!("Yahoo returned a different symbol for {symbol}"));
    }
    if !matches!(
        result["meta"]["instrumentType"].as_str(),
        Some("EQUITY" | "ETF" | "MUTUALFUND")
    ) {
        return Err(format!("{symbol} is not a supported stock or fund"));
    }
    let times = result["timestamp"]
        .as_array()
        .ok_or_else(|| format!("{symbol} has no timestamps"))?;
    let closes = result["indicators"]["quote"][0]["close"]
        .as_array()
        .ok_or_else(|| format!("{symbol} has no closing prices"))?;
    let adjusted = result["indicators"]["adjclose"][0]["adjclose"]
        .as_array()
        .ok_or_else(|| format!("{symbol} has no adjusted closes"))?;
    if times.len() != closes.len() || times.len() != adjusted.len() {
        return Err(format!("{symbol} chart arrays have different lengths"));
    }
    let mut daily = BTreeMap::new();
    for i in 0..times.len() {
        let (Some(timestamp), Some(close), Some(adjclose)) =
            (times[i].as_i64(), closes[i].as_f64(), adjusted[i].as_f64())
        else {
            continue;
        };
        let Some(date) =
            chrono::DateTime::from_timestamp(timestamp, 0).map(|value| value.date_naive())
        else {
            continue;
        };
        if close.is_finite() && close > 0.0 && adjclose.is_finite() && adjclose > 0.0 {
            daily.insert(date, (close, adjclose));
        }
    }
    if daily.is_empty() {
        return Err(format!("{symbol} has no usable price observations"));
    }
    Ok(PriceSeries {
        daily,
        session_end: result["meta"]["currentTradingPeriod"]["regular"]["end"].as_i64(),
    })
}

fn fetch_one(client: &Client, symbol: &str) -> Result<PriceSeries, String> {
    let mut url = reqwest::Url::parse("https://query1.finance.yahoo.com/v8/finance/chart/")
        .map_err(|error| error.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "Cannot build Yahoo URL")?
        .pop_if_empty()
        .push(symbol);
    url.query_pairs_mut()
        .append_pair("range", "3y")
        .append_pair("interval", "1d")
        .append_pair("includeAdjustedClose", "true");
    let response = client
        .get(url)
        .send()
        .map_err(|error| format!("Yahoo request for {symbol} failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Yahoo returned an error for {symbol}: {error}"))?;
    let body: Value = response
        .json()
        .map_err(|error| format!("Cannot decode Yahoo chart for {symbol}: {error}"))?;
    parse_chart(&body, symbol)
}

fn week_start(date: NaiveDate) -> NaiveDate {
    date - Duration::days(date.weekday().num_days_from_monday() as i64)
}

fn weekly_returns(series: &PriceSeries, latest_week: NaiveDate) -> BTreeMap<NaiveDate, f64> {
    let mut weekly_prices = BTreeMap::new();
    for (date, (_, adjusted)) in &series.daily {
        let week = week_start(*date);
        if week < latest_week {
            weekly_prices.insert(week, *adjusted);
        }
    }
    let mut returns = BTreeMap::new();
    for (week, price) in &weekly_prices {
        let previous = *week - Duration::weeks(1);
        if let Some(previous_price) = weekly_prices.get(&previous) {
            returns.insert(*week, price / previous_price - 1.0);
        }
    }
    returns
}

fn covariance(rows: &[Vec<f64>]) -> Result<Vec<Vec<f64>>, String> {
    let n = rows.len();
    let count = rows.first().map_or(0, Vec::len);
    if n == 0 || count < MIN_WEEKLY_RETURNS || rows.iter().any(|row| row.len() != count) {
        return Err(format!(
            "Need at least {MIN_WEEKLY_RETURNS} synchronized weekly returns for every ticker"
        ));
    }
    let means: Vec<f64> = rows
        .iter()
        .map(|row| row.iter().sum::<f64>() / count as f64)
        .collect();
    let mut matrix = vec![vec![0.0; n]; n];
    for i in 0..n {
        for j in 0..=i {
            let sample = (0..count)
                .map(|t| (rows[i][t] - means[i]) * (rows[j][t] - means[j]))
                .sum::<f64>()
                * ANNUAL_WEEKS
                / (count - 1) as f64;
            if !sample.is_finite() {
                return Err("Non-finite estimated covariance".into());
            }
            let value = if i == j {
                sample
            } else {
                sample * OFF_DIAGONAL_SHRINKAGE
            };
            matrix[i][j] = value;
            matrix[j][i] = value;
        }
        if matrix[i][i] <= 1e-8 {
            return Err("One ticker has near-zero historical variance".into());
        }
    }
    Ok(matrix)
}

pub fn fetch(symbols: &[String]) -> Result<MarketData, String> {
    if symbols.is_empty() {
        return Err("No tickers to fetch".into());
    }
    let client = Client::builder()
        .user_agent("CBF-Black-Litterman-Local-Prototype/0.1")
        .timeout(StdDuration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let mut series = Vec::with_capacity(symbols.len());
    for symbol in symbols {
        series.push(fetch_one(&client, symbol)?);
    }
    let common_dates = series
        .iter()
        .map(|item| item.daily.keys().copied().collect::<BTreeSet<_>>())
        .reduce(|left, right| left.intersection(&right).copied().collect())
        .ok_or("No prices returned")?;
    let as_of = *common_dates
        .last()
        .ok_or("No common trading date across tickers")?;
    if as_of > Utc::now().date_naive() || (Utc::now().date_naive() - as_of).num_days() > 7 {
        return Err(format!(
            "Yahoo prices are stale; last common date is {as_of}"
        ));
    }
    let prices: Vec<f64> = series.iter().map(|item| item.daily[&as_of].0).collect();
    // Friday's close completes a normal trading week; otherwise omit the partial week.
    let latest_week = week_start(as_of)
        + if as_of.weekday() == Weekday::Fri
            && (as_of < Utc::now().date_naive()
                || series.iter().all(|item| {
                    item.session_end
                        .is_some_and(|end| Utc::now().timestamp() >= end)
                }))
        {
            Duration::weeks(1)
        } else {
            Duration::zero()
        };
    let returns: Vec<BTreeMap<NaiveDate, f64>> = series
        .iter()
        .map(|item| weekly_returns(item, latest_week))
        .collect();
    let common_weeks = returns
        .iter()
        .map(|item| item.keys().copied().collect::<BTreeSet<_>>())
        .reduce(|left, right| left.intersection(&right).copied().collect())
        .ok_or("No weekly returns")?;
    if common_weeks.len() < MIN_WEEKLY_RETURNS {
        return Err(format!(
            "Only {} synchronized weekly returns; need {MIN_WEEKLY_RETURNS}",
            common_weeks.len()
        ));
    }
    let rows: Vec<Vec<f64>> = returns
        .iter()
        .map(|item| common_weeks.iter().map(|week| item[week]).collect())
        .collect();
    let annual_covariance = covariance(&rows)?;
    Ok(MarketData {
        as_of_date: as_of.to_string(),
        prices,
        annual_covariance,
        observation_count: common_weeks.len(),
        first_week: common_weeks.first().unwrap().to_string(),
        last_week: common_weeks.last().unwrap().to_string(),
        weeks: common_weeks.iter().map(ToString::to_string).collect(),
        weekly_returns: rows,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_adjusted_and_raw_closes_separately() {
        let body = serde_json::json!({"chart":{"result":[{"meta":{"currency":"USD","symbol":"TEST","instrumentType":"EQUITY"},
            "timestamp":[1725283800,1725370200],
            "indicators":{"quote":[{"close":[100.0,102.0]}],
                          "adjclose":[{"adjclose":[99.0,101.0]}]}}],"error":null}});
        let parsed = parse_chart(&body, "TEST").unwrap();
        assert_eq!(parsed.daily.len(), 2);
        assert_eq!(parsed.daily.values().next().unwrap().0, 100.0);
        assert_eq!(parsed.daily.values().next().unwrap().1, 99.0);
    }

    #[test]
    fn weekly_returns_exclude_partial_weeks_and_do_not_bridge_gaps() {
        let day = |value: &str| NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap();
        let series = PriceSeries {
            session_end: None,
            daily: BTreeMap::from([
                (day("2026-08-28"), (100.0, 100.0)),
                (day("2026-09-04"), (500.0, 110.0)),
                (day("2026-09-18"), (600.0, 121.0)),
                (day("2026-09-21"), (700.0, 200.0)),
            ]),
        };
        let returns = weekly_returns(&series, day("2026-09-21"));
        assert_eq!(returns.len(), 1);
        assert!((returns[&day("2026-08-31")] - 0.10).abs() < 1e-12);
    }

    #[test]
    fn annual_covariance_uses_sample_variance_and_off_diagonal_shrinkage() {
        let a: Vec<f64> = (0..104)
            .map(|index| if index % 2 == 0 { 0.01 } else { -0.01 })
            .collect();
        let b: Vec<f64> = a.iter().map(|value| value * 2.0).collect();
        let matrix = covariance(&[a, b]).unwrap();
        let variance = 104.0 * 0.0001 * 52.0 / 103.0;
        assert!((matrix[0][0] - variance).abs() < 1e-12);
        assert!((matrix[1][1] - variance * 4.0).abs() < 1e-12);
        assert!((matrix[0][1] - variance * 2.0 * 0.90).abs() < 1e-12);
        assert_eq!(matrix[0][1], matrix[1][0]);
        assert!(covariance(&[vec![0.0; 104]]).is_err());
        assert!(covariance(&[vec![0.01; 103]]).is_err());
    }
}
