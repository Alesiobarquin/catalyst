FROM python:3.11-slim

WORKDIR /app

COPY ai_layer/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY ai_layer /app/ai_layer

ENV PYTHONPATH=/app

CMD ["python", "-m", "ai_layer.ai_service"]
