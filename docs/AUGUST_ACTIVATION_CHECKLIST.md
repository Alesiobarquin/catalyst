# August Activation Checklist

Use this when you are ready to turn on AWS runtime for recruiting season.

## Goal

Enable the existing AWS deployment in minutes with a predictable verification loop.

## A) Before Enabling Schedules

- [ ] Complete all items in `docs/PRE_AWS_READINESS_CHECKLIST.md`.
- [ ] Confirm EC2 instance exists and is tagged `Name=catalyst`.
- [ ] Confirm Lambda functions exist (`catalyst-startup`, `catalyst-shutdown`).
- [ ] Confirm `EC2_INSTANCE_ID` env var is set in both Lambdas.
- [ ] Confirm EventBridge rules exist but are disabled.

## B) Enable Runtime

1. Enable EventBridge start/stop rules.
2. Trigger `catalyst-startup` manually once.
3. Wait for EC2 to become `running`.
4. Confirm `docker compose` services are up (via SSH).

## C) Post-Enable Smoke Checks (same day)

- [ ] `docker compose ps` shows all required services up.
- [ ] `curl http://localhost:8000/health` returns OK.
- [ ] `curl http://localhost:8081/actuator/health` returns UP.
- [ ] At least one hunter emits events into `raw-events`.
- [ ] Gatekeeper + AI + engine logs show normal processing (no crash loops).

## D) Next-Morning Verification

- [ ] Start rule fired on time (CloudWatch logs).
- [ ] Instance state transitioned correctly.
- [ ] Pipeline produced expected logs/messages in the open-window cadence.

## E) Failure Rollback Plan

If activation fails:

1. Disable EventBridge rules.
2. Stop EC2 manually.
3. Collect Lambda + compose logs.
4. Fix locally first, then rerun this checklist.

## Command Reference

```bash
# Check instance state
aws ec2 describe-instances --filters "Name=tag:Name,Values=catalyst" \
  --query 'Reservations[0].Instances[0].[State.Name, LaunchTime]' --output text

# Tail Lambda logs
aws logs tail /aws/lambda/catalyst-startup --since 24h
aws logs tail /aws/lambda/catalyst-shutdown --since 24h
```
