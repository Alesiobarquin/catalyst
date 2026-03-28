"""
Lambda: catalyst-shutdown
Triggered by EventBridge at 4:00 PM ET to stop the Catalyst EC2 instance.
Set EC2_INSTANCE_ID via Lambda environment variables.
"""
import boto3
import logging
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

EC2_INSTANCE_ID = os.environ.get("EC2_INSTANCE_ID", "i-0xxxxx")


def lambda_handler(event, context):
    ec2 = boto3.client("ec2")
    try:
        response = ec2.stop_instances(InstanceIds=[EC2_INSTANCE_ID])
        state = response["StoppingInstances"][0]["CurrentState"]["Name"]
        logger.info("Stopped instance %s: %s", EC2_INSTANCE_ID, state)
        return {"statusCode": 200, "body": f"Stopped {EC2_INSTANCE_ID}"}
    except Exception as e:
        logger.error("Failed to stop instance: %s", e)
        raise
