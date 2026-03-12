# AGENTS.md

## Push Workflow Rule (Persistent)

Always push automatically after every change. Do NOT wait for the user to write `push`.

## Standard Paths

- Source working files (OneDrive):
  - C:\Users\Jean BARIAL\OneDrive - Eduprovence\Documents\Serveur-site internet\CyberSecuriter\Serveur minecraft\Bloc-Coin\site
- Clean git clone (push target):
  - C:\dev\bloccoin-fix

## Required Push Procedure

1. Copy changed files from source folder to clean clone (at minimum `auth.js` and/or `index.html`, depending on what changed).
2. `cd` to `C:\dev\bloccoin-fix`.
3. Run:
   - `git add <changed files>`
   - `git commit -m "<message>"`
   - `git push origin main`
4. Report commit hash and push result.

## Notes

- If there is nothing to commit, report it clearly (do not claim push happened).
- Never run destructive git commands.
- Prefer this copy-then-push workflow to avoid OneDrive git lock issues.
