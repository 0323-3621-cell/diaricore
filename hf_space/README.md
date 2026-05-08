---
title: DiariCore Inference
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: true
license: mit
---

# DiariCore Mood Inference API

FastAPI inference server for DiariCore XLM-RoBERTa mood classification.
Serves the ONNX model and exposes a `/predict` REST endpoint.

## Endpoint

`POST /predict`  
Body: `{"text": "your diary entry"}`  
Returns: `{"emotionLabel", "emotionScore", "sentimentLabel", "sentimentScore", "all_probs", "engine"}`
