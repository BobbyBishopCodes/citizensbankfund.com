// Black Litterman Model
// Coded by Robert Bishop a Accounting & Finance student at ETSU, created on behalf of the Citizens Bank Fund check us out at www.citizensbankfund.com
// Please read the README.md

use serde::Deserialize;
use std::collections::{HashMap, HashSet};
#[cfg(test)]
use std::fs;
#[cfg(test)]
use std::io::{self, Write};

#[path = "allocation.rs"]
mod allocation;
#[cfg(not(target_arch = "wasm32"))]
#[path = "yahoo.rs"]
mod yahoo;

use allocation::{AssetClass, Caps, Constraints};

// If u want to u can change the allocation values here
// Refer to the top of allocations.rs for a explanation of what this is
const ALLOCATION_CAPS: Caps = Caps {
    cash: 0.05,
    bonds: 0.15,
    commodities: 0.08,
    international: 0.08,
    equities: 0.64,
};


// One-year Treasury CMT, October 6, 2026 (home.treasury.gov daily par yields).
const RISK_FREE_RATE: f64 = 0.0446;
const RISK_FREE_RATE_AS_OF: &str = "2026-10-06";

// Can autoset classes, incase of someone miss-identifying will auto correct for them, probably should come up with a dynamic way of doign this but oh well
const HOLDING_CLASSES: &[(&str, AssetClass)] = &[
    ("BINC", AssetClass::Bonds),
    ("IEF", AssetClass::Bonds),
    ("HYG", AssetClass::Bonds),
    ("VGSH", AssetClass::Bonds),
    ("GLD", AssetClass::Commodities),
    ("EWJ", AssetClass::International),
    ("INDA", AssetClass::International),
    ("BMY", AssetClass::Equities),
    ("COF", AssetClass::Equities),
    ("CI", AssetClass::Equities),
    ("CSCO", AssetClass::Equities),
    ("GE", AssetClass::Equities),
    ("QQQM", AssetClass::Equities),
    ("SPHD", AssetClass::Equities),
    ("MSFT", AssetClass::Equities),
    ("PG", AssetClass::Equities),
    ("XLE", AssetClass::Equities),
    ("TTWO", AssetClass::Equities),
    ("U", AssetClass::Equities),
    ("VDC", AssetClass::Equities),
    ("VOO", AssetClass::Equities),
];

#[cfg(test)]
const HOLDINGS: &str = include_str!("../../../tests/fixtures/black-litterman/holdings.json");
const INPUT_ERROR: &str = "Error 1: input";
const DATA_ERROR: &str = "Error 2: data";
const MODEL_ERROR: &str = "Error 3: calculation";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    schema_version: u32,
    as_of_date: String,
    currency: String,
    positions: Vec<Position>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Position {
    symbol: Option<String>,
    asset_type: String,
    quantity: String,
    reference_price: String,
    reference_value_cents: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    as_of_date: String,
    source: String,
    risk_free_rate: f64,
    market_excess_return: f64,
    tau: f64,
    assets: Vec<Asset>,
    annual_covariance: Vec<Vec<f64>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Asset {
    symbol: String,
    current_price: f64,
    equilibrium_weight: f64,
    #[serde(default)]
    asset_class: Option<AssetClass>,
}

struct View {
    ticker: String,
    asset_class: Option<AssetClass>,
    candidate_price: Option<f64>,
    target_price: f64,
    expected_annual_yield: f64,
    months: f64,
    confidence: f64,
}

struct Scenario {
    confidence: f64,
    omega: f64,
    posterior: Vec<f64>,
    weights: Vec<f64>,
}

#[cfg(test)]
fn load_holdings() -> Result<Snapshot, String> {
    let snapshot: Snapshot = serde_json::from_str(HOLDINGS).map_err(|e| e.to_string())?;
    if snapshot.schema_version != 1 || snapshot.currency != "USD" || snapshot.as_of_date.is_empty()
    {
        return Err("Expected a dated USD holdings snapshot with schema version 1".into());
    }
    Ok(snapshot)
}

fn invested_values(snapshot: &Snapshot) -> Result<HashMap<String, i64>, String> {
    let mut values = HashMap::new();
    for position in &snapshot.positions {
        if position.reference_value_cents < 0 {
            return Err("Negative holding value".into());
        }
        if position.asset_type == "cash" {
            continue;
        }
        if position.asset_type != "stock" && position.asset_type != "fund" {
            return Err(format!("Unsupported asset type: {}", position.asset_type));
        }
        let symbol = position.symbol.as_ref().ok_or("Missing invested symbol")?;
        if values
            .insert(symbol.clone(), position.reference_value_cents)
            .is_some()
        {
            return Err(format!("Duplicate holding: {symbol}"));
        }
    }
    if values.is_empty() || values.values().all(|v| *v == 0) {
        return Err("No invested holdings".into());
    }
    Ok(values)
}

#[cfg(test)]
fn demo_model(snapshot: &Snapshot) -> Result<Model, String> {
    let total: i64 = invested_values(snapshot)?.values().sum();
    let assets = snapshot
        .positions
        .iter()
        .filter(|p| p.asset_type != "cash")
        .map(|p| {
            let symbol = p.symbol.clone().ok_or("Missing invested symbol")?;
            let current_price = p
                .reference_price
                .parse::<f64>()
                .map_err(|_| format!("Invalid price for {symbol}"))?;
            Ok(Asset {
                symbol,
                current_price,
                equilibrium_weight: p.reference_value_cents as f64 / total as f64,
                asset_class: None,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let n = assets.len();
    // Invented annual covariance: 25% volatility and 0.20 pairwise correlation.
    // Atleast I think, should math up
    let annual_covariance = (0..n)
        .map(|i| {
            (0..n)
                .map(|j| if i == j { 0.0625 } else { 0.0125 })
                .collect()
        })
        .collect();
    Ok(Model {
        as_of_date: snapshot.as_of_date.clone(),
        source: "DEMO: portfolio weights as equilibrium proxy; invented risk data".into(),
        risk_free_rate: RISK_FREE_RATE,
        market_excess_return: 0.05,
        tau: 0.025,
        assets,
        annual_covariance,
    })
}

#[cfg(test)]
fn yahoo_model(snapshot: &mut Snapshot, view_ticker: &str) -> Result<Model, String> {
    let mut symbols = snapshot
        .positions
        .iter()
        .filter(|p| p.asset_type != "cash")
        .map(|p| {
            p.symbol
                .clone()
                .ok_or_else(|| "Missing invested symbol".to_string())
        })
        .collect::<Result<Vec<_>, String>>()?;
    let candidate = !symbols.iter().any(|symbol| symbol == view_ticker);
    if candidate {
        symbols.push(view_ticker.to_string());
    }
    let market = yahoo::fetch(&symbols)?;
    let mut index = 0;
    for position in &mut snapshot.positions {
        if position.asset_type == "cash" {
            continue;
        }
        let price = market.prices[index];
        let quantity = position
            .quantity
            .parse::<f64>()
            .map_err(|_| format!("Invalid holding quantity for {}", symbols[index]))?;
        let cents = (quantity * price * 100.0).round();
        if !quantity.is_finite() || quantity < 0.0 || !cents.is_finite() || cents > i64::MAX as f64
        {
            return Err(format!("Cannot value holding {}", symbols[index]));
        }
        position.reference_price = price.to_string();
        position.reference_value_cents = cents as i64;
        index += 1;
    }
    snapshot.as_of_date = market.as_of_date.clone();
    let values = invested_values(snapshot)?;
    let total: i64 = values.values().sum();
    let assets = symbols
        .iter()
        .enumerate()
        .map(|(i, symbol)| Asset {
            symbol: symbol.clone(),
            current_price: market.prices[i],
            equilibrium_weight: *values.get(symbol).unwrap_or(&0) as f64 / total as f64,
            asset_class: None,
        })
        .collect();
    Ok(Model {
        as_of_date: market.as_of_date,
        source: format!(
            "Yahoo Finance daily closes and adjusted-close weekly returns, {} common weeks ({} to {}); snapshot quantities marked to common close; portfolio weights are equilibrium proxy; 10% off-diagonal covariance shrinkage; {:.2}% one-year Treasury as of {}; assumed 5% market premium",
            market.observation_count, market.first_week, market.last_week, RISK_FREE_RATE * 100.0, RISK_FREE_RATE_AS_OF
        ),
        risk_free_rate: RISK_FREE_RATE,
        market_excess_return: 0.05,
        tau: 0.025,
        assets,
        annual_covariance: market.annual_covariance,
    })
}

#[cfg(test)]
fn add_demo_candidate(model: &mut Model, symbol: String, price: f64) {
    // Extend the same invented covariance used for the existing demo holdings...
    for row in &mut model.annual_covariance {
        row.push(0.0125);
    }
    model
        .annual_covariance
        .push(vec![0.0125; model.assets.len()]);
    model.annual_covariance.last_mut().unwrap().push(0.0625);
    model.assets.push(Asset {
        symbol,
        current_price: price,
        equilibrium_weight: 0.0,
        asset_class: None,
    });
    model.source.push_str(
        "; candidate price supplied by user, with zero prior weight and invented covariance",
    );
}

fn validate(model: &Model, snapshot: &Snapshot) -> Result<(), String> {
    let n = model.assets.len();
    if n == 0 || model.as_of_date != snapshot.as_of_date || model.source.trim().is_empty() {
        return Err("Model source and as-of date must match the holdings".into());
    }
    if !model.risk_free_rate.is_finite()
        || !model.market_excess_return.is_finite()
        || model.market_excess_return <= 0.0
        || !model.tau.is_finite()
        || model.tau <= 0.0
    {
        return Err("Invalid risk-free rate, market premium, or tau".into());
    }
    let mut seen = HashSet::new();
    for asset in &model.assets {
        if asset.symbol.is_empty()
            || !seen.insert(asset.symbol.as_str())
            || !asset.current_price.is_finite()
            || asset.current_price <= 0.0
            || !asset.equilibrium_weight.is_finite()
            || asset.equilibrium_weight < 0.0
        {
            return Err(format!(
                "Invalid or duplicate model asset: {}",
                asset.symbol
            ));
        }
    }
    if (model
        .assets
        .iter()
        .map(|a| a.equilibrium_weight)
        .sum::<f64>()
        - 1.0)
        .abs()
        > 1e-8
    {
        return Err("Equilibrium weights must sum to one".into());
    }
    for symbol in invested_values(snapshot)?.keys() {
        if !seen.contains(symbol.as_str()) {
            return Err(format!("Model lacks holding {symbol}"));
        }
    }
    if model.annual_covariance.len() != n
        || model
            .annual_covariance
            .iter()
            .any(|row| row.len() != n || row.iter().any(|v| !v.is_finite()))
    {
        return Err("Covariance dimensions must match the assets".into());
    }
    let mut lower = vec![vec![0.0; n]; n];
    for i in 0..n {
        for j in 0..=i {
            if (model.annual_covariance[i][j] - model.annual_covariance[j][i]).abs() > 1e-10 {
                return Err("Covariance must be symmetric".into());
            }
            let prior: f64 = (0..j).map(|k| lower[i][k] * lower[j][k]).sum();
            if i == j {
                let diagonal = model.annual_covariance[i][i] - prior;
                if diagonal <= 1e-12 {
                    return Err("Covariance must be positive definite".into());
                }
                lower[i][j] = diagonal.sqrt();
            } else {
                lower[i][j] = (model.annual_covariance[i][j] - prior) / lower[j][j];
            }
        }
    }
    Ok(())
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn multiply(matrix: &[Vec<f64>], vector: &[f64]) -> Vec<f64> {
    matrix.iter().map(|row| dot(row, vector)).collect()
}

// Idzorek section 1.1: Pi = lambda * Sigma * equilibrium weights.
fn equilibrium(model: &Model) -> (f64, Vec<f64>) {
    let weights: Vec<f64> = model.assets.iter().map(|a| a.equilibrium_weight).collect();
    let sigma_w = multiply(&model.annual_covariance, &weights);
    let lambda = model.market_excess_return / dot(&weights, &sigma_w);
    (lambda, sigma_w.into_iter().map(|v| lambda * v).collect())
}

fn allocation_constraints(model: &Model) -> Result<Constraints, String> {
    let classes = model
        .assets
        .iter()
        .map(|asset| {
            let configured = HOLDING_CLASSES
                .iter()
                .find_map(|(symbol, class)| (*symbol == asset.symbol).then_some(*class));
            if let (Some(known), Some(supplied)) = (configured, asset.asset_class)
                && known != supplied
            {
                return Err(format!("Conflicting asset class for {}", asset.symbol));
            }
            configured
                .or(asset.asset_class)
                .ok_or_else(|| format!("Asset {} requires an asset class", asset.symbol))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Constraints::new(classes, ALLOCATION_CAPS)
}

fn target_excess(view: &View, price: f64, risk_free: f64) -> f64 {
    // Add annual cash yield to annualized price appreciation; no dividend reinvestment.
    (view.target_price / price).powf(12.0 / view.months) - 1.0 + view.expected_annual_yield - risk_free
}

// Single absolute view P selects asset k. This Omega makes C the fraction of
// the full-confidence *unconstrained* tilt (Idzorek section 3). The long-only
// class constraints below can change that fraction when a constraint binds which is no bueno
fn scenario(
    model: &Model,
    k: usize,
    q: f64,
    confidence: f64,
    lambda: f64,
    prior: &[f64],
) -> Result<Scenario, String> {
    let variance = model.annual_covariance[k][k];
    let omega = if confidence == 0.0 {
        f64::INFINITY
    } else {
        model.tau * variance * (1.0 - confidence) / confidence
    };
    let posterior = prior
        .iter()
        .enumerate()
        .map(|(i, base)| {
            base + confidence * model.annual_covariance[i][k] / variance * (q - prior[k])
        })
        .collect::<Vec<_>>();
    let constraints = allocation_constraints(model)?;
    let weights = allocation::optimize(&posterior, &model.annual_covariance, lambda, &constraints)?;
    Ok(Scenario {
        confidence,
        omega,
        posterior,
        weights,
    })
}

#[cfg(test)]
fn prompt(label: &str) -> Result<String, &'static str> {
    print!("{label}: ");
    io::stdout().flush().map_err(|_| INPUT_ERROR)?;
    let mut line = String::new();
    io::stdin().read_line(&mut line).map_err(|_| INPUT_ERROR)?;
    if line.trim().is_empty() {
        return Err(INPUT_ERROR);
    }
    Ok(line.trim().to_string())
}

#[cfg(test)]
fn argument(
    values: &HashMap<&str, String>,
    key: &str,
    label: &str,
    allow_prompts: bool,
) -> Result<String, &'static str> {
    match values.get(key) {
        Some(value) => Ok(value.clone()),
        None if allow_prompts => prompt(label),
        None => Err(INPUT_ERROR),
    }
}

#[cfg(test)]
fn parse_asset_class(value: &str) -> Result<AssetClass, &'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "bonds" => Ok(AssetClass::Bonds),
        "commodities" => Ok(AssetClass::Commodities),
        "international" => Ok(AssetClass::International),
        "equities" => Ok(AssetClass::Equities),
        _ => Err(INPUT_ERROR),
    }
}

#[cfg(test)]
fn input(args: &[String], allow_prompts: bool) -> Result<View, &'static str> {
    let mut values = HashMap::new();
    for chunk in args.chunks(2) {
        if chunk.len() != 2
            || !matches!(
                chunk[0].as_str(),
                "--ticker" | "--price" | "--target" | "--months" | "--confidence" | "--asset-class"
            )
        {
            return Err(INPUT_ERROR);
        }
        if values.insert(chunk[0].as_str(), chunk[1].clone()).is_some() {
            return Err(INPUT_ERROR);
        }
    }
    let ticker = argument(&values, "--ticker", "Ticker", allow_prompts)?.to_uppercase();
    let asset_class = values
        .get("--asset-class")
        .map(|value| parse_asset_class(value))
        .transpose()?;
    let candidate_price = values
        .get("--price")
        .map(|value| value.parse::<f64>().map_err(|_| INPUT_ERROR))
        .transpose()?;
    let target_price = argument(&values, "--target", "Target price in USD", allow_prompts)?
        .parse::<f64>()
        .map_err(|_| INPUT_ERROR)?;
    let months = argument(&values, "--months", "Horizon in months", allow_prompts)?
        .parse::<f64>()
        .map_err(|_| INPUT_ERROR)?;
    let percent = argument(
        &values,
        "--confidence",
        "Confidence, 0-100 percent",
        allow_prompts,
    )?
    .parse::<f64>()
    .map_err(|_| INPUT_ERROR)?;
    if ticker.is_empty()
        || candidate_price.is_some_and(|price| !price.is_finite() || price <= 0.0)
        || !target_price.is_finite()
        || target_price <= 0.0
        || !months.is_finite()
        || months <= 0.0
        || !percent.is_finite()
        || !(0.0..=100.0).contains(&percent)
    {
        return Err(INPUT_ERROR);
    }
    Ok(View {
        ticker,
        asset_class,
        candidate_price,
        target_price,
        expected_annual_yield: 0.0,
        months,
        confidence: percent / 100.0,
    })
}

#[cfg(test)]
fn run() -> Result<(), &'static str> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || args.iter().any(|a| a == "--help") {
        println!(
            "Usage: cargo run -- --yahoo --ticker MSFT --target 600 --months 12 --confidence 50"
        );
        println!(
            "   or: cargo run -- --demo [--ticker XYZ --asset-class equities --price 100 --target 120 --months 12 --confidence 50]"
        );
        println!("   or: cargo run -- --model PATH [same optional view arguments]");
        println!("--demo uses Yahoo unless --price is supplied for an offline example.");
        println!(
            "New tickers require --asset-class bonds|commodities|international|equities, or assetClass in model JSON."
        );
        println!("--demo prompts for the asset class when a new ticker needs one.");
        return Ok(());
    }
    let mut snapshot = load_holdings().map_err(|_| DATA_ERROR)?;
    let demo = args[0] == "--demo";
    let yahoo = args[0] == "--yahoo";
    let view_args = if demo || yahoo {
        &args[1..]
    } else if args[0] == "--model" && args.len() > 1 {
        &args[2..]
    } else {
        return Err(INPUT_ERROR);
    };
    let mut view = input(view_args, !yahoo)?;
    if demo
        && view.asset_class.is_none()
        && !HOLDING_CLASSES
            .iter()
            .any(|(symbol, _)| *symbol == view.ticker)
    {
        view.asset_class = Some(parse_asset_class(&prompt(
            "Asset class (bonds, commodities, international, equities)",
        )?)?);
    }
    if yahoo && view.candidate_price.is_some() {
        return Err(INPUT_ERROR);
    }
    if let Some(class) = view.asset_class
        && HOLDING_CLASSES
            .iter()
            .any(|(symbol, known)| *symbol == view.ticker && *known != class)
    {
        eprintln!(
            "Asset class conflicts with HOLDING_CLASSES for {}.",
            view.ticker
        );
        return Err(INPUT_ERROR);
    }
    if (demo || yahoo)
        && !HOLDING_CLASSES
            .iter()
            .any(|(symbol, _)| *symbol == view.ticker)
        && view.asset_class.is_none()
    {
        eprintln!("New tickers require --asset-class bonds|commodities|international|equities.");
        return Err(INPUT_ERROR);
    }
    let live = yahoo || (demo && view.candidate_price.is_none());
    let mut model = if live {
        yahoo_model(&mut snapshot, &view.ticker).map_err(|_| DATA_ERROR)?
    } else if demo {
        demo_model(&snapshot).map_err(|_| DATA_ERROR)?
    } else {
        let json = fs::read_to_string(&args[1]).map_err(|_| DATA_ERROR)?;
        let model: Model = serde_json::from_str(&json).map_err(|_| DATA_ERROR)?;
        for position in snapshot.positions.iter().filter(|p| p.asset_type != "cash") {
            let symbol = position.symbol.as_ref().ok_or(DATA_ERROR)?;
            let price = position
                .reference_price
                .parse::<f64>()
                .map_err(|_| DATA_ERROR)?;
            let asset = model
                .assets
                .iter()
                .find(|asset| &asset.symbol == symbol)
                .ok_or(DATA_ERROR)?;
            if (asset.current_price - price).abs() > 0.005 {
                return Err(DATA_ERROR);
            }
        }
        model
    };
    if model.assets.iter().any(|asset| asset.symbol == view.ticker) {
        if view.candidate_price.is_some() {
            return Err(INPUT_ERROR);
        }
    } else if demo {
        let price = view.candidate_price.ok_or(INPUT_ERROR)?;
        add_demo_candidate(&mut model, view.ticker.clone(), price);
    }
    validate(&model, &snapshot).map_err(|_| DATA_ERROR)?;
    let k = model
        .assets
        .iter()
        .position(|a| a.symbol == view.ticker)
        .ok_or(INPUT_ERROR)?;
    if let Some(class) = view.asset_class {
        let asset = &mut model.assets[k];
        if asset.asset_class.is_some_and(|existing| existing != class) {
            return Err(INPUT_ERROR);
        }
        asset.asset_class = Some(class);
    }
    let constraints = allocation_constraints(&model).map_err(|message| {
        eprintln!("{message}");
        DATA_ERROR
    })?;
    let current = invested_values(&snapshot).map_err(|_| DATA_ERROR)?;
    let invested_budget: i64 = current.values().sum();
    let cash: i64 = snapshot
        .positions
        .iter()
        .filter(|p| p.asset_type == "cash")
        .map(|p| p.reference_value_cents)
        .sum();
    let budget = invested_budget.checked_add(cash).ok_or(DATA_ERROR)?;
    let price = model.assets[k].current_price;
    let q = target_excess(&view, price, model.risk_free_rate);
    if !q.is_finite() {
        return Err(INPUT_ERROR);
    }
    let (lambda, prior) = equilibrium(&model);
    let confidences = [
        (view.confidence - 0.10).max(0.0),
        view.confidence,
        (view.confidence + 0.10).min(1.0),
    ];
    let cases = confidences
        .map(|c| scenario(&model, k, q, c, lambda, &prior))
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| MODEL_ERROR)?;
    println!(
        "\nBLACK-LITTERMAN TEST | holdings {} | model {}",
        snapshot.as_of_date, model.as_of_date
    );
    println!("Source: {}", model.source);
    println!(
        "Total portfolio budget USD {:.2}; cash included in allocation targets.",
        budget as f64 / 100.0
    );
    println!(
        "{}: price USD {:.2}, target USD {:.2} in {:.1} months",
        view.ticker, price, view.target_price, view.months
    );
    println!(
        "Annualized target return {:.2}%; excess return {:.2}%",
        (q + model.risk_free_rate) * 100.0,
        q * 100.0
    );
    println!(
        "Risk-free {:.2}%; market premium {:.2}%; lambda {:.3}; tau {:.3}",
        model.risk_free_rate * 100.0,
        model.market_excess_return * 100.0,
        lambda,
        model.tau
    );
    println!(
        "Prior excess return for {}: {:.2}%",
        view.ticker,
        prior[k] * 100.0
    );
    println!("Cash modeled at the risk-free rate with zero excess return and zero covariance.");
    println!(
        "Equilibrium proxy remains normalized invested holdings; targets constrain the final allocation."
    );
    println!("Targets sum to 100%, so full allocation requires each class budget exactly.");
    println!("\nConfidence sensitivity (not statistical confidence intervals):");
    println!(
        "Confidence | View omega | Posterior excess | Target weight | Target USD | Change USD"
    );
    for case in &cases {
        let dollars = case.weights[k] * budget as f64 / 100.0;
        let old = *current.get(&view.ticker).unwrap_or(&0) as f64 / 100.0;
        println!(
            "{:>9.0}% | {:>10.6} | {:>15.2}% | {:>12.2}% | {:>10.2} | {:>+10.2}",
            case.confidence * 100.0,
            case.omega,
            case.posterior[k] * 100.0,
            case.weights[k] * 100.0,
            dollars,
            dollars - old
        );
    }
    println!("\nSelected confidence allocation (percent of total portfolio):");
    println!("Class         | Targets  | Target weight | Target USD | Change USD");
    let cash_target = constraints.caps.cash * budget as f64 / 100.0;
    println!(
        "{:13} | {:>7.2}% | {:>12.2}% | {:>10.2} | {:>+10.2}",
        "Cash",
        constraints.caps.cash * 100.0,
        constraints.caps.cash * 100.0,
        cash_target,
        cash_target - cash as f64 / 100.0
    );
    for class in AssetClass::ALL {
        let weight = constraints.total(&cases[1].weights, class);
        let old: i64 = model
            .assets
            .iter()
            .zip(&constraints.classes)
            .filter(|(_, c)| **c == class)
            .map(|(asset, _)| *current.get(&asset.symbol).unwrap_or(&0))
            .sum();
        let dollars = weight * budget as f64 / 100.0;
        println!(
            "{:13} | {:>7.2}% | {:>12.2}% | {:>10.2} | {:>+10.2}",
            class.label(),
            constraints.caps.limit(class) * 100.0,
            weight * 100.0,
            dollars,
            dollars - old as f64 / 100.0
        );
    }
    let total_weight = cases[1].weights.iter().sum::<f64>() + constraints.caps.cash;
    println!("Total allocation: {:.6}%", total_weight * 100.0);
    let mut changes: Vec<(&str, f64)> = model
        .assets
        .iter()
        .enumerate()
        .map(|(i, asset)| {
            let old = *current.get(&asset.symbol).unwrap_or(&0) as f64 / 100.0;
            (
                asset.symbol.as_str(),
                cases[1].weights[i] * budget as f64 / 100.0 - old,
            )
        })
        .collect();
    changes.push(("CASH", cash_target - cash as f64 / 100.0));
    changes.sort_by(|a, b| a.1.total_cmp(&b.1));
    println!("\nLargest modeled reductions from current holdings:");
    for (symbol, change) in changes.iter().filter(|(_, change)| *change < -0.005) {
        println!("  {symbol:>5}  USD {:.2}", -change);
    }
    println!("Largest modeled additions:");
    for (symbol, change) in changes.iter().rev().filter(|(_, change)| *change > 0.005) {
        println!("  {symbol:>5}  USD {:.2}", change);
    }
    Ok(())
}

#[cfg(test)]
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_class_input_accepts_only_supported_buckets() {
        for (text, expected) in [
            ("bonds", AssetClass::Bonds),
            ("commodities", AssetClass::Commodities),
            ("international", AssetClass::International),
            (" Equities ", AssetClass::Equities),
        ] {
            assert_eq!(parse_asset_class(text).unwrap(), expected);
        }
        assert!(parse_asset_class("stock").is_err());
        assert!(parse_asset_class("cash").is_err());
        assert!(parse_asset_class("").is_err());
    }

    #[test]
    fn zero_confidence_keeps_prior_returns_and_obeys_caps() {
        let model = demo_model(&load_holdings().unwrap()).unwrap();
        let (lambda, prior) = equilibrium(&model);
        let result = scenario(&model, 0, prior[0] + 0.10, 0.0, lambda, &prior).unwrap();
        assert_eq!(result.posterior, prior);
        let constraints = allocation_constraints(&model).unwrap();
        for class in AssetClass::ALL {
            assert!(
                (constraints.total(&result.weights, class) - ALLOCATION_CAPS.limit(class)).abs()
                    < 1e-9
            );
        }
    }

    #[test]
    fn confidence_scales_single_view_posterior() {
        let model = demo_model(&load_holdings().unwrap()).unwrap();
        let (lambda, prior) = equilibrium(&model);
        let half = scenario(&model, 0, prior[0] + 0.10, 0.5, lambda, &prior).unwrap();
        let full = scenario(&model, 0, prior[0] + 0.10, 1.0, lambda, &prior).unwrap();
        assert!((half.posterior[0] - prior[0] - 0.05).abs() < 1e-12);
        assert!((full.posterior[0] - prior[0] - 0.10).abs() < 1e-12);
        assert!((half.omega - model.tau * model.annual_covariance[0][0]).abs() < 1e-12);
        assert!((half.weights.iter().sum::<f64>() + ALLOCATION_CAPS.cash - 1.0).abs() < 1e-9);
        assert!(half.weights.iter().all(|v| *v >= 0.0));
    }

    #[test]
    fn candidates_require_an_unambiguous_class() {
        let mut model = demo_model(&load_holdings().unwrap()).unwrap();
        add_demo_candidate(&mut model, "NEW".into(), 100.0);
        assert!(allocation_constraints(&model).is_err());
        model.assets.last_mut().unwrap().asset_class = Some(AssetClass::International);
        let constraints = allocation_constraints(&model).unwrap();
        assert_eq!(constraints.classes.last(), Some(&AssetClass::International));
        model.assets[0].asset_class = Some(AssetClass::Bonds);
        assert!(allocation_constraints(&model).is_err());
    }

    #[test]
    fn all_confidences_obey_caps_stationarity_and_reconcile_nav() {
        let snapshot = load_holdings().unwrap();
        let model = demo_model(&snapshot).unwrap();
        let constraints = allocation_constraints(&model).unwrap();
        let current = invested_values(&snapshot).unwrap();
        let cash: i64 = snapshot
            .positions
            .iter()
            .filter(|p| p.asset_type == "cash")
            .map(|p| p.reference_value_cents)
            .sum();
        let nav = (current.values().sum::<i64>() + cash) as f64;
        let (lambda, prior) = equilibrium(&model);
        for confidence in [0.0, 0.5, 1.0] {
            let result = scenario(&model, 0, 2.0, confidence, lambda, &prior).unwrap();
            let sigma_w = multiply(&model.annual_covariance, &result.weights);
            let gradient: Vec<f64> = result
                .posterior
                .iter()
                .zip(sigma_w)
                .map(|(mu, risk)| mu - lambda * risk)
                .collect();
            for class in AssetClass::ALL {
                assert!(
                    (constraints.total(&result.weights, class) - ALLOCATION_CAPS.limit(class))
                        .abs()
                        < 1e-9
                );
                let maximum = gradient
                    .iter()
                    .zip(&constraints.classes)
                    .filter_map(|(g, c)| (*c == class).then_some(*g))
                    .fold(f64::NEG_INFINITY, f64::max);
                for (i, assigned) in constraints.classes.iter().enumerate() {
                    if *assigned == class && result.weights[i] > 1e-8 {
                        assert!((gradient[i] - maximum).abs() < 1e-7);
                    }
                }
            }
            let changes = model
                .assets
                .iter()
                .zip(&result.weights)
                .map(|(asset, w)| w * nav - *current.get(&asset.symbol).unwrap_or(&0) as f64)
                .sum::<f64>()
                + ALLOCATION_CAPS.cash * nav
                - cash as f64;
            assert!(changes.abs() < 0.001);
        }
    }
}

include!("adapter.rs");
