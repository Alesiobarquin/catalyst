import os

# Kafka and Redis Configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_INSIDER = os.getenv("KAFKA_TOPIC_INSIDER", "signal-insider")
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

# External APIs & URLs
FMP_API_KEY = os.getenv("FMP_API_KEY", "")
SEC_RSS_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&output=atom"
BARCHART_URL = "https://www.barchart.com/options/unusual-activity/stocks"
BIOPHARM_URL = "https://www.biopharmcatalyst.com/calendars/pdufa-calendar"
FINVIZ_URL = "https://finviz.com/screener.ashx?v=111&f=sh_short_o20"

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Playwright Configuration
HEADLESS_MODE = os.getenv("HEADLESS_MODE", "True").lower() == "true"

# Hunter loop intervals (seconds between end of one sweep and start of next).
# Set in Docker Compose or .env so squeeze/biotech repeat without one-shot exits.
SQUEEZE_INTERVAL_SECONDS = int(os.getenv("SQUEEZE_INTERVAL_SECONDS", "900"))  # 15 min
BIOTECH_INTERVAL_SECONDS = int(
    os.getenv("BIOTECH_INTERVAL_SECONDS", "1800")
)  # 30 min (Playwright + rate limits)
DRIFTER_INTERVAL_SECONDS = int(
    os.getenv("DRIFTER_INTERVAL_SECONDS", "3600")
)  # 1 h — earnings calendar polling
# Minimum positive EPS surprise (%) to emit (beat vs consensus)
DRIFTER_MIN_SURPRISE_PERCENT = float(os.getenv("DRIFTER_MIN_SURPRISE_PERCENT", "5.0"))
# FMP earning_calendar from=today-lookback to=today
DRIFTER_LOOKBACK_DAYS = int(os.getenv("DRIFTER_LOOKBACK_DAYS", "3"))

# Whale hunter (Barchart unusual options — Playwright)
WHALE_INTERVAL_SECONDS = int(os.getenv("WHALE_INTERVAL_SECONDS", "3600"))

FINVIZ_SQUEEZE_URL = "https://finviz.com/screener.ashx?v=111&f=sh_short_o20"
