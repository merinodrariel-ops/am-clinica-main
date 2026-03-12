---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs.
---

# Google Workspace CLI Assistant (gog)

Integrates Google Workspace services like Gmail, Calendar, Drive, and Sheets directly into your terminal workflow.

## Setup

Requires OAuth setup with a `client_secret.json` from Google Cloud Console.

```bash
gog auth credentials /path/to/client_secret.json
gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets
gog auth list
```

## Common Commands

### Gmail
- **Search**: `gog gmail search 'newer_than:7d' --max 10`
- **Send**: `gog gmail send --to a@b.com --subject "Hi" --body "Hello"`
- **Send (HTML)**: `gog gmail send --to a@b.com --subject "Hi" --body-html "<p>Hello</p>"`
- **Draft**: `gog gmail drafts create --to a@b.com --subject "Hi" --body-file ./message.txt`

### Calendar
- **List events**: `gog calendar events <calendarId> --from <iso> --to <iso>`
- **Create event**: `gog calendar create <calendarId> --summary "Title" --from <iso> --to <iso>`
- **Colors**: `gog calendar colors` (IDs 1-11)

### Drive
- **Search**: `gog drive search "query" --max 10`

### Sheets
- **Get**: `gog sheets get <sheetId> "Tab!A1:D10" --json`
- **Update**: `gog sheets update <sheetId> "Tab!A1:B2" --values-json '[["A","B"],["1","2"]]' --input USER_ENTERED`
- **Append**: `gog sheets append <sheetId> "Tab!A:C" --values-json '[["x","y","z"]]' --insert INSERT_ROWS`

### Docs
- **Export**: `gog docs export <docId> --format txt --out /tmp/doc.txt`
- **Cat**: `gog docs cat <docId>`

## Tips
- Set `GOG_ACCOUNT=you@gmail.com` to avoid repeating `--account`.
- For scripting, prefer `--json` plus `--no-input`.
- Confirm before sending mail or creating events.
