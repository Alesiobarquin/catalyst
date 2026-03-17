FROM python:3.11-slim

WORKDIR /app

COPY gatekeeper/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Create non-root user and group
RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY gatekeeper /app/gatekeeper

RUN chown -R appuser:appuser /app

ENV PYTHONPATH=/app

USER appuser

CMD ["python", "-m", "gatekeeper.gatekeeper"]
