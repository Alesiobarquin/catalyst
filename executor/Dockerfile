FROM python:3.12-slim

WORKDIR /app

COPY executor/requirements.txt /app/executor/requirements.txt
RUN pip install --no-cache-dir -r /app/executor/requirements.txt

COPY executor /app/executor

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "executor.consumer"]
