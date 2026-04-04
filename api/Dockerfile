FROM python:3.12-slim

WORKDIR /app

# Install deps first (Docker cache layer)
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
