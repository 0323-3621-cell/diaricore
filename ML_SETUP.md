# ML Service Setup (Current)

DiariCore now uses a dedicated Flask ML service (`ml-service/app.py`) that loads your custom model from Hugging Face Hub.

## Deployment mode (Railway)

Set these in the **ML service**:

- `HF_MODEL_ID` (example: `sseia/diari-core-mood`)
- `HF_TOKEN` (required only if model is private)

Set this in the **web service**:

- `ML_API_URL=https://<your-ml-service-domain>/predict`

Database mode:
- `DATABASE_URL` set -> Postgres
- `DATABASE_URL` missing -> SQLite

## Local mode

Use `LOCAL_DEV.md` and `scripts/start-local.ps1` to run web + ML locally with:

- `ML_API_URL=http://127.0.0.1:5001/predict`
- SQLite local DB file (default `diaricore.local.db`)

## Notes

- Do not commit secrets/tokens.
- Keep `HF_TOKEN` only in environment variables.

