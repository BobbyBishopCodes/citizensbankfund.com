args = commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) stop("Usage: Rscript export-macro-snapshot.R research_results.rds output.json")
if (!requireNamespace("jsonlite", quietly = TRUE)) stop("Install the R jsonlite package.")

research = readRDS(args[1])
forecast_model = new.env(parent = globalenv())
sys.source("scripts/forecast-cpi-ppi.R", envir = forecast_model)
forecast_result = forecast_model$forecast_inflation()
response = function(ticker, impulse, ordering) {
  result = research$irfs[[ticker]][[ordering]]
  list(
    estimate = as.numeric(result$irf[[impulse]]),
    lower = as.numeric(result$Lower[[impulse]]),
    upper = as.numeric(result$Upper[[impulse]])
  )
}
positions = lapply(seq_len(nrow(research$positions)), function(index) {
  row = research$positions[index, ]
  ticker = as.character(row$ticker)
  item = list(ticker = ticker, status = as.character(row$status))
  if (ticker %in% names(research$irfs)) {
    item$cpi = response(ticker, "CPI", "CPI_first")
    item$ppi = response(ticker, "PPI", "PPI_first")
  } else {
    item$reason = as.character(row$notes)
  }
  item
})
snapshot = list(
  targetMonth = forecast_result$targetMonth,
  forecastCutoff = forecast_result$forecastCutoff,
  forecastStatus = "current",
  forecastRefreshedOn = forecast_model$forecast_refresh_day(),
  forecast = forecast_result$forecast,
  modelCutoff = format(as.Date(research$metadata$cutoff), "%Y-%m"),
  holdingsAsOf = as.character(research$metadata$holdings_as_of),
  positions = positions
)
jsonlite::write_json(snapshot, args[2], pretty = TRUE, auto_unbox = TRUE, digits = 8, na = "null")
