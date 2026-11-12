# Mailpit (local email)

A mail catcher for development. Apps send email over SMTP to port 1025; Mailpit
keeps every message and shows it in a web inbox. **Nothing is delivered to a real
mailbox**, so it's safe to test password resets and notifications with real addresses.

| | |
|---|---|
| Inbox (web UI) | http://localhost:8025 |
| SMTP from the Mac | `localhost:1025`, no TLS, any username/password |
| SMTP from containers on `devops-network` | `stack-mailpit:1025` |
| Data | `./data/mailpit.db` (git-ignored; disposable, not backed up) |
| Memory limit | 128 MB |

## Start and stop

```bash
make up S=mailpit
make logs S=mailpit
make down S=mailpit
```

## Using it

- **JobTrigger backend** (runs on the Mac with `npm run dev`): `SMTP_HOST=localhost`,
  `SMTP_PORT=1025`, `SMTP_SECURE=false`. See JobTrigger `docs/subscription/04-email-and-analytics.md`.
- **Jenkins** (Extended E-mail Notification): SMTP server `stack-mailpit`, port `1025`, no SSL.
- Quick test from the Mac: `printf 'Subject: hi\n\ntest\n' | curl -s smtp://localhost:1025 --mail-from a@lab.local --mail-rcpt b@lab.local -T -`

## Configuration (`.env`, optional)

| Variable | Default | Purpose |
|---|---|---|
| MAILPIT_SMTP_PORT | 1025 | Host SMTP port |
| MAILPIT_UI_PORT | 8025 | Host web UI port |
| MAILPIT_BIND | 127.0.0.1 | Host interface |
| MAILPIT_MAX_MESSAGES | 1000 | Oldest messages pruned past this |

## Production

Mailpit is for development only. A deployed app needs a real provider (SES, Resend,
Postmark…); only the SMTP settings change.

## Dashboard entry
Folder `mailpit`, port 8025, Health URL `http://localhost:8025/readyz`.
