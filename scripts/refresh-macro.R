args = commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) stop("Usage: Rscript refresh-macro.R VAR_IRF_CPI_PPI.R output.json")
if (!requireNamespace("jsonlite", quietly = TRUE)) stop("Install jsonlite.")

options(cbf.var.run = FALSE)
model = new.env(parent = globalenv())
sys.source(args[1], envir = model)

holdings = jsonlite::fromJSON("content/portfolio/holdings.json", simplifyVector = FALSE)
previous = jsonlite::fromJSON("content/macro/snapshot.json", simplifyVector = FALSE)
settings = model$settings
fred_key = Sys.getenv("FRED_API_KEY")
if (nzchar(fred_key)) quantmod::setDefaults(quantmod::getSymbols.FRED, api.key = fred_key)
forecast_model = new.env(parent = globalenv())
sys.source("scripts/forecast-cpi-ppi.R", envir = forecast_model)
forecast_result = forecast_model$forecast_inflation()

macro = model$fetch_macro(settings$start_date, settings$estimation_end_month)
model$check_months(macro$month)
cutoff = max(macro$month)

series = function(irf, impulse) {
  list(estimate = as.numeric(irf$irf[[impulse]]),
       lower = as.numeric(irf$Lower[[impulse]]),
       upper = as.numeric(irf$Upper[[impulse]]))
}
position = function(holding) {
  ticker = holding$symbol
  if (is.null(ticker)) return(NULL)
  cat("Processing", ticker, "\n")
  result = list(ticker = ticker, status = "unavailable")
  tryCatch({
    yahoo_ticker = if (ticker == "MOG.A") "MOG-A" else ticker
    returns = model$fetch_returns(yahoo_ticker, settings$start_date, cutoff)
    history = model$aligned_history(macro, returns)
    y = as.matrix(history[, c("PPI", "CPI", "Return")])
    months = nrow(y)
    if (months < 24L) stop(paste("Insufficient history:", months, "months; need 24 for an exploratory response."))
    short_history = months < 60L
    fit = if (short_history) {
      candidate = vars::VAR(y, p = 1L, type = "const")
      model$model_checks(candidate)
      candidate
    } else model$fit_var(y)
    irfs = model$holding_irfs(fit, settings$irf_runs, settings$seed)
    result$status = if (short_history) "exploratory" else "modeled"
    result$historyMonths = months
    result$cpi = series(irfs$CPI_first, "CPI")
    result$ppi = series(irfs$PPI_first, "PPI")
    cat(ticker, "modeled\n")
    result
  }, error = function(error) {
    result$reason = conditionMessage(error)
    cat(ticker, result$reason, "\n")
    result
  })
}
positions = Filter(Negate(is.null), lapply(holdings$positions, position))
if (!any(vapply(positions, function(item) item$status %in% c("modeled", "exploratory"), logical(1))))
  stop("No current positions passed the IRF model checks.")

snapshot = list(targetMonth = forecast_result$targetMonth,
                forecastCutoff = forecast_result$forecastCutoff,
                forecastStatus = "current",
                forecastRefreshedOn = forecast_model$forecast_refresh_day(),
                forecast = forecast_result$forecast,
                modelCutoff = format(cutoff, "%Y-%m"),
                holdingsAsOf = holdings$asOfDate, positions = positions)
same_position = function(old, current) {
  if (!identical(old$ticker, current$ticker) ||
      !identical(old$status, current$status) ||
      (current$status == "exploratory" && !identical(old$historyMonths, current$historyMonths)) ||
      !identical(old$reason, current$reason)) return(FALSE)
  if (!current$status %in% c("modeled", "exploratory")) return(TRUE)
  all(vapply(c("cpi", "ppi"), function(shock) {
    all(vapply(c("estimate", "lower", "upper"), function(field) {
      old_values = as.numeric(unlist(old[[shock]][[field]]))
      new_values = current[[shock]][[field]]
      length(old_values) == length(new_values) && all(abs(old_values - new_values) < 0.001)
    }, logical(1)))
  }, logical(1)))
}
if (identical(previous$modelCutoff, snapshot$modelCutoff) &&
    identical(previous$holdingsAsOf, snapshot$holdingsAsOf) &&
    length(previous$positions) == length(positions) &&
    all(mapply(same_position, previous$positions, positions))) {
  snapshot$positions = previous$positions
}
jsonlite::write_json(snapshot, args[2], pretty = TRUE, auto_unbox = TRUE, digits = 8, na = "null")
cat("Refreshed", sum(vapply(positions, function(item) item$status %in% c("modeled", "exploratory"), logical(1))),
    "of", length(positions), "positions through", snapshot$modelCutoff, "\n")
