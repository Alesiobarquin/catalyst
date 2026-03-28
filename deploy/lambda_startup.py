"""
Lambda: catalyst-startup
Triggered by EventBridge at 6:50 AM ET to start the Catalyst EC2 instance.
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
        response = ec2.start_instances(InstanceIds=[EC2_INSTANCE_ID])
        state = response["StartingInstances"][0]["CurrentState"]["Name"]
        logger.info("Started instance %s: %s", EC2_INSTANCE_ID, state)
        return {"statusCode": 200, "body": f"Started {EC2_INSTANCE_ID}"}
    except Exception as e:
        logger.error("Failed to start instance: %s", e)
        raise
