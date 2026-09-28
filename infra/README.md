# Catalyst Infrastructure (AWS CDK)

Infrastructure-as-code for the student-scope AWS deployment: Lambda start/stop + EventBridge schedules targeting the Catalyst EC2 instance.

## Prerequisites

- AWS CLI configured (`aws sts get-caller-identity` succeeds)
- Node.js 18+ (for CDK CLI)
- Python 3.11+

## Quick deploy (existing EC2)

If you already have a `catalyst` EC2 instance:

```bash
cd infra
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# One-time per account/region
npx aws-cdk bootstrap

# Deploy Lambda + IAM + EventBridge (rules disabled by default)
npx cdk deploy \
  --context existingInstanceId=i-0xxxxxxxx \
  --require-approval never
```

## Full deploy (create EC2 + scheduling)

```bash
npx cdk deploy \
  --context createEc2=true \
  --context keyPairName=catalyst-us-east-1 \
  --context sshCidr="$(curl -s https://checkip.amazonaws.com)/32" \
  --require-approval never
```

## After deploy

1. SSH to EC2 with your `.pem` key
2. Clone repo, copy `.env` with `GEMINI_API_KEY`, run `docker compose up -d`
3. Test Lambdas manually in the AWS console
4. When ready for recruiting season, enable EventBridge rules per [docs/AUGUST_ACTIVATION_CHECKLIST.md](../docs/AUGUST_ACTIVATION_CHECKLIST.md)

## Useful commands

```bash
npx cdk diff
npx cdk destroy   # removes Lambda/EventBridge; EC2 only if createEc2=true
```

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for the full deployment guide.
