# Deployment Scripts

Lambda functions for scheduled EC2 start/stop.

- **lambda_startup.py** — EventBridge triggers at 6:50 AM ET → starts EC2
- **lambda_shutdown.py** — EventBridge triggers at 4:00 PM ET → stops EC2

## Deploy

**IaC (recommended):** CDK in [infra/](../infra/) packages these handlers and sets `EC2_INSTANCE_ID` automatically. Run `npx cdk deploy` from `infra/`.

**Manual:** Copy into Lambda console and set `EC2_INSTANCE_ID` in each function's environment variables.

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) and [docs/AUGUST_ACTIVATION_CHECKLIST.md](../docs/AUGUST_ACTIVATION_CHECKLIST.md).
