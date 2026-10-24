args = commandArgs(trailingOnly = TRUE)
if (length(args) < 2L || length(args) > 3L) stop("Usage: Rscript export-macro-snapshot.R research_results.rds output.json [forecast_reference.csv]")
if (!requireNamespace("jsonlite", quietly = TRUE)) stop("Install the R jsonlite package.")

research = readRDS(args[1])
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
  targetMonth = as.character(research$metadata$settings$target_month),
  forecast = list(cpi = research$metadata$settings$cpi_mom_pct,
                  ppi = research$metadata$settings$ppi_mom_pct),
  modelCutoff = format(as.Date(research$metadata$cutoff), "%Y-%m"),
  holdingsAsOf = as.character(research$metadata$holdings_as_of),
  positions = positions
)
if (length(args) == 3L) {
  reference = read.csv(args[3], check.names = FALSE)
  row = reference[reference$month == snapshot$targetMonth, ]
  if (nrow(row) != 1L || anyNA(row[c("CPI_lower_80", "CPI_upper_80", "PPI_lower_80", "PPI_upper_80")]))
    stop("Forecast range is missing for the target month.")
  if (abs(row$CPI - snapshot$forecast$cpi) > 1e-8 || abs(row$PPI - snapshot$forecast$ppi) > 1e-8)
    stop("Forecast reference does not match the IRF run.")
  snapshot$forecast$cpiRange80 = c(row$CPI_lower_80, row$CPI_upper_80)
  snapshot$forecast$ppiRange80 = c(row$PPI_lower_80, row$PPI_upper_80)
}
jsonlite::write_json(snapshot, args[2], pretty = TRUE, auto_unbox = TRUE, digits = 8, na = "null")
