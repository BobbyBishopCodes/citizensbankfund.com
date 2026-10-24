args = commandArgs(trailingOnly = TRUE)
if (length(args) != 1L) stop("Usage: Rscript refresh-forecast.R snapshot.json")
if (!requireNamespace("jsonlite", quietly = TRUE)) stop("Install jsonlite.")

fred_key = Sys.getenv("FRED_API_KEY")
if (nzchar(fred_key)) quantmod::setDefaults(quantmod::getSymbols.FRED, api.key = fred_key)
source("scripts/forecast-cpi-ppi.R")
result = forecast_inflation()
snapshot = jsonlite::fromJSON(args[1], simplifyVector = FALSE)
snapshot$targetMonth = result$targetMonth
snapshot$forecastCutoff = result$forecastCutoff
snapshot$forecastStatus = "current"
snapshot$forecastRefreshedOn = forecast_refresh_day()
snapshot$forecast = result$forecast
jsonlite::write_json(snapshot, args[1], pretty = TRUE, auto_unbox = TRUE, digits = 8, na = "null")
cat("Refreshed", result$targetMonth, "forecast from", result$forecastCutoff, "data.\n")
