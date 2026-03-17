# Testing Guide: Project Catalyst

This guide explains how to test the Python Hunters (data ingestion) both locally (for fast iteration) and using Docker (for full integration).

## 1. Prerequisites
- **Python 3.12 (Dont use 3.14)+** installed locally.
- **Docker** and **Docker Compose** installed.
- **Key Files:**
  - `hunters/` (Python source code)
  - `docker-compose.yml` (Integration config)

## 2. Option A: Local Testing (Fast Iteration)
Use this method when writing code or debugging logic (e.g., checking if the scraper works).

### Step 0: Set Up Virtual Environment (Recommended)
Before installing dependencies, it's best to create an isolated environment.

1.  **Create the Virtual Environment:**
    This creates a folder named `.venv` to house local libraries.
    ```bash
    python3 -m venv .venv
    ```

2.  **Activate the Environment:**
    This tells your terminal to use the Python inside this folder.
    ```bash
    source .venv/bin/activate
    ```
    > *Note: You should now see `(.venv)` at the start of your command prompt.*

### Step 1: Install Dependencies
Now that you're "inside" the environment, install the project requirements and Playwright:
```bash
pip install -r hunters/requirements.txt
playwright install chromium
```

### Step 2: Run a Hunter
From the **project root folder**, run a specific hunter using the `-m` (module) flag.
This ensures Python finds the `hunters` package correctly.

**To run the Squeeze Hunter:**
```bash
python3 -m hunters.main squeeze
```

**To run ALL Hunters:**
```bash
python3 -m hunters.main
```

### Step 3: Verify Output (Logs)
You will see logs in your terminal.
- Look for `✅ Success: Found X potential squeeze targets.`
- If Kafka is NOT running locally, you might see connection errors (which is fine for logic testing).

---

## 3. Option B: Docker Testing (Full Integration)
Use this method to test the entire pipeline (Scraping -> Kafka -> Database).


### Step 1: Start Infrastructure (Kafka, Zookeeper, Redis, UI)
Start the core services first so they are healthy:
```bash
docker-compose up -d zookeeper kafka redis kafka-ui timescaledb
```
*Wait 30 seconds for Kafka to initialize.*

### Step 2: Build & Run a Hunter
You can run a specific hunter container to see how it behaves in the production environment.

**Build the image:**
```bash
docker-compose build hunter-squeeze
```

**Run the container:**
```bash
docker-compose up hunter-squeeze
```
*This will attach your terminal to the container logs. Press `Ctrl+C` to stop.*

### Step 3: Verify Data in Kafka
1.  Open your browser to the **Kafka UI**: `http://localhost:8080`
2.  Navigate to **Topics** (left menu).
3.  Click on `signal-squeeze` (or the relevant topic).
4.  Switch to the **Messages** tab.
5.  You should see the JSON data flowing in.

## 4. Troubleshooting

### "ModuleNotFoundError: No module named 'hunters'"
**Cause:** You are running the script from inside the `hunters/` folder instead of the project root.
**Fix:** Move up one level (`cd ..`) and run `python3 -m hunters.main ...`.

### "ConnectionRefusedError: [Errno 61] Connect call failed" (Kafka)
**Cause:** The hunter is trying to connect to Kafka but it's not running.
**Fix (Local):** Start Kafka via Docker (`docker-compose up -d kafka`).
**Fix (Code):** The hunters are designed to fail gratefully or retry if Kafka is down, but you won't see messages published.

### Scraper returns 0 results
**Cause:** Anti-bot detection or layout change on the target site.
**Fix:** Run with `HEADLESS_MODE=False` locally to see what the browser sees.
1.  Open `hunters/common/config.py`.
2.  Change `HEADLESS_MODE` check or set environment variable:
    ```bash
    export HEADLESS_MODE=False
    python3 -m hunters.main squeeze
    ```
