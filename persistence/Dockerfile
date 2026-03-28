FROM python:3.12-slim

WORKDIR /app

COPY persistence/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY persistence/ /app/persistence/

ENV PYTHONPATH=/app

CMD ["python", "-m", "persistence.consumer"]
