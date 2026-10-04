#!/usr/bin/env python3
import os

import aws_cdk as cdk
from catalyst_stack import CatalystStack
from public_demo_stack import PublicDemoStack

app = cdk.App()

stack_type = PublicDemoStack if app.node.try_get_context("publicDemo") == "true" else CatalystStack
stack_type(
    app,
    "CatalystPublicDemoStack" if stack_type == PublicDemoStack else "CatalystStack",
    env=cdk.Environment(
        account=os.getenv("CDK_DEFAULT_ACCOUNT"),
        region=os.getenv("CDK_DEFAULT_REGION", "us-east-1"),
    ),
    description="Catalyst daily worker and static public dashboard"
    if stack_type == PublicDemoStack
    else "Catalyst legacy EC2 scheduling",
)

app.synth()
