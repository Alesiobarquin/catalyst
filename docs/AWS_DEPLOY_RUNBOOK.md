# AWS Deploy Runbook (Student Scope)

This is the **Phase 4** execution companion to [DEPLOYMENT.md](DEPLOYMENT.md).

## Preconditions

Complete [PRE_AWS_READINESS_CHECKLIST.md](PRE_AWS_READINESS_CHECKLIST.md) first.

### AWS access (hard gate)

Provisioning **cannot** start until both succeed on the machine you use for deploy:

1. **AWS CLI installed** (`aws --version`).
2. **Credentials resolve** — `aws sts get-caller-identity` returns `Account` and `Arn` (after `aws configure` or an IAM role/profile).

If either check fails, you are blocked on **AWS CLI install and/or account credentials**; record that in your deploy notes and do not treat later steps as complete until `aws sts get-caller-identity` succeeds. Product docs stay canonical in this file and [DEPLOYMENT.md](DEPLOYMENT.md).

## What you are building

- EC2 `t3.micro` running the same `docker compose` stack as local dev
- Lambda start/stop
- EventBridge schedules

## Implementation order

1. Create EC2 + security group + SSH access (see [DEPLOYMENT.md](DEPLOYMENT.md) Part 1).
2. Install Docker + Compose on the instance; clone repo; configure `.env`.
3. Validate locally on the instance:
   - `docker compose up -d --build`
   - `curl http://localhost:8000/health`
   - `curl http://localhost:8081/actuator/health`
4. Create IAM role + Lambdas using:
   - [deploy/lambda_startup.py](../deploy/lambda_startup.py)
   - [deploy/lambda_shutdown.py](../deploy/lambda_shutdown.py)
5. Wire EventBridge schedules (start before market window, stop after).
6. Keep schedules **disabled** until you intentionally want spend.

## Post-deploy verification

Use the smoke checks in [AUGUST_ACTIVATION_CHECKLIST.md](AUGUST_ACTIVATION_CHECKLIST.md).

## Cost guardrails

- Prefer weekday windows and stop instances outside the window.
- If spend spikes, verify you did not leave the instance running 24/7 accidentally.
