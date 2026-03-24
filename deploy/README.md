# Deployment Scripts

Lambda functions for scheduled EC2 start/stop. See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for full setup.

- **lambda_startup.py** — EventBridge triggers at 6:50 AM ET → starts EC2
- **lambda_shutdown.py** — EventBridge triggers at 4:00 PM ET → stops EC2

Set `EC2_INSTANCE_ID` in each Lambda's environment variables.
