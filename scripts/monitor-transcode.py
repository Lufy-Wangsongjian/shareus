#!/usr/bin/env python3
"""Poll Shareus video transcode status and email on completion."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

STATE_DIR = Path.home() / ".shareus"
STATE_FILE = STATE_DIR / "transcode-monitor-state.json"
ENV_FILE = STATE_DIR / "monitor.env"
PROJECT_ENV = Path(__file__).resolve().parents[1] / ".env.local"
SEND_EMAIL = Path.home() / ".codex/skills/lufy-send-email/scripts/send_email.py"
DEFAULT_API = "https://shareus-api-w7zx5u5teq-de.a.run.app"
DEFAULT_WEB = "https://shareus-web-w7zx5u5teq-de.a.run.app"
TERMINAL_STATUSES = {"ready", "failed"}


def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def request_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, body: dict | None = None) -> object:
    command = ["curl", "-fsS", "-X", method, url]
    for key, value in (headers or {}).items():
        command.extend(["-H", f"{key}: {value}"])
    if body is not None:
        command.extend(["-H", "Content-Type: application/json", "-d", json.dumps(body)])
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def login(api_base: str, password: str) -> str:
    payload = request_json(
        f"{api_base}/api/auth/admin-login",
        method="POST",
        body={"password": password},
    )
    token = payload.get("token") if isinstance(payload, dict) else None
    if not token:
        raise RuntimeError("Admin login did not return a token")
    return str(token)


def list_videos(api_base: str, token: str) -> list[dict]:
    payload = request_json(
        f"{api_base}/api/videos",
        headers={"Authorization": f"Bearer {token}"},
    )
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected /api/videos response")
    return payload


def load_state() -> dict[str, str]:
    if not STATE_FILE.exists():
        return {}
    data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    videos = data.get("videos", {})
    return {str(k): str(v) for k, v in videos.items()}


def save_state(videos: dict[str, str]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps({"videos": videos}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def should_notify(previous: str | None, current: str) -> bool:
    if current not in TERMINAL_STATUSES:
        return False
    if previous is None:
        return False
    if previous == current:
        return False
    return previous in {"processing", "imported", "failed"}


def build_email(video: dict, web_base: str) -> tuple[str, str]:
    title = str(video.get("title") or video.get("id") or "未知影片")
    status = str(video.get("status") or "unknown")
    source = str(video.get("sourceObjectPath") or "")
    failure = str(video.get("failureMessage") or "")

    if status == "ready":
        subject = f"Shareus 转码完成：{title}"
        body = (
            f"影片：{title}\n"
            f"状态：ready\n"
            f"源文件：{source}\n\n"
            f"管理页：{web_base}/admin\n"
            f"首页：{web_base}\n"
        )
    else:
        subject = f"Shareus 转码失败：{title}"
        body = (
            f"影片：{title}\n"
            f"状态：failed\n"
            f"源文件：{source}\n"
            f"错误：{failure or '未知错误'}\n\n"
            f"管理页：{web_base}/admin\n"
        )
    return subject, body


def send_email(subject: str, body: str, dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] email subject: {subject}")
        print(body)
        return
    if not SEND_EMAIL.exists():
        raise RuntimeError(f"Email script not found: {SEND_EMAIL}")
    subprocess.run(
        [sys.executable, str(SEND_EMAIL), "--subject", subject, "--body", body, "--from-name", "Shareus Bot"],
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Monitor Shareus transcode status and send email notifications.")
    parser.add_argument("--dry-run", action="store_true", help="Print notifications without sending email")
    parser.add_argument("--seed", action="store_true", help="Record current statuses without sending email")
    args = parser.parse_args()

    env = load_env(ENV_FILE) or load_env(PROJECT_ENV)
    api_base = os.environ.get("API_BASE_URL") or env.get("API_BASE_URL") or DEFAULT_API
    web_base = os.environ.get("WEB_BASE_URL") or env.get("WEB_BASE_URL") or DEFAULT_WEB
    admin_password = os.environ.get("ADMIN_PASSWORD") or env.get("ADMIN_PASSWORD")
    if not admin_password:
        print("Missing ADMIN_PASSWORD. Set it in .env.local or the environment.", file=sys.stderr)
        return 1

    token = login(api_base, admin_password)
    videos = list_videos(api_base, token)
    previous = load_state()
    current_map = {str(video["id"]): str(video.get("status") or "unknown") for video in videos}

    if args.seed or not previous:
        save_state(current_map)
        print(f"Seeded monitor state for {len(current_map)} video(s).")
        return 0

    sent = 0
    for video in videos:
        video_id = str(video["id"])
        old_status = previous.get(video_id)
        new_status = current_map[video_id]
        if not should_notify(old_status, new_status):
            continue
        subject, body = build_email(video, web_base)
        send_email(subject, body, args.dry_run)
        sent += 1
        print(f"Notified: {video_id} {old_status} -> {new_status}")

    save_state(current_map)
    if sent == 0:
        print("No transcode status changes to notify.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
