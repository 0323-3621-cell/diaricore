# ML Setup — DiariCore

DiariCore uses **HuggingFace Inference API** for mood analysis.
The model (`sseia/diari-core-mood`) is hosted on HuggingFace Hub as an ONNX file,
so **no ML service runs on Railway** — only the lightweight web app does.

## Architecture

```
User writes entry
      │
      ▼
Railway Web App (app.py)   ← only service on Railway free tier
      │  uses hf_nlp.py
      ▼
HuggingFace Inference API  ← free, serverless, ONNX-backed
(sseia/diari-core-mood)
      │
      ▼
Returns: emotionLabel, emotionScore, sentimentLabel, sentimentScore
```

## Railway Environment Variables (web service only)

| Variable        | Value                          | Required |
|-----------------|--------------------------------|----------|
| `HF_API_TOKEN`  | Your HuggingFace read token    | Yes (model may be private) |
| `HF_EMOTION_MODEL` | `sseia/diari-core-mood`     | Optional (this is the default) |
| `DATABASE_URL`  | Postgres connection string     | Yes (Railway Postgres plugin) |
| `SECRET_KEY`    | Flask session secret           | Yes |

## Uploading the ONNX model to HuggingFace Hub

Run this **once** from your local machine after training a new model:

```powershell
# Install export deps (one-time)
.venv\Scripts\pip install "onnx>=1.16.0" "onnxruntime>=1.18.0" "huggingface_hub>=0.22.0"

# Export + validate + upload (needs HF token with write access)
$env:HF_TOKEN = "hf_your_write_token_here"
.venv\Scripts\python.exe scripts/export_onnx.py

# Optional: also produce an INT8-quantized version (~70% smaller)
.venv\Scripts\python.exe scripts/export_onnx.py --quantize

# Push to main branch instead of the default 'onnx' branch
.venv\Scripts\python.exe scripts/export_onnx.py --branch main
```

The script:
1. Loads `model/pytorch_model.bin` using the custom training class
2. Exports to ONNX (opset 14, dynamic axes)
3. Validates PyTorch vs ONNX output parity
4. Uploads `model.onnx`, `config.json`, `label_map.json`, and tokenizer files to HF Hub

## Local Development

For local development, `hf_nlp.py` falls back gracefully if `HF_API_TOKEN` is not set
(uses a keyword-based heuristic). Set it in a `.env`-style approach:

```powershell
$env:HF_API_TOKEN = "hf_your_read_token_here"
.venv\Scripts\python.exe app.py
```

## Notes

- Do **not** commit `HF_API_TOKEN` or any secrets. Use Railway environment variables.
- The `ml-service/` folder is kept for reference / local heavy testing only.
  It is **not deployed** to Railway.
- `ml_client.py` is also kept for reference but is **no longer used** by `app.py`.
