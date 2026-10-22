"""Map brokerage symbols to Yahoo Finance symbols without changing portfolio keys."""

YAHOO_SYMBOLS = {"MOG.A": "MOG-A"}


def yahoo_symbol(symbol):
    return YAHOO_SYMBOLS.get(symbol, symbol)
