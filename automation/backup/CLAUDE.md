# Backup System — Scheduled Health Checks

macOS launchd scripts for automated backups, health checks, and morning reports.

## Setup

```bash
bash setup_backup.sh    # Install launchd plists
```

## Schedule

- Morning report: daily
- Google Drive backup: daily
- Health notifications: periodic

## Files

- `backup_morning_report.sh` — Morning summary
- `backup_health.sh` — System health checks
- `gdrive_backup.sh` — Google Drive sync
- `*.plist` — launchd scheduler configs (install to ~/Library/LaunchAgents/)
