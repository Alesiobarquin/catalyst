#!/usr/bin/env python3
import os

import aws_cdk as cdk
from catalyst_stack import CatalystStack

app = cdk.App()

CatalystStack(
    app,
    "CatalystStack",
    env=cdk.Environment(
        account=os.getenv("CDK_DEFAULT_ACCOUNT"),
        region=os.getenv("CDK_DEFAULT_REGION", "us-east-1"),
    ),
    description="Catalyst EC2 scheduling: Lambda start/stop + EventBridge rules",
)

app.synth()
