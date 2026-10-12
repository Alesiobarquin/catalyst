"""Open an isolated browser for manual BioPharmCatalyst login and save private state."""

import argparse
import json
import os
import re
import select
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def capture(output: Path) -> None:
    from playwright.sync_api import sync_playwright

    from hunters.common.biopharm_auth import PROVIDER_HOSTS, validate_biopharm_storage_state

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        try:
            context = browser.new_context()
            page = context.new_page()
            page.goto(
                "https://www.biopharmcatalyst.com/account/login",
                wait_until="domcontentloaded",
                timeout=45000,
            )
            print("Sign in yourself in the opened browser. Passwords and MFA stay in that browser.")
            print("When signed in, enter 'save' here. The calendar will be checked before saving.")
            print("Enter anything else to cancel. This login window expires in ten minutes.")
            ready, _, _ = select.select([sys.stdin], [], [], 600)
            if not ready or sys.stdin.readline().strip().lower() != "save":
                print("Login setup cancelled; no session was saved.")
                return
            page.goto(
                "https://www.biopharmcatalyst.com/calendars/pdufa-calendar",
                wait_until="domcontentloaded",
                timeout=45000,
            )
            page.wait_for_selector("table tbody tr", timeout=45000)
            unlocked = False
            for table in page.locator("table").all():
                headers = [
                    re.sub(r"[^a-z]", "", h.lower()) for h in table.locator("th").all_inner_texts()
                ]
                if "drug" not in headers or "pdufadate" not in headers:
                    continue
                drug_index, date_index = headers.index("drug"), headers.index("pdufadate")
                for row in table.locator("tbody tr").all():
                    cells = row.locator("td").all_inner_texts()
                    if len(cells) <= max(drug_index, date_index):
                        continue
                    values = [cells[drug_index].strip(), cells[date_index].strip()]
                    markers = ("locked", "signup now", "sign up", "log in")
                    if all(
                        value and not any(m in value.lower() for m in markers) for value in values
                    ):
                        unlocked = True
                        break
                if unlocked:
                    break
            if not unlocked:
                print(
                    "The account did not expose Drug and PDUFA Date values; no session was saved."
                )
                return
            state = context.storage_state()
            # This context starts empty. Keep only the provider's state, excluding
            # advertising/analytics domains encountered during the manual login.
            state["cookies"] = [
                cookie
                for cookie in state["cookies"]
                if cookie["domain"].lower().removeprefix(".") in PROVIDER_HOSTS
                and (
                    "partitionKey" not in cookie
                    or urlsplit(cookie["partitionKey"]).hostname in PROVIDER_HOSTS
                )
            ]
            state["origins"] = [
                origin
                for origin in state["origins"]
                if urlsplit(origin["origin"]).hostname in PROVIDER_HOSTS
            ]
            state = validate_biopharm_storage_state(state)
            output = output.expanduser().resolve()
            output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            temporary_path = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w",
                    dir=output.parent,
                    prefix=".biopharm-storage-state-",
                    delete=False,
                ) as temporary:
                    temporary_path = Path(temporary.name)
                    json.dump(state, temporary)
                temporary_path.chmod(0o600)
                os.replace(temporary_path, output)
            finally:
                if temporary_path is not None:
                    temporary_path.unlink(missing_ok=True)
            print(
                "Provider-only session saved privately. Upload it with public_demo.py biopharm-session."
            )
        finally:
            browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path.home() / ".config/catalyst/biopharm-storage-state.json",
    )
    args = parser.parse_args()
    try:
        capture(args.output)
    except Exception:
        raise SystemExit("BioPharm login setup failed; no new session was saved.") from None


if __name__ == "__main__":
    main()
