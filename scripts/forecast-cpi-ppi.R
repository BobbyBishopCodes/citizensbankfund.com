month_start = function(month) as.Date(paste0(month, "-01"))

monthly_change = function(levels, start_month, end_month) {
  months = seq(month_start(start_month), month_start(end_month), by = "month")
  values = as.numeric(levels)[match(months, as.Date(zoo::index(levels)))]
  if (!is.finite(tail(values, 1))) stop("The forecast cutoff month is missing from FRED.")
  changes = 100 * (values[-1] / head(values, -1) - 1)
  first = months[2]
  stats::ts(changes,
            start = c(as.integer(format(first, "%Y")), as.integer(format(first, "%m"))),
            frequency = 12)
}

forecast_change = function(series, order, target_month) {
  fit = stats::arima(series, order = order)
  prediction = stats::predict(fit, n.ahead = 1)
  target = month_start(target_month)
  expected_time = as.integer(format(target, "%Y")) +
    (as.integer(format(target, "%m")) - 1) / 12
  if (abs(as.numeric(time(prediction$pred)[1]) - expected_time) > 1e-8)
    stop("The forecast time does not match the target month.")
  point = as.numeric(prediction$pred[1])
  margin = 1.2816 * as.numeric(prediction$se[1])
  if (any(!is.finite(c(point, margin)))) stop("The forecast is not finite.")
  list(point = point, range80 = c(point - margin, point + margin))
}

forecast_inflation = function(start_month = "2010-01", cutoff_month = "2026-08",
                               target_month = "2026-09") {
  if (format(seq(month_start(cutoff_month), by = "month", length.out = 2)[2], "%Y-%m") != target_month)
    stop("The historical forecast must be one month after its data cutoff.")
  cpi = quantmod::getSymbols("CPIAUCSL", src = "FRED", auto.assign = FALSE)
  ppi = quantmod::getSymbols("PPIFIS", src = "FRED", auto.assign = FALSE)
  cpi_change = monthly_change(cpi, start_month, cutoff_month)
  ppi_change = monthly_change(ppi, start_month, cutoff_month)
  cpi_result = forecast_change(cpi_change, c(1, 0, 2), target_month)
  ppi_result = forecast_change(ppi_change, c(1, 0, 1), target_month)
  list(targetMonth = target_month, forecastCutoff = cutoff_month,
       forecast = list(cpi = cpi_result$point, cpiRange80 = cpi_result$range80,
                       ppi = ppi_result$point, ppiRange80 = ppi_result$range80))
}
