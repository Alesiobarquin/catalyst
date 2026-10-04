---
name: aws-catalyst-deployment
description: >-
  Operational runbook for deploying, configuring, and maintaining Catalyst on AWS EC2
  with automated market-hour scheduling via AWS CDK, Lambda, and EventBridge.
---

# AWS Catalyst Deployment & Scheduling Runbook

This skill guides provisioning, configuring, and managing the Catalyst pipeline on AWS EC2 with cost-effective automated scheduling.

## Current public hosting target (October 2026)

The accepted target is a public read-only dashboard available 24/7 over an AWS-provided HTTPS URL, with one weekday pipeline run and a hosting budget of at most $10/month. The S3/CloudFront site, scheduled EC2 worker, encrypted SSM runtime, and GitHub OIDC publisher are deployed and verified. Organic scans published and stopped automatically; both weekday schedules are enabled. Read [docs/PUBLIC_DEMO_OPERATIONS.md](../../../docs/PUBLIC_DEMO_OPERATIONS.md) and `AGENTS.md` for current CLI operations, safeguards, source limitations, schedule state, and verification evidence. Repository defaults select this stack and enabled schedules; use `-c enableDailyScan=false` to pause collection or `-c publicDemo=false` to select the legacy stack.

The remaining instructions describe the **legacy single-instance prototype**. Stopping that instance also stops an instance-hosted dashboard. Do not present this legacy workflow as sufficient for the 24/7 public target. The existing instance is a running `t3.micro` / 8 GiB disk, while the CDK source's optional create path is `t3.medium` / 30 GiB; neither establishes a validated memory requirement for the full stack.

## Legacy architecture

- **Compute**: Existing EC2 `t3.micro`; optional CDK create path provisions `t3.medium`, running Ubuntu 22.04 with Docker Compose.
- **Storage**: Existing 8 GiB gp3; optional CDK create path provisions 30 GiB.
- **Cost**: Old $3–8/month guidance omitted important runtime/IPv4/sizing distinctions. Use the current deployment plan's explicit assumptions and verified price model.
- **Automation**:
  - `catalyst-startup` Lambda: Starts EC2 at 6:50 AM ET on weekdays.
  - `catalyst-shutdown` Lambda: Stops EC2 at 4:10 PM ET on weekdays.
  - Managed by AWS EventBridge rules.

---

## 1. Prerequisites

1. AWS CLI installed and configured:
   ```bash
   aws sts get-caller-identity
   ```
2. Node.js & AWS CDK installed:
   ```bash
   npm install -g aws-cdk
   cdk --version
   ```
3. An EC2 Key Pair created in `us-east-1` (default: `catalyst-us-east-1`).

---

## 2. CDK Stack Deployment

The CDK stack is defined in [infra/catalyst_stack.py](file:///Users/alesio/Developer/Projects/catalyst/infra/catalyst_stack.py).

### Option A: Provision Everything (New EC2 + Security Group + Lambdas)
```bash
cd infra
source .venv/bin/activate
cdk deploy -c createEc2=true -c keyPairName=catalyst-us-east-1
```

### Option B: Wire Lambdas to an Existing EC2 Instance
```bash
cd infra
source .venv/bin/activate
cdk deploy -c existingInstanceId=i-0123456789abcdef0
```

> [!IMPORTANT]
> The EventBridge rules are deployed in a **DISABLED** state by default to prevent unexpected AWS compute costs until you are ready for intentional activation.

---

## 3. EC2 Instance Configuration & Bootstrapping

Once the instance is running:

1. **SSH into the EC2 instance**:
   ```bash
   ssh -i ~/.ssh/catalyst-us-east-1.pem ubuntu@<INSTANCE_PUBLIC_IP>
   ```

2. **Run the bootstrap script**:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/alesiobarquin/catalyst/main/scripts/ec2-bootstrap.sh | bash
   ```
   *Or clone manually and run [scripts/ec2-bootstrap.sh](file:///Users/alesio/Developer/Projects/catalyst/scripts/ec2-bootstrap.sh).*

3. **Configure Environment Variables**:
   ```bash
   cd ~/catalyst
   cp .env.example .env
   nano .env  # Add GEMINI_API_KEY (required) and FMP_API_KEY (optional)
   ```

4. **Start the Stack**:
   ```bash
   docker compose up -d --build
   ```

5. **Verify Health**:
   ```bash
   curl -sf http://localhost:8000/health
   curl -sf http://localhost:8081/actuator/health
   docker compose ps
   ```

---

## 4. Scheduling & Activation Discipline

Follow the discipline outlined in [docs/AUGUST_ACTIVATION_CHECKLIST.md](file:///Users/alesio/Developer/Projects/catalyst/docs/AUGUST_ACTIVATION_CHECKLIST.md):

1. **Test Lambda manually**:
   ```bash
   aws lambda invoke --function-name catalyst-startup /tmp/startup_out.json
   cat /tmp/startup_out.json
   ```
2. **Enable EventBridge rules only when ready**:
   ```bash
   aws events enable-rule --name catalyst-weekday-startup
   aws events enable-rule --name catalyst-weekday-shutdown
   ```
3. **Monitor logs in CloudWatch** under `/aws/lambda/catalyst-startup` and `/aws/lambda/catalyst-shutdown`.
