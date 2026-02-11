
# Official Playwright image with browsers and dependencies pre-installed
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Browsers are included in the base image, but we ensure chromium is specifically ready
RUN playwright install chromium

COPY . /app/hunters/

# Set Python path to include /app so "hunters.common" imports work
ENV PYTHONPATH=/app

ENTRYPOINT ["python", "-m", "hunters.main"]
CMD ["all"]
