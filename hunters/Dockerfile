
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install --with-deps chromium

COPY . /app/hunters/

# Set Python path to include /app so "hunters.common" imports work
ENV PYTHONPATH=/app

ENTRYPOINT ["python", "-m", "hunters.main"]
CMD ["all"]
