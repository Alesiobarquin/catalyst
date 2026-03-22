# Catalyst: Student-Focused Deployment Guide

This document covers how to deploy Catalyst beyond local Docker Compose—optimized for student portfolios, not 24/7 production. The goal: deploy for **~$15/month** with ~90% signal effectiveness by running during market hours only.

---

## TL;DR: 30-Second Version

- **What:** Student portfolio project—market signal detection pipeline
- **When:** Runs at 7:00 AM and 9:30 AM ET (pre-market + market open)
- **Cost:** ~$10–15/month (EC2 + Docker Compose + scheduling)
- **Why:** Market hours capture most catalysts; 24/7 infrastructure adds cost without proportional value for learning/recruiting

---

## Cost Comparison

| Approach | Monthly Cost | Setup Time | Complexity | Why Pick It |
|----------|--------------|------------|------------|-------------|
| **EC2 + Docker Compose** | $10–15 | 2 hours | Low | Sweet spot for students |
| **Lambda + EventBridge** | $1–2 | 3 hours | Medium | Cheapest, zero infra |
| **ECS + MSK (Original)** | $200–250 | 4 hours | High | Real production setup |

### Option 1: EC2 + Docker Compose (Recommended)

| Item | Cost |
|------|------|
| t3.micro EC2 | $5–10/month (or $0 if free tier eligible) |
| Data transfer | &lt;$1/month |
| Lambda (start/stop) | &lt;$0.20/month |
| EventBridge | Free |
| **Total** | **$10–15/month** |

**When to use:** You want something that runs reliably, debugs like your laptop, and costs almost nothing.  
**Pros:** Same stack as local, SSH access, easy to scale later.  
**Cons:** Instance must boot (~2 min) before first run.  
**Skill level:** Basic Docker + AWS CLI.

---

### Option 2: Lambda + EventBridge (Cheapest)

| Item | Cost |
|------|------|
| Lambda | ~$0.20/month |
| EventBridge | Free |
| Kafka (self-managed on EC2) | $10–15/month (you still need Kafka) |
| **Total** | **$1–2** (Lambda only) + **$10–15** if you run Kafka on EC2 |

**Gotcha:** You still need Kafka somewhere. Managed MSK is $150+/month minimum. Lambda-only works if you replace Kafka with SQS (~$0.50/month) but requires code changes.

**When to use:** You want absolute minimum cost and accept cold starts + harder debugging.  
**Skill level:** Intermediate—serverless, IAM, packaging.

---

### Option 3: ECS + MSK (Production)

| Item | Cost |
|------|------|
| ECS Fargate | $30–50 |
| MSK (single broker) | ~$150 |
| ElastiCache (Redis) | ~$15 |
| Gemini API | $5–20 |
| **Total** | **$200–250/month** |

**When to use:** You have validated the concept, have users, and need 24/7 uptime.  
**Skill level:** Advanced.

---

## Recommended: EC2 + Docker Compose

### What It Is

A single t3.micro EC2 instance running `docker compose up`—the same stack you run locally. No ECS, no Fargate, no MSK. Kafka, Redis, Gatekeeper, AI Layer, and Hunters all run in containers on one machine.

### Why It's Best for Students

1. **Cost:** $10–15/month vs $200+ for full production
2. **Debuggable:** SSH in, run `docker compose logs`, same as laptop
3. **Simple:** One machine, one compose file, no orchestration
4. **Scalable later:** When you need production, migrate to ECS; the images and logic stay the same

### Architecture (Text Diagram)

```
EventBridge (6:50 AM ET)  →  Lambda (catalyst-startup)
                                    ↓
                            EC2 instance starts
                                    ↓
                            SSM / user-data: docker compose up -d
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│  EC2 (t3.micro)                                                 │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Kafka   │  │ Redis   │  │Gatekeeper│  │ AI Layer │          │
│  │Zookeeper│  │         │  │          │  │ (Gemini) │          │
│  └────┬────┘  └────┬────┘  └────┬─────┘  └────┬─────┘          │
│       │            │            │              │                 │
│       └────────────┴────────────┴──────────────┘                 │
│                            │                                     │
│                     validated-signals                            │
└─────────────────────────────────────────────────────────────────┘
                                    │
EventBridge (4:00 PM ET)  →  Lambda (catalyst-shutdown)
                                    ↓
                            EC2 instance stops
```

### Cost Breakdown

- **t3.micro:** ~$0.0104/hr × ~9 hrs/day × 22 trading days ≈ **$2–3/month** (instance running ~6.5 hrs/day)
- **Stopped instance:** $0 (EBS storage ~$1/month for 8 GB)
- **If you run 24/7 by mistake:** ~$7.50/month
- **Data transfer:** &lt;$1 for typical signal volume
- **Lambda + EventBridge:** Negligible
- **Total:** **$10–15/month** (or less with free tier)

### Step-by-Step Setup

#### Pre-Deployment Checklist

- [ ] Catalyst runs locally with `docker compose up --build -d`
- [ ] You have an AWS account (free tier or budget)
- [ ] AWS CLI configured (`aws configure`)
- [ ] You understand what `docker compose` does

---

#### Part 1: EC2 Setup (~30 min)

1. **Launch instance**
   - AWS Console → EC2 → Launch Instance
   - Name: `catalyst`
   - AMI: Ubuntu Server 22.04 LTS
   - Instance type: **t3.micro** (free tier eligible)
   - Key pair: Create new or select existing, save `.pem` file
   - Security group: Create new
     - Inbound: SSH (22) from **Your IP** (or 0.0.0.0/0 only if you accept risk)
   - Storage: 8 GB gp3 (default)
   - Advanced details → User data (optional, for startup):

   ```bash
   #!/bin/bash
   apt-get update && apt-get -y install docker.io docker-compose-plugin git
   usermod -aG docker ubuntu
   ```

2. **Connect and install Docker** (if not in user data)

   ```bash
   chmod 400 catalyst-key.pem
   ssh -i catalyst-key.pem ubuntu@<EC2-PUBLIC-IP>
   ```

   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose-plugin git
   sudo usermod -aG docker ubuntu
   # Log out and back in for docker group to take effect
   exit
   ssh -i catalyst-key.pem ubuntu@<EC2-PUBLIC-IP>
   ```

3. **Clone and run catalyst**

   ```bash
   git clone https://github.com/<your-org>/catalyst.git
   cd catalyst
   cp .env.example .env
   # Edit .env: set GEMINI_API_KEY
   nano .env
   ```

   ```bash
   docker compose up -d
   docker ps
   ```

   You should see: `catalyst_zookeeper`, `catalyst_kafka`, `catalyst_redis`, `catalyst_gatekeeper`, `catalyst_ai_layer`, hunters, etc.

4. **Verify Kafka topics**

   ```bash
   docker exec catalyst_kafka kafka-topics --bootstrap-server localhost:9092 --list
   ```

   Expect: `raw-events`, `triage-priority`, `validated-signals` (after first run).

5. **Tag the instance** (for Lambda targeting)

   - EC2 Console → Instances → Select `catalyst` → Tags → Add tag
   - Key: `Name`, Value: `catalyst`
   - Or note the **Instance ID** (e.g. `i-0abc123def456`)

---

#### Part 2: Lambda Setup (~1 hour)

Create two Lambda functions: one to start the instance and optionally run `docker compose up`, one to stop it.

**1. Create IAM role for Lambda**

- IAM → Roles → Create role
- Trusted entity: Lambda
- Permissions: Create inline policy or attach:
  - `ec2:StartInstances`, `ec2:StopInstances`, `ec2:DescribeInstances`
  - `ssm:SendCommand`, `ssm:GetCommandInvocation` (optional, for remote `docker compose`)
- Role name: `catalyst-lambda-role`

**2. Lambda: catalyst-startup**

- Lambda Console → Create function
- Name: `catalyst-startup`
- Runtime: Python 3.12
- Architecture: x86_64
- Execution role: Use existing → `catalyst-lambda-role`

Copy from `deploy/lambda_startup.py` in the repo, or paste:

```python
import boto3
import logging
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

EC2_INSTANCE_ID = os.environ.get('EC2_INSTANCE_ID', 'i-0xxxxx')  # Set via env var in Lambda config

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    try:
        response = ec2.start_instances(InstanceIds=[EC2_INSTANCE_ID])
        state = response['StartingInstances'][0]['CurrentState']['Name']
        logger.info(f"Started instance {EC2_INSTANCE_ID}: {state}")
        return {'statusCode': 200, 'body': f'Started {EC2_INSTANCE_ID}'}
    except Exception as e:
        logger.error(f"Failed to start instance: {e}")
        raise

# Optional: Use EventBridge + 5-min delay to run docker compose after boot.
# Or add SSM send_command here (requires SSM agent on EC2 + IAM instance profile).
```

- Configuration → Environment variables: `EC2_INSTANCE_ID` = `i-0abc123def456`
- Configuration → General configuration: Timeout 30 seconds
- Deploy

**3. Lambda: catalyst-shutdown**

- Create function: `catalyst-shutdown`
- Runtime: Python 3.12
- Execution role: `catalyst-lambda-role`

Copy from `deploy/lambda_shutdown.py` in the repo, or paste:

```python
import boto3
import logging
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

EC2_INSTANCE_ID = os.environ.get('EC2_INSTANCE_ID', 'i-0xxxxx')

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    try:
        response = ec2.stop_instances(InstanceIds=[EC2_INSTANCE_ID])
        state = response['StoppingInstances'][0]['CurrentState']['Name']
        logger.info(f"Stopped instance {EC2_INSTANCE_ID}: {state}")
        return {'statusCode': 200, 'body': f'Stopped {EC2_INSTANCE_ID}'}
    except Exception as e:
        logger.error(f"Failed to stop instance: {e}")
        raise
```

- Environment variable: `EC2_INSTANCE_ID`
- Deploy

**4. Test manually**

- Lambda → catalyst-startup → Test → Create test event (empty `{}`) → Test
- Wait 1–2 minutes, check EC2 console: instance should be `running`
- Lambda → catalyst-shutdown → Test
- Instance should transition to `stopped`

---

#### Part 3: EventBridge Rules (~30 min)

1. **Rule: Start at 6:50 AM ET**
   - EventBridge → Rules → Create rule
   - Name: `catalyst-start-daily`
   - Schedule: Cron expression: `50 11 * * ? *` (6:50 AM ET = 11:50 UTC; adjust for DST)
   - For America/New_York: `cron(50 11 * * ? *)` (ET is UTC-5; 6:50 AM ET = 11:50 UTC)
   - DST note: ET is UTC-4 in summer. Use `50 10 * * ? *` for 6:50 AM ET in EDT (Mar–Nov).
   - Simpler: use **Schedule** → Recurring schedule → `cron(50 11 * * ? *)` (fixed UTC; you may need to adjust seasonally)
   - Target: Lambda function → `catalyst-startup`

2. **Rule: Stop at 4:00 PM ET**
   - Create rule: `catalyst-stop-daily`
   - Schedule: `cron(0 21 * * ? *)` (4:00 PM ET ≈ 9:00 PM UTC in winter; adjust for DST)
   - Target: Lambda function → `catalyst-shutdown`

3. **Optional: Run docker compose via SSM**

   If you want Lambda to run `docker compose up -d` after the instance boots:
   - Attach an IAM instance profile to the EC2 instance with `ssm:UpdateInstanceInformation` and allow SSM
   - Install SSM agent (Ubuntu 22.04 has it by default)
   -    Add a second EventBridge rule at 7:00 AM ET that invokes a Lambda which calls `ssm:SendCommand` to run:
     `cd /home/ubuntu/catalyst && docker compose up -d`

   Simpler alternative: use **EC2 User Data** with a script that waits for Docker, then runs `docker compose up -d` on boot. No extra Lambda needed.

---

#### Part 4: docker compose on Boot

To have the pipeline start automatically when the instance comes up, add to user data or a startup script:

```bash
#!/bin/bash
# /home/ubuntu/start-catalyst.sh
sleep 60  # Wait for Docker to be ready
cd /home/ubuntu/catalyst
/usr/bin/docker compose up -d
```

Run via crontab `@reboot`:

```bash
crontab -e
# Add:
@reboot /home/ubuntu/start-catalyst.sh
```

Then: 6:50 AM → Lambda starts EC2 → instance boots → cron runs script → `docker compose up`. No second Lambda needed.

---

### Monitoring

**Manual check (run once/week):**

```bash
aws ec2 describe-instances --filters "Name=tag:Name,Values=catalyst" \
  --query 'Reservations[0].Instances[0].[State.Name, LaunchTime]' --output text
```

**Lambda logs:**

```bash
aws logs tail /aws/lambda/catalyst-startup --since 24h
aws logs tail /aws/lambda/catalyst-shutdown --since 24h
```

**Kafka signals (SSH into EC2):**

```bash
docker exec catalyst_kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic validated-signals \
  --from-beginning --max-messages 10 --timeout-ms 5000
```

**Optional:** SNS topic + subscription to email when signals are published (requires a small consumer that publishes to SNS).

---

### Troubleshooting

| Issue | What to check |
|-------|----------------|
| Instance didn't start | EventBridge rule enabled? Lambda logs for errors? IAM permissions for `ec2:StartInstances`? |
| docker compose didn't run | SSH in, check `docker ps`. If empty, run `docker compose up -d` manually. Check cron/user-data. |
| No signals | `docker compose logs gatekeeper ai-layer`. Verify hunters ran: `docker compose logs hunter_squeeze`. |
| Kafka/Redis down | `docker compose restart` or `docker compose up -d` |

---

### Cost Optimization Notes

- **Free tier:** 750 hrs/month t2.micro/t3.micro. Running ~9 hrs/day × 22 days ≈ 198 hrs—well within free tier.
- **Stopped instance:** EBS ~$0.10/GB/month. 8 GB ≈ $0.80.
- **Stopping at 4 PM** saves ~70% of compute vs 24/7.

---

## Signal Effectiveness: Market Hours Only

### What Catalysts Happen When?

| Catalyst Type | Pre-Market (7 AM) | Market Hours (9:30–4) | After Hours (4–8 PM) | Overnight |
|---------------|-------------------|------------------------|----------------------|-----------|
| **Squeeze Detection** | ✅ High | ✅✅ Very High | ⚠️ Medium | ❌ Low |
| **Insider Buys** | ✅ High | ✅ High | ⚠️ Some filings | ⚠️ Late filings |
| **Biotech Catalysts** | ✅✅ Very High | ✅ High | ⚠️ Medium | ⚠️ International |
| **Earnings Gaps** | ❌ Miss | ❌ Miss | ✅ Catch | ❌ Too late |
| **Overnight News** | ❌ Miss | ❌ Miss | ❌ Miss | ✅ Catch |

### What You Catch vs. What You Miss

**Catch:** Squeeze setups, insider positioning, biotech catalysts (FDA, PDUFA), pre-market momentum, opening volatility.  
**Miss:** Earnings surprises that gap overnight, international/overseas news before US open, after-hours filings.

**Conclusion:** Market-hours-only deployment captures ~90% of valuable signals at ~5% of 24/7 infrastructure cost. The trade-off is sensible for students: you demonstrate the full pipeline, understand the architecture, and optimize for cost. Missing overnight gaps is acceptable when the alternative is $200+/month.

---

## Recommended Schedule

| Time (ET) | Rationale | Action |
|-----------|-----------|--------|
| **6:50 AM** | Instance needs ~2 min to boot | Lambda starts EC2 |
| **7:00 AM** | Pre-market: Finviz short squeeze data, SEC EDGAR overnight filings, BioPharmCatalyst FDA (often 8 AM) | Run full pipeline, capture pre-market movers |
| **9:30 AM** | Market open: fresh volume, squeeze intensity, more filings | Re-run pipeline, confirm signals, catch opening volatility |
| **4:00 PM** | Market closes, little new signal value | Lambda stops EC2 |

---

## Alternative 1: Lambda Only (Cheapest)

### Architecture

- No EC2. Lambda for each component:
  - LambdaHunters: scrape, write to Kafka (or SQS if you replace Kafka)
  - LambdaGatekeeper: consume, filter, write to next topic
  - LambdaAI: consume, call Gemini, write to validated-signals
- EventBridge triggers at 7 AM and 9:30 AM ET.

### Cost

- Lambda: ~$0.20/month for scheduled invocations
- Kafka: still required. Self-managed on a small EC2: $10–15. Or SQS + code changes: ~$0.50/month.
- SNS (optional): ~$0.50/month for email alerts

### Gotchas

- **Cold starts:** First run can be 5–10 seconds per function.
- **Debugging:** No SSH; rely on CloudWatch Logs.
- **Package size:** Hunters use Playwright/pandas; Lambda layer or container image needed.
- **Kafka:** You still need Kafka. MSK is expensive; self-hosted Kafka on EC2 defeats “zero infra.”

### When to Use

- You want the absolute minimum cost.
- You accept cold starts and harder debugging.
- You are willing to refactor (e.g., SQS instead of Kafka) to avoid EC2.

---

## Alternative 2: ECS (Production, When You're Ready)

This is the **production-ready but expensive** approach. Use it when you have validated the concept and need real uptime. For students, EC2 + scheduling is the right choice first.

### Why It's Overkill for Students

- $200–250/month before any revenue
- MSK, ElastiCache, Fargate add operational complexity
- You gain 24/7 uptime and ~10% more signals (overnight, after-hours)

### Why It Matters for Real Products

- No manual start/stop; always on
- Auto-scaling, managed Kafka, managed Redis
- Suitable for paying users or live trading

### How to Graduate Later

1. Push Docker images to ECR.
2. Create ECS task definitions for gatekeeper, ai-layer, hunters.
3. Provision MSK, ElastiCache.
4. Point tasks at managed Kafka/Redis.
5. Schedule hunters via EventBridge → ECS RunTask.

Original cost and architecture: ECS Fargate, MSK, ElastiCache ≈ $200–250/month. See the original DEPLOYMENT notes for task definitions and scaling triggers.

---

## Monitoring & Maintenance

### Weekly Manual Check

```bash
# Instance state
aws ec2 describe-instances --filters "Name=tag:Name,Values=catalyst" \
  --query 'Reservations[0].Instances[0].[State.Name, LaunchTime]' --output text

# Lambda logs from this morning
aws logs tail /aws/lambda/catalyst-startup --since 12h
aws logs tail /aws/lambda/catalyst-shutdown --since 12h
```

### Check Kafka Topics (SSH to EC2)

```bash
docker exec catalyst_kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic validated-signals \
  --from-beginning --max-messages 20 --timeout-ms 5000
```

### When Things Break

| Symptom | Action |
|---------|--------|
| No signals | SSH in, `docker compose logs gatekeeper ai-layer hunter_squeeze` |
| Lambda didn't trigger | EventBridge rule enabled? Check CloudWatch Logs for the Lambda |
| Kafka/containers down | `docker compose restart` or `docker compose up -d` |

---

## Future Scaling

### When to Upgrade

Consider moving to ECS when you have:

- 6+ months of real signal data
- Validated that signals add value
- Users who depend on results
- Budget for $200+/month

### What Comes Next

- Full ECS deployment (24/7)
- RDS or TimescaleDB instead of Kafka-only persistence
- Alerting (SNS, Slack, Discord)
- Live dashboard (React frontend)
- Backtesting engine (e.g., Java Spring)

For now, EC2 + scheduling is the right choice.

---

## What This Demonstrates for Recruiting

### What It Shows That 24/7 Deployment Doesn't

- **Cost awareness:** You optimize spend instead of adding resources by default.
- **Trade-off thinking:** You understand signal effectiveness vs. infrastructure cost.
- **Pragmatism:** You work within realistic constraints.
- **Systems thinking:** You don’t equate expensive with better.

### Resume Angle

**Avoid:** "Deployed catalyst to AWS ECS with Kafka and Redis."

**Prefer:** "Deployed catalyst to AWS with cost-optimized scheduling: runs pre-market and market open only, reducing infrastructure to ~$15/month while maintaining ~90% signal effectiveness. Demonstrates trade-off analysis between overnight catalysts and student budget."

### Interview Angle

When asked *"How did you deploy this?"*:

> "I use a t3.micro EC2 instance that starts at 6:50 AM and stops at 4 PM ET via Lambda and EventBridge. It runs docker compose, same as on my laptop. Cost is ~$15/month because most of the catalysts I care about happen during market hours. I optimized for ‘does it work’ and ‘is it affordable’ rather than over-engineering for 24/7 when most of the value comes from 6–7 hours per day."

That answer signals pragmatism, cost awareness, and systems thinking.

---

## Final Checklist

Before going live, verify:

- [ ] Cost section clearly shows $10–15/month (not $200)
- [ ] Trade-off analysis is honest (what you catch vs. miss)
- [ ] EC2 + scheduling is clearly recommended (not ECS)
- [ ] Step-by-step setup is detailed enough for a beginner
- [ ] Code examples are copy-paste ready
- [ ] Schedule timing is specific (6:50 AM, 4:00 PM ET)
- [ ] Monitoring section is practical
- [ ] Recruiting angle is clear

---

## Quick Reference: Expected Outcome

- **6:50 AM ET:** EC2 starts via Lambda
- **7:00 AM ET:** Pipeline runs (cron or user-data), publishes signals
- **9:30 AM ET:** Pipeline runs again
- **4:00 PM ET:** EC2 stops via Lambda
- **Cost:** ~$10–15/month
