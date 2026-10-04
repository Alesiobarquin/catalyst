"""
Catalyst AWS stack.

Default mode (createEc2=false): wire Lambda + EventBridge to an existing EC2 instance.
Optional mode (createEc2=true): also provision EC2, security group, and key pair reference.
"""

from pathlib import Path

import aws_cdk as cdk
from aws_cdk import (
    CfnOutput,
    Duration,
    Stack,
)
from aws_cdk import (
    aws_ec2 as ec2,
)
from aws_cdk import (
    aws_events as events,
)
from aws_cdk import (
    aws_events_targets as targets,
)
from aws_cdk import (
    aws_iam as iam,
)
from aws_cdk import (
    aws_lambda as lambda_,
)
from constructs import Construct

DEPLOY_DIR = Path(__file__).resolve().parent.parent / "deploy"

USER_DATA_SCRIPT = """#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-plugin git
usermod -aG docker ubuntu
systemctl enable docker
systemctl start docker
"""


class CatalystStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        create_ec2 = self.node.try_get_context("createEc2") == "true"
        existing_instance_id = self.node.try_get_context("existingInstanceId")
        key_pair_name = self.node.try_get_context("keyPairName") or "catalyst-us-east-1"
        ssh_cidr = self.node.try_get_context("sshCidr") or "0.0.0.0/0"

        instance_id = existing_instance_id

        if create_ec2:
            vpc = ec2.Vpc.from_lookup(self, "DefaultVpc", is_default=True)

            security_group = ec2.SecurityGroup(
                self,
                "CatalystSecurityGroup",
                vpc=vpc,
                description="Catalyst EC2: SSH in, outbound for market data APIs",
                allow_all_outbound=True,
            )
            security_group.add_ingress_rule(
                ec2.Peer.ipv4(ssh_cidr),
                ec2.Port.tcp(22),
                "SSH access",
            )

            machine_image = ec2.MachineImage.lookup(
                name="ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*",
                owners=["099720109477"],
            )

            instance = ec2.Instance(
                self,
                "CatalystInstance",
                instance_type=ec2.InstanceType("t3.medium"),
                machine_image=machine_image,
                vpc=vpc,
                vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
                security_group=security_group,
                key_pair=ec2.KeyPair.from_key_pair_name(self, "KeyPair", key_pair_name),
                user_data=ec2.UserData.custom(USER_DATA_SCRIPT),
                block_devices=[
                    ec2.BlockDevice(
                        device_name="/dev/sda1",
                        volume=ec2.BlockDeviceVolume.ebs(
                            30, volume_type=ec2.EbsDeviceVolumeType.GP3
                        ),
                    )
                ],
            )
            cdk.Tags.of(instance).add("Name", "catalyst")

            instance_id = instance.instance_id

            CfnOutput(self, "InstancePublicIp", value=instance.instance_public_ip)
            CfnOutput(self, "SecurityGroupId", value=security_group.security_group_id)
        elif not instance_id:
            raise ValueError(
                "Set context existingInstanceId=i-xxxxxxxx or createEc2=true before deploying."
            )

        lambda_role = iam.Role(
            self,
            "CatalystLambdaRole",
            role_name="catalyst-lambda-role",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                )
            ],
        )
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "ec2:StartInstances",
                    "ec2:StopInstances",
                    "ec2:DescribeInstances",
                ],
                resources=["*"],
            )
        )

        lambda_env = {"EC2_INSTANCE_ID": instance_id}

        startup_fn = lambda_.Function(
            self,
            "CatalystStartup",
            function_name="catalyst-startup",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="lambda_startup.lambda_handler",
            code=lambda_.Code.from_asset(str(DEPLOY_DIR)),
            role=lambda_role,
            timeout=Duration.seconds(30),
            environment=lambda_env,
        )

        shutdown_fn = lambda_.Function(
            self,
            "CatalystShutdown",
            function_name="catalyst-shutdown",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="lambda_shutdown.lambda_handler",
            code=lambda_.Code.from_asset(str(DEPLOY_DIR)),
            role=lambda_role,
            timeout=Duration.seconds(30),
            environment=lambda_env,
        )

        # 6:50 AM ET ≈ 10:50 UTC (EDT) / 11:50 UTC (EST). Adjust seasonally if needed.
        start_rule = events.Rule(
            self,
            "CatalystStartDaily",
            rule_name="catalyst-start-daily",
            description="Start Catalyst EC2 before market window (disabled until activation)",
            schedule=events.Schedule.cron(
                minute="50",
                hour="10",
                week_day="MON-FRI",
            ),
            enabled=False,
        )
        start_rule.add_target(targets.LambdaFunction(startup_fn))

        # 4:10 PM ET ≈ 20:10 UTC (EDT) / 21:10 UTC (EST). Adjust seasonally if needed.
        stop_rule = events.Rule(
            self,
            "CatalystStopDaily",
            rule_name="catalyst-stop-daily",
            description="Stop Catalyst EC2 after market window (disabled until activation)",
            schedule=events.Schedule.cron(
                minute="10",
                hour="20",
                week_day="MON-FRI",
            ),
            enabled=False,
        )
        stop_rule.add_target(targets.LambdaFunction(shutdown_fn))

        CfnOutput(self, "Ec2InstanceId", value=instance_id)
        CfnOutput(self, "StartupLambdaArn", value=startup_fn.function_arn)
        CfnOutput(self, "ShutdownLambdaArn", value=shutdown_fn.function_arn)
        CfnOutput(
            self,
            "ActivationNote",
            value="EventBridge rules are DISABLED. Enable via console or cdk deploy after updating enabled=True.",
        )
