"""CLI operations for Catalyst's public demo; secrets never appear in arguments or output."""

import argparse
import json
import secrets
import subprocess
import tempfile
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent
STACK = "CatalystPublicDemoStack"
PARAMETER = "/catalyst/public-demo/runtime"


def command(args: list[str], missing_ok: bool = False) -> str | None:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        if missing_ok and "ParameterNotFound" in result.stderr:
            return None
        raise RuntimeError(f"Operation failed: {' '.join(args[:3])}. {result.stderr[:300]}")
    return result.stdout


def outputs() -> dict[str, str]:
    stack = json.loads(
        command(
            ["aws", "cloudformation", "describe-stacks", "--stack-name", STACK, "--output", "json"]
        )
    )["Stacks"][0]
    return {entry["OutputKey"]: entry["OutputValue"] for entry in stack["Outputs"]}


def configure(environment: Path, github: bool = True) -> None:
    values = dotenv_values(environment)
    if not values.get("GEMINI_API_KEY"):
        raise ValueError("GEMINI_API_KEY is missing from the local secrets file")
    old = command(
        [
            "aws",
            "ssm",
            "get-parameter",
            "--name",
            PARAMETER,
            "--with-decryption",
            "--query",
            "Parameter.Value",
            "--output",
            "text",
        ],
        missing_ok=True,
    )
    password = json.loads(old)["TIMESCALE_PASSWORD"] if old else secrets.token_hex(24)
    runtime = {
        "KAFKA_BOOTSTRAP_SERVERS": "kafka:29092",
        "REDIS_HOST": "redis",
        "REDIS_PORT": "6379",
        "TIMESCALE_HOST": "timescaledb",
        "TIMESCALE_PORT": "5432",
        "TIMESCALE_USER": "catalyst_user",
        "TIMESCALE_PASSWORD": password,
        "TIMESCALE_DB": "catalyst_db",
        "DATABASE_URL": f"postgresql://catalyst_user:{password}@timescaledb:5432/catalyst_db",
        "ENGINE_HEALTH_URL": "http://engine:8081/actuator/health",
        "CORS_ORIGINS": "[]",
        "GEMINI_API_KEY": values["GEMINI_API_KEY"],
        "FMP_API_KEY": values.get("FMP_API_KEY") or "",
        "GEMINI_MODEL": "gemini-3.8-flash",
        "GEMINI_FALLBACK_MODEL": "",
        "GEMINI_THINKING_LEVEL": "low",
        "GEMINI_MAX_OUTPUT_TOKENS": "2048",
        "GEMINI_MAX_RETRIES": "1",
        "AI_ALLOW_HEURISTIC_FALLBACK": "false",
        "AI_REQUIRE_GROUNDING": "true",
        "AI_DAILY_REQUEST_LIMIT": "2",
        "AI_BUDGET_FILE": "/app/state/budget.json",
        "AI_MIN_CONVICTION_SCORE": "50",
        "GATEKEEPER_REQUIRE_CONFLUENCE": "true",
        "GATEKEEPER_CONFLUENCE_THRESHOLD": "2",
        "HUNTER_STRICT_DELIVERY": "true",
        "PORTFOLIO_VALUE": "100000",
        "MAX_KELLY_FRACTION": "0.25",
        "VIX_HALT_THRESHOLD": "40",
        "VIX_SCALPER_ONLY_THRESHOLD": "30",
        "RESOLVER_POLL_INTERVAL_SECONDS": "60",
        "MAX_HOLDING_DAYS": "14",
    }
    with tempfile.TemporaryDirectory(prefix="catalyst-secrets-") as directory:
        path = Path(directory) / "parameter.json"
        path.write_text(
            json.dumps(
                {
                    "Name": PARAMETER,
                    "Type": "SecureString",
                    "Value": json.dumps(runtime),
                    "Overwrite": True,
                }
            )
        )
        path.chmod(0o600)
        command(["aws", "ssm", "put-parameter", "--cli-input-json", f"file://{path}"])
    print("Runtime configuration stored securely; database password preserved.")
    if github:
        data = outputs()
        mapping = {
            "AWS_DEPLOY_ROLE_ARN": "PublisherRoleArn",
            "PUBLIC_SITE_BUCKET": "SiteBucket",
            "ARTIFACT_BUCKET": "ArtifactBucket",
            "PUBLIC_DISTRIBUTION_ID": "DistributionId",
            "PIPELINE_REPOSITORY": "PipelineRepository",
            "HUNTERS_REPOSITORY": "HuntersRepository",
            "ENGINE_REPOSITORY": "EngineRepository",
        }
        for variable, output in mapping.items():
            command(
                [
                    "gh",
                    "variable",
                    "set",
                    variable,
                    "--repo",
                    "Alesiobarquin/catalyst",
                    "--body",
                    data[output],
                ]
            )
        print("GitHub release variables configured; authentication uses OIDC.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["configure", "status", "run"])
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--no-github", action="store_true")
    args = parser.parse_args()
    if args.operation == "configure":
        configure(args.env_file, not args.no_github)
        return
    data = outputs()
    instance = data["WorkerInstanceId"]
    state = command(
        [
            "aws",
            "ec2",
            "describe-instances",
            "--instance-ids",
            instance,
            "--query",
            "Reservations[0].Instances[0].State.Name",
            "--output",
            "text",
        ]
    ).strip()
    print("Dashboard:", data["DashboardUrl"])
    print("Worker:", instance, state)
    if args.operation == "run":
        if state == "stopped":
            command(["aws", "ec2", "start-instances", "--instance-ids", instance])
            print("Started worker; systemd runs the latest release and shuts down afterward.")
        else:
            print("Worker is already active; no overlapping run started.")


if __name__ == "__main__":
    main()
