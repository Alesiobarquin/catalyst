import httpx

from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.topics import KAFKA_TOPIC_INSIDER, RAW_EVENTS_TOPIC

logger = get_logger("insider_hunter")

# SEC requires a User-Agent with contact info
HEADERS = {"User-Agent": "CatalystBot yourname@example.com", "Accept-Encoding": "gzip, deflate"}


async def run():
    logger.info("Insider Hunter starting...")
    # TODO: Implement insider trading scraping logic using SEC_RSS_URL

    # Target CIKs - In production, you might load these from a config or DB
    target_ciks = ["0000320193"]  # Example: Apple

    async with httpx.AsyncClient(headers=HEADERS) as client:
        for cik in target_ciks:
            try:
                # 1. Access the Submissions API as per your provided docs
                # URL: https://data.sec.gov/submissions/CIK##########.json
                formatted_cik = cik.zfill(10)
                url = f"https://data.sec.gov/submissions/CIK{formatted_cik}.json"

                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    recent = data.get("filings", {}).get("recent", {})

                    # 2. Logic: Extract transaction metadata safely
                    # Fetch the lists once, defaulting to empty lists if they don't exist
                    forms = recent.get("form", [])
                    accessions = recent.get("accessionNumber", [])
                    confirms = recent.get("isConfirmingCopy", [])
                    dates = recent.get("reportDate", [])

                    for i, form in enumerate(forms):
                        if form == "4":
                            accession = accessions[i] if i < len(accessions) else "Unknown"
                            is_confirmatory = confirms[i] if i < len(confirms) else False
                            report_date = dates[i] if i < len(dates) else "Unknown"
                            ticker = data.get("tickers", [None])[0]

                            if not ticker:
                                logger.debug("Skipping Form 4 for CIK %s: no ticker", cik)
                                continue

                            liquidity = fetch_liquidity_metrics(ticker)
                            if not liquidity:
                                logger.debug("Skipping %s: liquidity lookup failed", ticker)
                                continue

                            payload = {
                                "cik": cik,
                                "ticker": ticker,
                                "accession_number": accession,
                                "report_date": report_date,
                                "is_confirming_copy": is_confirmatory,
                                "transaction_code": "P",  # Placeholder for Purchase
                                "source": "edgar_api_json",
                                "hunter": "insider",
                                "source_hunter": "insider",
                                "price": liquidity["price"],
                                "volume": liquidity["volume"],
                                "relative_volume": liquidity["relative_volume"],
                                "timestamp_utc": None,
                            }

                            KafkaClient.send_message(KAFKA_TOPIC_INSIDER, payload)
                            KafkaClient.send_message(RAW_EVENTS_TOPIC, payload)
                            logger.info("Signal sent for CIK %s: Accession %s", cik, accession)
            except Exception as e:
                logger.error(f"Error scraping CIK {cik}: {e}")

    # raw_data = await scrape_insider_data()
    # KafkaClient.send_message(KAFKA_TOPIC_INSIDER, {"source": "insider", "data": ...})
    logger.info("Insider Hunter finished.")
