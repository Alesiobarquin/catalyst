FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY resolver/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY resolver/ resolver/

ENV PYTHONPATH=/app

CMD ["python", "-m", "resolver.main"]
