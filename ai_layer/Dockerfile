FROM python:3.11-slim

WORKDIR /app

COPY ai_layer/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Create non-root user and group
RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY ai_layer /app/ai_layer

RUN chown -R appuser:appuser /app

ENV PYTHONPATH=/app

USER appuser

CMD ["python", "-m", "ai_layer.ai_service"]
