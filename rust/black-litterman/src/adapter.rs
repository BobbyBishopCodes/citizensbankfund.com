use serde::Serialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebView {
    ticker: String,
    asset_class: AssetClass,
    target_price: f64,
    months: f64,
    confidence: f64,
}

#[derive(Deserialize)]
struct Request {
    snapshot: Snapshot,
    model: Model,
    view: WebView,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultPosition {
    ticker: String,
    asset_class: String,
    current_weight: f64,
    suggested_weight: f64,
    current_value_cents: i64,
    suggested_value_cents: i64,
    change_cents: i64,
}

fn class_for(symbol: &str) -> Option<AssetClass> {
    HOLDING_CLASSES
        .iter()
        .find_map(|(known, class)| (*known == symbol).then_some(*class))
}

fn budget(snapshot: &Snapshot) -> Result<(HashMap<String, i64>, i64, i64), String> {
    if snapshot.schema_version != 1 || snapshot.currency != "USD" || snapshot.as_of_date.is_empty()
    {
        return Err("Expected a dated USD portfolio".into());
    }
    let current = invested_values(snapshot)?;
    let mut nav = 0_i64;
    let mut cash = 0_i64;
    for position in &snapshot.positions {
        let quantity = position
            .quantity
            .parse::<f64>()
            .map_err(|_| "Invalid quantity")?;
        let price = position
            .reference_price
            .parse::<f64>()
            .map_err(|_| "Invalid price")?;
        if !quantity.is_finite() || quantity < 0.0 || !price.is_finite() || price <= 0.0 {
            return Err("Invalid portfolio price or quantity".into());
        }
        nav = nav
            .checked_add(position.reference_value_cents)
            .ok_or("Portfolio value overflow")?;
        if position.asset_type == "cash" {
            cash = cash
                .checked_add(position.reference_value_cents)
                .ok_or("Cash value overflow")?;
        }
    }
    if nav <= 0 || nav > 9_007_199_254_740_991 {
        return Err("Portfolio value is outside the supported range".into());
    }
    Ok((current, cash, nav))
}

fn rounded_values(weights: &[f64], nav: i64) -> Result<Vec<i64>, String> {
    if weights
        .iter()
        .any(|weight| !weight.is_finite() || *weight < 0.0)
        || (weights.iter().sum::<f64>() - 1.0).abs() > 1e-8
    {
        return Err("Allocation does not reconcile to the portfolio".into());
    }
    let raw: Vec<f64> = weights.iter().map(|weight| weight * nav as f64).collect();
    let mut cents: Vec<i64> = raw.iter().map(|value| value.floor() as i64).collect();
    let remainder = nav - cents.iter().sum::<i64>();
    if remainder < 0 || remainder as usize > weights.len() {
        return Err("Cannot reconcile allocation rounding".into());
    }
    let mut order: Vec<usize> = (0..weights.len()).collect();
    order.sort_by(|a, b| {
        (raw[*b] - cents[*b] as f64)
            .total_cmp(&(raw[*a] - cents[*a] as f64))
            .then(a.cmp(b))
    });
    for index in order.into_iter().take(remainder as usize) {
        cents[index] += 1;
    }
    Ok(cents)
}

fn calculate_request(mut request: Request) -> Result<serde_json::Value, String> {
    let (current, cash, nav) = budget(&request.snapshot)?;
    let invested = nav - cash;
    let ticker = request.view.ticker.trim().to_ascii_uppercase();
    if ticker.is_empty()
        || !request.view.target_price.is_finite()
        || request.view.target_price <= 0.0
        || !request.view.months.is_finite()
        || request.view.months <= 0.0
        || !request.view.confidence.is_finite()
        || !(0.0..=100.0).contains(&request.view.confidence)
    {
        return Err("Check the ticker, target price, horizon, and confidence".into());
    }
    let mut candidates = 0;
    for asset in &mut request.model.assets {
        asset.equilibrium_weight =
            *current.get(&asset.symbol).unwrap_or(&0) as f64 / invested as f64;
        if let Some(value) = current.get(&asset.symbol) {
            let position = request
                .snapshot
                .positions
                .iter()
                .find(|position| position.symbol.as_ref() == Some(&asset.symbol))
                .ok_or("Missing holding")?;
            let price = position
                .reference_price
                .parse::<f64>()
                .map_err(|_| "Invalid price")?;
            if (asset.current_price - price).abs() > 1e-8 || *value < 0 {
                return Err("Model prices do not match portfolio prices".into());
            }
        } else {
            candidates += 1;
            if asset.symbol != ticker {
                return Err("Only the selected candidate may enter the model".into());
            }
        }
        asset.asset_class = class_for(&asset.symbol).or(asset.asset_class);
    }
    if candidates > 1 {
        return Err("Unexpected candidate assets".into());
    }
    let k = request
        .model
        .assets
        .iter()
        .position(|asset| asset.symbol == ticker)
        .ok_or("Ticker has no published price history")?;
    request.model.assets[k].asset_class = if current.contains_key(&ticker) {
        request.model.assets[k].asset_class
    } else {
        Some(request.view.asset_class)
    };
    validate(&request.model, &request.snapshot)?;
    let constraints = allocation_constraints(&request.model)?;
    let view = View {
        ticker: ticker.clone(),
        asset_class: request.model.assets[k].asset_class,
        candidate_price: None,
        target_price: request.view.target_price,
        months: request.view.months,
        confidence: request.view.confidence / 100.0,
    };
    let price = request.model.assets[k].current_price;
    let q = target_excess(&view, price, request.model.risk_free_rate);
    if !q.is_finite() {
        return Err("The target price and horizon imply an unsupported return".into());
    }
    let (lambda, prior) = equilibrium(&request.model);
    if !lambda.is_finite() || lambda <= 0.0 || prior.iter().any(|value| !value.is_finite()) {
        return Err("Cannot infer equilibrium returns from this portfolio".into());
    }
    let selected = scenario(&request.model, k, q, view.confidence, lambda, &prior)?;
    let weights: Vec<f64> = selected
        .weights
        .iter()
        .copied()
        .chain([constraints.caps.cash])
        .collect();
    let values = rounded_values(&weights, nav)?;
    let mut positions: Vec<ResultPosition> = request
        .model
        .assets
        .iter()
        .enumerate()
        .map(|(index, asset)| {
            let old = *current.get(&asset.symbol).unwrap_or(&0);
            ResultPosition {
                ticker: asset.symbol.clone(),
                asset_class: constraints.classes[index].label().into(),
                current_weight: old as f64 / nav as f64,
                suggested_weight: weights[index],
                current_value_cents: old,
                suggested_value_cents: values[index],
                change_cents: values[index] - old,
            }
        })
        .collect();
    positions.push(ResultPosition {
        ticker: "CASH".into(),
        asset_class: "Cash".into(),
        current_weight: cash as f64 / nav as f64,
        suggested_weight: constraints.caps.cash,
        current_value_cents: cash,
        suggested_value_cents: values[values.len() - 1],
        change_cents: values[values.len() - 1] - cash,
    });
    let sensitivity = [(view.confidence - 0.10).max(0.0), view.confidence, (view.confidence + 0.10).min(1.0)]
        .into_iter().map(|confidence| {
            let case = scenario(&request.model, k, q, confidence, lambda, &prior)?;
            Ok(serde_json::json!({"confidence": confidence, "suggestedWeight": case.weights[k], "posteriorExcessReturn": case.posterior[k]}))
        }).collect::<Result<Vec<_>, String>>()?;
    Ok(
        serde_json::json!({"ticker": ticker, "assetClass": constraints.classes[k].label(), "currentPrice": price,
        "navCents": nav, "positions": positions, "prior": prior, "posterior": selected.posterior, "lambda": lambda,
        "annualizedTargetReturn": q + request.model.risk_free_rate, "targetExcessReturn": q,
        "omega": selected.omega.is_finite().then_some(selected.omega), "sensitivity": sensitivity,
        "riskFreeRate": request.model.risk_free_rate, "marketExcessReturn": request.model.market_excess_return, "tau": request.model.tau}),
    )
}

pub fn calculate_json(input: &[u8]) -> String {
    let result = serde_json::from_slice::<Request>(input)
        .map_err(|_| "Invalid model request".to_string())
        .and_then(calculate_request);
    match result {
        Ok(value) => serde_json::json!({"ok": true, "result": value}).to_string(),
        Err(error) => serde_json::json!({"ok": false, "error": error}).to_string(),
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn refresh_json(holdings: &[u8], config: &[u8]) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Config {
        classes: HashMap<String, AssetClass>,
        #[serde(default)]
        candidates: HashMap<String, AssetClass>,
    }
    let snapshot: Snapshot = serde_json::from_slice(holdings).map_err(|error| error.to_string())?;
    let config: Config = serde_json::from_slice(config).map_err(|error| error.to_string())?;
    budget(&snapshot)?;
    let mut classes = std::collections::BTreeMap::new();
    let mut holdings_symbols = Vec::new();
    for position in snapshot
        .positions
        .iter()
        .filter(|position| position.asset_type != "cash")
    {
        let symbol = position.symbol.clone().ok_or("Missing holding ticker")?;
        let class = class_for(&symbol)
            .or(config.classes.get(&symbol).copied())
            .or_else(|| (position.asset_type == "stock").then_some(AssetClass::Equities))
            .ok_or_else(|| format!("Configure an asset class for {symbol}"))?;
        holdings_symbols.push(symbol.clone());
        classes.insert(symbol, class);
    }
    for (symbol, class) in config.candidates {
        classes
            .entry(symbol.clone())
            .or_insert(class_for(&symbol).unwrap_or(class));
    }
    let symbols: Vec<String> = classes.keys().cloned().collect();
    if symbols.len() > 200
        || symbols.iter().any(|symbol| {
            symbol.is_empty()
                || symbol.len() > 15
                || !symbol.bytes().all(|value| {
                    value.is_ascii_uppercase()
                        || value.is_ascii_digit()
                        || matches!(value, b'.' | b'-')
                })
        })
    {
        return Err("Configure at most 200 valid USD tickers".into());
    }
    let market = yahoo::fetch(&symbols)?;
    holdings_symbols.sort();
    let assets: Vec<serde_json::Value> = symbols.iter().enumerate().map(|(index, symbol)| serde_json::json!({
        "symbol": symbol, "assetClass": classes[symbol].label().to_ascii_lowercase(), "closingPrice": market.prices[index]
    })).collect();
    Ok(serde_json::json!({"schemaVersion": 1, "holdingsSymbols": holdings_symbols, "assets": assets,
        "historyAsOf": market.as_of_date, "firstWeek": market.first_week, "lastWeek": market.last_week,
        "observations": market.observation_count, "annualCovariance": market.annual_covariance,
        "weeks": market.weeks, "weeklyReturns": market.weekly_returns,
        "riskFreeRate": 0.03, "marketExcessReturn": 0.05, "tau": 0.025,
        "caps": {"cash": ALLOCATION_CAPS.cash, "bonds": ALLOCATION_CAPS.bonds, "commodities": ALLOCATION_CAPS.commodities,
            "international": ALLOCATION_CAPS.international, "equities": ALLOCATION_CAPS.equities},
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "source": "Yahoo Finance adjusted-close weekly returns; 52-week annualization; 10% off-diagonal covariance shrinkage"
    }).to_string())
}
