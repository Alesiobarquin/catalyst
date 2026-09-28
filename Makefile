.PHONY: up down lint format test build health logs clean

up:
	docker compose up -d --build

down:
	docker compose down

lint:
	ruff check api gatekeeper ai_layer hunters persistence executor tests

format:
	ruff format api gatekeeper ai_layer hunters persistence executor tests

test:
	PYTHONPATH=. python -m pytest tests/ -v --tb=short

build:
	docker compose build --no-cache

health:
	@curl -sf http://localhost:8000/health && echo " API OK" || echo " API not ready"
	@curl -sf http://localhost:8081/actuator/health && echo " Engine OK" || echo " Engine not ready"

logs:
	docker compose logs -f --tail=50

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
