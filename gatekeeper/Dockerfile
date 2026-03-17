FROM python:3.11-slim

WORKDIR /app

COPY gatekeeper/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY gatekeeper /app/gatekeeper

ENV PYTHONPATH=/app

CMD ["python", "-m", "gatekeeper.gatekeeper"]
