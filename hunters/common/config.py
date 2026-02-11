
import os

# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_SQUEEZE = os.getenv("KAFKA_TOPIC_SQUEEZE", "signal-squeeze")
KAFKA_TOPIC_INSIDER = os.getenv("KAFKA_TOPIC_INSIDER", "signal-insider")
KAFKA_TOPIC_WHALE = os.getenv("KAFKA_TOPIC_WHALE", "signal-whale")
KAFKA_TOPIC_BIOTECH = os.getenv("KAFKA_TOPIC_BIOTECH", "signal-biotech")
KAFKA_TOPIC_DRIFTER = os.getenv("KAFKA_TOPIC_DRIFTER", "signal-earnings")
KAFKA_TOPIC_SHADOW = os.getenv("KAFKA_TOPIC_SHADOW", "signal-shadow")

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
