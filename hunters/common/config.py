
import os

# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

# External APIs & URLs
FMP_API_KEY = os.getenv("FMP_API_KEY", "")
SEC_RSS_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent"
BARCHART_URL = "https://www.barchart.com/options/unusual-activity/stocks"
BIOPHARM_URL = "https://www.biopharmcatalyst.com/calendars/pdufa-calendar"
FINVIZ_URL = "https://finviz.com/screener.ashx?v=111&f=sh_short_o20"
TRADYTICS_URL = "https://tradytics.com/darkpool-market"

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Playwright Configuration
HEADLESS_MODE = os.getenv("HEADLESS_MODE", "True").lower() == "true"

FINVIZ_SQUEEZE_URL = "https://finviz.com/screener.ashx?v=111&f=sh_short_o20"
