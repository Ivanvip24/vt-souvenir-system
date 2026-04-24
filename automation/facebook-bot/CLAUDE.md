# Facebook Marketplace Bot

Selenium-based bot that removes and re-uploads listings to Facebook Marketplace from CSV files to boost visibility.

## Commands

```bash
pip3 install selenium webdriver-manager
python main.py          # Main execution
```

## How It Works

1. Reads listings from `csvs/items.csv` or `csvs/vehicles.csv`
2. Logs into Facebook using saved session cookies
3. Removes existing listings
4. Re-uploads all listings (shows at top when recently posted)
5. Can post to multiple groups

## Key Files

- `main.py` — Main execution script
- `main_v2.py` — Updated version
- `csvs/` — Listing data (items, vehicles)
- `helpers/` — CSV parsing, listing creation, scraping utilities

## Requirements

- Python 3, Selenium, Google Chrome
- Facebook session (saved after first manual login)

## Data

Photo directories (fotos-*) are excluded from git — they're data, not source.
Keep them locally or on a shared drive.
