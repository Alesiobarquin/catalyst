"""Private static hosting and a finite scheduled Docker worker; no always-on API."""

import json
from pathlib import Path

import aws_cdk as cdk
from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
)
from aws_cdk import (
    aws_budgets as budgets,
)
from aws_cdk import (
    aws_cloudfront as cloudfront,
)
from aws_cdk import (
    aws_cloudfront_origins as origins,
)
from aws_cdk import (
    aws_ec2 as ec2,
)
from aws_cdk import (
    aws_ecr as ecr,
)
from aws_cdk import (
    aws_iam as iam,
)
from aws_cdk import (
    aws_s3 as s3,
)
from aws_cdk import (
    aws_scheduler as scheduler,
)
from constructs import Construct


class PublicDemoStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs):
        super().__init__(scope, construct_id, **kwargs)
        cdk.Tags.of(self).add("Project", "catalyst-public-demo")
        site = s3.Bucket(
            self,
            "Site",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            versioned=True,
            removal_policy=RemovalPolicy.RETAIN,
            lifecycle_rules=[s3.LifecycleRule(noncurrent_version_expiration=Duration.days(3))],
        )
        artifacts = s3.Bucket(
            self,
            "Artifacts",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            versioned=True,
            removal_policy=RemovalPolicy.RETAIN,
            lifecycle_rules=[
                s3.LifecycleRule(noncurrent_version_expiration=Duration.days(7)),
                s3.LifecycleRule(prefix="logs/", expiration=Duration.days(14)),
            ],
        )
        rewrite = cloudfront.Function(
            self,
            "DirectoryIndex",
            code=cloudfront.FunctionCode.from_inline(
                "function handler(e){var r=e.request;var u=r.uri;if(u.endsWith('/'))r.uri+='index.html';else if(!u.split('/').pop().includes('.'))r.uri+='/index.html';return r;}"
            ),
        )
        origin = origins.S3BucketOrigin.with_origin_access_control(site)
        distribution = cloudfront.Distribution(
            self,
            "Dashboard",
            default_root_object="index.html",
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
            default_behavior=cloudfront.BehaviorOptions(
                origin=origin,
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_DISABLED,
                response_headers_policy=cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                function_associations=[
                    cloudfront.FunctionAssociation(
                        function=rewrite, event_type=cloudfront.FunctionEventType.VIEWER_REQUEST
                    )
                ],
            ),
            additional_behaviors={
                "_next/*": cloudfront.BehaviorOptions(
                    origin=origin,
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                )
            },
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=code,
                    response_http_status=404,
                    response_page_path="/404.html",
                    ttl=Duration.seconds(0),
                )
                for code in (403, 404)
            ],
        )
        repos = {
            name: ecr.Repository(
                self,
                name.title() + "Image",
                repository_name="catalyst-" + name,
                image_tag_mutability=ecr.TagMutability.IMMUTABLE,
                removal_policy=RemovalPolicy.RETAIN,
                lifecycle_rules=[ecr.LifecycleRule(max_image_count=2)],
            )
            for name in ("pipeline", "hunters", "engine")
        }
        worker_role = iam.Role(
            self,
            "WorkerRole",
            assumed_by=iam.ServicePrincipal("ec2.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSSMManagedInstanceCore")
            ],
        )
        artifacts.grant_read(worker_role)
        artifacts.grant_put(worker_role, "logs/*")
        artifacts.grant_put(worker_role, "backups/*")
        site.grant_put(worker_role, "data/*")
        for repo in repos.values():
            repo.grant_pull(worker_role)
        parameter_name = "/catalyst/public-demo/runtime"
        worker_role.add_to_policy(
            iam.PolicyStatement(
                actions=["ssm:GetParameter"],
                resources=[
                    self.format_arn(
                        service="ssm",
                        resource="parameter",
                        resource_name="catalyst/public-demo/runtime",
                    )
                ],
            )
        )
        worker_role.add_to_policy(
            iam.PolicyStatement(
                actions=["ec2:StopInstances"],
                resources=[self.format_arn(service="ec2", resource="instance", resource_name="*")],
                conditions={"StringEquals": {"ec2:ResourceTag/Project": "catalyst-public-demo"}},
            )
        )
        vpc = ec2.Vpc.from_lookup(self, "DefaultVpc", is_default=True)
        sg = ec2.SecurityGroup(
            self,
            "WorkerSecurityGroup",
            vpc=vpc,
            allow_all_outbound=True,
            description="SSM-managed batch worker; no inbound ports",
        )
        bootstrap = Path(__file__).with_name("worker_bootstrap.sh").read_text()
        for key, value in {
            "@@REGION@@": self.region,
            "@@SITE_BUCKET@@": site.bucket_name,
            "@@ARTIFACT_BUCKET@@": artifacts.bucket_name,
            "@@PARAMETER@@": parameter_name,
        }.items():
            bootstrap = bootstrap.replace(key, value)
        worker = ec2.Instance(
            self,
            "Worker",
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
            security_group=sg,
            role=worker_role,
            instance_type=ec2.InstanceType("m6a.large"),
            machine_image=ec2.MachineImage.latest_amazon_linux2023(
                cpu_type=ec2.AmazonLinuxCpuType.X86_64
            ),
            require_imdsv2=True,
            associate_public_ip_address=True,
            user_data=ec2.UserData.custom(bootstrap),
            block_devices=[
                ec2.BlockDevice(
                    device_name="/dev/xvda",
                    volume=ec2.BlockDeviceVolume.ebs(
                        40, encrypted=True, volume_type=ec2.EbsDeviceVolumeType.GP3
                    ),
                )
            ],
        )
        worker.apply_removal_policy(RemovalPolicy.RETAIN)
        cdk.Tags.of(worker).add("Name", "catalyst-daily-worker")
        schedule_role = iam.Role(
            self, "ScheduleRole", assumed_by=iam.ServicePrincipal("scheduler.amazonaws.com")
        )
        schedule_role.add_to_policy(
            iam.PolicyStatement(
                actions=["ec2:StartInstances", "ec2:StopInstances"],
                resources=[
                    self.format_arn(
                        service="ec2", resource="instance", resource_name=worker.instance_id
                    )
                ],
            )
        )
        enabled = self.node.try_get_context("enableDailyScan") == "true"
        for name, action, cron in [
            ("start", "startInstances", "cron(0 10 ? * MON-FRI *)"),
            ("hard-stop", "stopInstances", "cron(30 11 ? * MON-FRI *)"),
        ]:
            scheduler.CfnSchedule(
                self,
                name.title().replace("-", "") + "Schedule",
                name="catalyst-daily-" + name,
                schedule_expression=cron,
                schedule_expression_timezone="America/New_York",
                state="ENABLED" if enabled else "DISABLED",
                flexible_time_window=scheduler.CfnSchedule.FlexibleTimeWindowProperty(mode="OFF"),
                target=scheduler.CfnSchedule.TargetProperty(
                    arn="arn:aws:scheduler:::aws-sdk:ec2:" + action,
                    role_arn=schedule_role.role_arn,
                    input=json.dumps({"InstanceIds": [worker.instance_id]}),
                    retry_policy=scheduler.CfnSchedule.RetryPolicyProperty(
                        maximum_event_age_in_seconds=60, maximum_retry_attempts=0
                    ),
                ),
            )
        provider = iam.OpenIdConnectProvider(
            self,
            "GitHubOidc",
            url="https://token.actions.githubusercontent.com",
            client_ids=["sts.amazonaws.com"],
        )
        publisher = iam.Role(
            self,
            "GitHubPublisher",
            assumed_by=iam.FederatedPrincipal(
                provider.open_id_connect_provider_arn,
                {
                    "StringEquals": {
                        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                        "token.actions.githubusercontent.com:sub": "repo:Alesiobarquin/catalyst:ref:refs/heads/main",
                    }
                },
                "sts:AssumeRoleWithWebIdentity",
            ),
            max_session_duration=Duration.hours(1),
        )
        site.grant_read_write(publisher)
        artifacts.grant_read_write(publisher)
        for repo in repos.values():
            repo.grant_pull_push(publisher)
        publisher.add_to_policy(
            iam.PolicyStatement(
                actions=["ecr:DescribeImages"],
                resources=[repo.repository_arn for repo in repos.values()],
            )
        )
        publisher.add_to_policy(
            iam.PolicyStatement(
                actions=["cloudfront:CreateInvalidation"],
                resources=[
                    self.format_arn(
                        service="cloudfront",
                        region="",
                        resource="distribution",
                        resource_name=distribution.distribution_id,
                    )
                ],
            )
        )
        budgets.CfnBudget(
            self,
            "MonthlyBudget",
            budget=budgets.CfnBudget.BudgetDataProperty(
                budget_name="CatalystMonthly10USD",
                budget_type="COST",
                time_unit="MONTHLY",
                budget_limit=budgets.CfnBudget.SpendProperty(amount=10, unit="USD"),
            ),
        )
        for name, value in {
            "DashboardUrl": "https://" + distribution.distribution_domain_name,
            "DistributionId": distribution.distribution_id,
            "SiteBucket": site.bucket_name,
            "ArtifactBucket": artifacts.bucket_name,
            "WorkerInstanceId": worker.instance_id,
            "WorkerRoleName": worker_role.role_name,
            "PublisherRoleArn": publisher.role_arn,
            "RuntimeParameter": parameter_name,
            **{name.title() + "Repository": repo.repository_uri for name, repo in repos.items()},
        }.items():
            if value:
                CfnOutput(self, name, value=value)
