# Local Development (Web + ML + DB)

This setup lets you run DiariCore mostly on your local machine to save Railway credits, while keeping deployment compatibility.

## What runs locally

- **Web app**: `app.py` on `http://127.0.0.1:5000`
- **ML service**: `ml-service/app.py` on `http://127.0.0.1:5001`
- **Database**: local SQLite file (`diaricore.local.db`)

Production still works the same:
- Railway uses `DATABASE_URL` (Postgres)
- Railway web uses `ML_API_URL` that points to deployed ML service

## One-command start (Windows PowerShell)

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

This opens two terminals:
1. ML service terminal
2. Web app terminal

## Optional script arguments

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1 -WebPort 5000 -MlPort 5001 -DatabasePath diaricore.local.db -ModelId sseia/diari-core-mood
```

## Environment notes

- If the HF model is private, set `HF_TOKEN` in the ML terminal before starting it.
- Local web terminal sets:
  - `ML_API_URL=http://127.0.0.1:5001/predict`
  - `DATABASE_PATH=diaricore.local.db`
- Local DB defaults to SQLite because `DATABASE_URL` is not set.

## Quick verification

1. Open `http://127.0.0.1:5001/health` and confirm ML is up.
2. Open `http://127.0.0.1:5000/api/health` and confirm web is up.
3. Save a journal entry in local UI and confirm mood analysis appears.

## Keep local and deployed behavior aligned

- Keep all code changes committed normally.
- Test major changes locally first.
- Before demos, redeploy and run a short smoke test on Railway.
