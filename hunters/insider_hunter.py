import asyncio
import httpx
import xml.etree.ElementTree as ET
from .common.logger import get_logger
from .common.kafka_client import KafkaClient
from .common.config import SEC_RSS_URL
from .common.topics import KAFKA_TOPIC_INSIDER

logger = get_logger("insider_hunter")

# SEC requires a User-Agent with contact info
HEADERS = {
    "User-Agent": "CatalystBot yourname@example.com",
    "Accept-Encoding": "gzip, deflate"
}

async def run():
    logger.info("Insider Hunter starting...")
    # TODO: Implement insider trading scraping logic using SEC_RSS_URL

    # Target CIKs - In production, you might load these from a config or DB
    target_ciks = ["0000320193"] # Example: Apple

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
                            # Safely pull index i, or use "N/A" / False if the list is too short or missing
                            accession = accessions[i] if i < len(accessions) else "Unknown"
                            is_confirmatory = confirms[i] if i < len(confirms) else False
                            report_date = dates[i] if i < len(dates) else "Unknown"
                            
                            payload = {
                                "cik": cik,
                                "ticker": data.get("tickers", [None])[0],
                                "accessionNumber": accession,
                                "reportDate": report_date,
                                "isConfirmingCopy": is_confirmatory,
                                "transactionCode": "P", # Placeholder for Purchase
                                "source": "edgar_api_json"
                            }

                            KafkaClient.send_message(KAFKA_TOPIC_INSIDER, payload)
                            logger.info(f"Signal sent for CIK {cik}: Accession {accession}")
            except Exception as e:
                logger.error(f"Error scraping CIK {cik}: {e}")



    # raw_data = await scrape_insider_data()
    # KafkaClient.send_message(KAFKA_TOPIC_INSIDER, {"source": "insider", "data": ...})
    logger.info("Insider Hunter finished.")
