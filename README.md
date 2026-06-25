# הכספת — The Vault

## Live URL
https://iliahashamen.github.io/silver-vault/

## Admin panel (content control)
https://iliahashamen.github.io/silver-vault/admin.html

Two-step login:
1. Enter the **access code** (set in Railway as `ADMIN_PASSCODE`).
2. Answer the prompt **"all gatos blackos?"** with the secret pass-phrase.

The panel manages all content (no hardcoding):
- **מדריכים** — guide chapters (icon, order, 3 languages).
- **חידון** — trivia questions (4 answers, mark the correct one).
- **מוזיאון** — mint museum data (edited as JSON).

Each section has a one-time **"⬇ טען מובנה"** button that loads the current built-in
content into the editor; review it and press **שמור הכל** to publish it to the store.
After that, the app reads everything from the store; the built-in copies remain only
as an offline fallback.
