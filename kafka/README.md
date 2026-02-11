# Catalyst Kafka Infrastructure [Engine]

This directory manages the messaging backbone of the Catalyst system.

## 🛠 Debugging Cheatsheet

Since Kafka runs in Docker, use these commands to inspect the system:

### 1. List All Topics
See what data streams are active.
```bash
docker exec catalyst_kafka kafka-topics --list --bootstrap-server localhost:9092
```

### 2. Watch Live Data (Consume)
See the messages flowing through a specific topic (e.g., `signal-squeeze`).
```bash
docker exec catalyst_kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic signal-squeeze --from-beginning
```

### 3. Check Topic Status
See partition count and replication status.
```bash
docker exec catalyst_kafka kafka-topics --describe --topic signal-squeeze --bootstrap-server localhost:9092
```

## 🏗 Infrastructure
- **Broker**: `confluentinc/cp-kafka:7.5.0`
- **Port**: `9092` (Host), `29092` (Internal Docker network)
- **Zookeeper**: `confluentinc/cp-zookeeper:7.5.0`
