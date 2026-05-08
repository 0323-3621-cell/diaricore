"""
export_onnx.py — Export DiariCore XLM-RoBERTa model to ONNX and upload to HuggingFace Hub.

Usage:
    python scripts/export_onnx.py [--quantize] [--no-upload] [--branch BRANCH]

Environment variables:
    HF_TOKEN       HuggingFace token with write access to the target repo (required for upload)
    HF_MODEL_ID    Target HF repo (default: sseia/diari-core-mood)

Requirements (install once in your venv):
    pip install onnx>=1.16.0 onnxruntime>=1.18.0 huggingface_hub>=0.22.0 transformers>=4.40.0 torch>=2.2.0
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# ── Repo roots ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
MODEL_DIR = REPO_ROOT / "model"

# ── Config ────────────────────────────────────────────────────────────────────
HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "sseia/diari-core-mood").strip()
HF_TOKEN = os.environ.get("HF_TOKEN", "").strip() or None

LABEL_ORDER = ["angry", "anxious", "happy", "neutral", "sad"]   # alphabetical = training order
MAX_LEN = 256
OPSET = 14

# ── CALIBRATION (must match ml-service/app.py exactly) ────────────────────────
CALIBRATION_THRESHOLDS = {
    "angry": 1.40,
    "sad": 1.30,
    "neutral": 1.35,
    "happy": 0.75,
    "anxious": 0.70,
}


# ─────────────────────────────────────────────────────────────────────────────
# Model definition — identical to ml-service/app.py
# ─────────────────────────────────────────────────────────────────────────────

class XLMRobertaMoodClassifier(nn.Module):
    """
    Wrapper that mirrors the architecture used during training.
    Keys in the saved state_dict are prefixed with `xlm_roberta.*`.
    """

    def __init__(self, num_classes: int = 5, dropout: float = 0.4):
        super().__init__()
        from transformers import AutoModelForSequenceClassification

        self.xlm_roberta = AutoModelForSequenceClassification.from_pretrained(
            "xlm-roberta-base",
            num_labels=num_classes,
            hidden_dropout_prob=0.1,
            attention_probs_dropout_prob=0.1,
            ignore_mismatched_sizes=True,
        )
        hidden_size = self.xlm_roberta.config.hidden_size
        self.xlm_roberta.classifier = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.LayerNorm(hidden_size // 2),
            nn.GELU(),
            nn.Dropout(dropout / 2),
            nn.Linear(hidden_size // 2, num_classes),
        )

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        outputs = self.xlm_roberta.roberta(input_ids=input_ids, attention_mask=attention_mask)
        cls_output = outputs.last_hidden_state[:, 0, :]
        return self.xlm_roberta.classifier(cls_output)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_checkpoint(ckpt_path: Path) -> dict:
    print(f"[export] Loading state dict from {ckpt_path} …")
    state = torch.load(str(ckpt_path), map_location="cpu")
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    return state


def _is_custom_checkpoint(state: dict) -> bool:
    return any(str(k).startswith("xlm_roberta.") for k in state)


def load_model(ckpt_path: Path) -> XLMRobertaMoodClassifier:
    state = _load_checkpoint(ckpt_path)

    if not _is_custom_checkpoint(state):
        raise RuntimeError(
            "Checkpoint does not have 'xlm_roberta.*' keys. "
            "This script only supports the custom training-class format."
        )

    model = XLMRobertaMoodClassifier(num_classes=5)
    missing, unexpected = model.load_state_dict(state, strict=False)
    print(f"[export] Loaded checkpoint — missing={len(missing)} unexpected={len(unexpected)}")
    if missing:
        print(f"         Missing keys (first 5): {missing[:5]}")
    if unexpected:
        print(f"         Unexpected keys (first 5): {unexpected[:5]}")

    model = model.to(dtype=torch.float32)
    model.eval()
    return model


def make_dummy_inputs(tokenizer, max_len: int = MAX_LEN):
    """Return a realistic tokenizer output as PyTorch tensors for a short sentence."""
    sample = "Today I feel really happy and excited about everything!"
    enc = tokenizer(
        sample,
        max_length=max_len,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )
    return enc["input_ids"], enc["attention_mask"]


# ─────────────────────────────────────────────────────────────────────────────
# ONNX Export
# ─────────────────────────────────────────────────────────────────────────────

def export_to_onnx(model: XLMRobertaMoodClassifier, tokenizer, output_path: Path) -> None:
    input_ids, attention_mask = make_dummy_inputs(tokenizer)

    print(f"[export] Exporting to ONNX (opset={OPSET}) → {output_path}")
    torch.onnx.export(
        model,
        args=(input_ids, attention_mask),
        f=str(output_path),
        opset_version=OPSET,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids":      {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits":         {0: "batch_size"},
        },
        do_constant_folding=True,
        export_params=True,
    )
    size_mb = output_path.stat().st_size / 1e6
    print(f"[export] ONNX file written — size={size_mb:.1f} MB")


# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_onnx(model: XLMRobertaMoodClassifier, tokenizer, onnx_path: Path, atol: float = 1e-4) -> None:
    """Run the same input through PyTorch and ONNX and assert logits match."""
    try:
        import onnxruntime as ort
    except ImportError:
        print("[validate] onnxruntime not installed — skipping validation.")
        return

    import onnx
    onnx.checker.check_model(str(onnx_path))
    print("[validate] ONNX model structure check passed ✓")

    input_ids, attention_mask = make_dummy_inputs(tokenizer)
    with torch.no_grad():
        torch_logits = model(input_ids, attention_mask).numpy()

    sess_options = ort.SessionOptions()
    sess_options.log_severity_level = 3
    sess = ort.InferenceSession(str(onnx_path), sess_options=sess_options)
    onnx_logits = sess.run(
        ["logits"],
        {
            "input_ids":      input_ids.numpy(),
            "attention_mask": attention_mask.numpy(),
        },
    )[0]

    max_diff = float(np.abs(torch_logits - onnx_logits).max())
    print(f"[validate] Max logit difference (PyTorch vs ONNX): {max_diff:.6f}")
    if max_diff > atol:
        raise ValueError(f"Validation FAILED — max diff {max_diff:.6f} exceeds atol {atol}")
    print(f"[validate] Output parity check passed ✓  (atol={atol})")

    # Show human-readable prediction for the sample sentence
    probs_onnx = F.softmax(torch.tensor(onnx_logits), dim=-1).numpy()[0]
    calib = [probs_onnx[i] * CALIBRATION_THRESHOLDS.get(LABEL_ORDER[i], 1.0) for i in range(5)]
    total = sum(calib) or 1.0
    calib = [v / total for v in calib]
    best_idx = int(np.argmax(calib))
    print(f"[validate] Sample prediction → '{LABEL_ORDER[best_idx]}' ({calib[best_idx]*100:.1f}%)")


# ─────────────────────────────────────────────────────────────────────────────
# INT8 Quantization (optional)
# ─────────────────────────────────────────────────────────────────────────────

def quantize_onnx(onnx_path: Path, output_path: Path) -> None:
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic
    except ImportError:
        print("[quantize] onnxruntime.quantization not available — skipping.")
        return

    print(f"[quantize] Running INT8 dynamic quantization → {output_path}")
    quantize_dynamic(
        model_input=str(onnx_path),
        model_output=str(output_path),
        weight_type=QuantType.QInt8,
    )
    size_mb = output_path.stat().st_size / 1e6
    print(f"[quantize] Quantized model written — size={size_mb:.1f} MB")


# ─────────────────────────────────────────────────────────────────────────────
# HuggingFace Hub Upload
# ─────────────────────────────────────────────────────────────────────────────

def upload_to_hub(
    model_dir: Path,
    onnx_path: Path,
    label_map_path: Path,
    repo_id: str,
    branch: str,
    token: Optional[str],
) -> None:
    try:
        from huggingface_hub import HfApi, create_repo
    except ImportError:
        print("[upload] huggingface_hub not installed — skipping upload.")
        return

    if not token:
        print("[upload] HF_TOKEN not set — skipping upload.")
        print("         Set HF_TOKEN env var and re-run to push to Hub.")
        return

    api = HfApi(token=token)

    # Ensure the repo exists (create_repo is idempotent if it already exists)
    try:
        create_repo(repo_id=repo_id, repo_type="model", exist_ok=True, token=token)
    except Exception as e:
        print(f"[upload] Note: create_repo returned: {e}")

    # Determine upload branch — if "main" use None (default), otherwise create branch
    upload_revision: Optional[str] = None
    if branch != "main":
        try:
            api.create_branch(repo_id=repo_id, branch=branch, exist_ok=True)
            upload_revision = branch
            print(f"[upload] Targeting branch '{branch}'")
        except Exception as e:
            print(f"[upload] Could not create branch '{branch}': {e} — uploading to main")

    def _upload(local: Path, remote: str, description: str):
        print(f"[upload] Uploading {description} → {repo_id}/{remote}")
        api.upload_file(
            path_or_fileobj=str(local),
            path_in_repo=remote,
            repo_id=repo_id,
            repo_type="model",
            revision=upload_revision,
            commit_message=f"Add {remote} via export_onnx.py",
        )

    # Upload ONNX model
    _upload(onnx_path, onnx_path.name, "ONNX model")

    # Upload updated config.json
    _upload(model_dir / "config.json", "config.json", "config.json")

    # Upload label_map.json
    _upload(label_map_path, "label_map.json", "label_map.json")

    # Upload tokenizer files
    tokenizer_files = [
        "tokenizer.json",
        "tokenizer_config.json",
        "sentencepiece.bpe.model",
        "special_tokens_map.json",
    ]
    for fname in tokenizer_files:
        src = model_dir / fname
        if src.exists():
            _upload(src, fname, fname)
        else:
            print(f"[upload] Skipping {fname} (not found locally)")

    print(f"\n[upload] ✅ Upload complete!")
    print(f"         View at: https://huggingface.co/{repo_id}" + (f"/tree/{branch}" if branch != "main" else ""))


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Export DiariCore XLM-RoBERTa to ONNX and push to HF Hub.")
    parser.add_argument("--quantize",    action="store_true", help="Also produce an INT8-quantized ONNX model and upload that instead.")
    parser.add_argument("--no-upload",  action="store_true", help="Export and validate only — skip HuggingFace upload.")
    parser.add_argument("--branch",     default="onnx",      help="HF repo branch to push to (default: 'onnx').")
    parser.add_argument("--model-dir",  default=str(MODEL_DIR), help="Path to local model directory.")
    parser.add_argument("--atol",       type=float, default=1e-4, help="Max allowed logit difference for validation.")
    args = parser.parse_args()

    model_dir = Path(args.model_dir).resolve()
    ckpt_path = model_dir / "pytorch_model.bin"

    if not ckpt_path.exists():
        print(f"[error] Checkpoint not found: {ckpt_path}", file=sys.stderr)
        sys.exit(1)

    # ── Imports that need to be present ──────────────────────────────────────
    try:
        from transformers import AutoTokenizer
    except ImportError:
        print("[error] transformers is not installed. Run: pip install transformers>=4.40.0", file=sys.stderr)
        sys.exit(1)

    # ── Tokenizer (load from local model dir) ────────────────────────────────
    print(f"[export] Loading tokenizer from {model_dir}")
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))

    # ── Model ────────────────────────────────────────────────────────────────
    model = load_model(ckpt_path)

    # ── Output directory (alongside model dir) ───────────────────────────────
    out_dir = model_dir / "onnx_export"
    out_dir.mkdir(parents=True, exist_ok=True)

    onnx_path = out_dir / "model.onnx"
    export_to_onnx(model, tokenizer, onnx_path)
    validate_onnx(model, tokenizer, onnx_path, atol=args.atol)

    # ── Optional quantization ────────────────────────────────────────────────
    upload_onnx_path = onnx_path
    if args.quantize:
        quant_path = out_dir / "model_quantized.onnx"
        quantize_onnx(onnx_path, quant_path)
        if quant_path.exists():
            upload_onnx_path = quant_path

    # ── label_map.json (used by ml-service to resolve labels at runtime) ─────
    label_map_path = out_dir / "label_map.json"
    with open(label_map_path, "w", encoding="utf-8") as f:
        json.dump({str(i): lbl for i, lbl in enumerate(LABEL_ORDER)}, f, indent=2)
    print(f"[export] label_map.json written → {label_map_path}")

    # ── Upload ────────────────────────────────────────────────────────────────
    if not args.no_upload:
        upload_to_hub(
            model_dir=model_dir,
            onnx_path=upload_onnx_path,
            label_map_path=label_map_path,
            repo_id=HF_MODEL_ID,
            branch=args.branch,
            token=HF_TOKEN,
        )
    else:
        print("\n[export] --no-upload specified. Files ready in:", out_dir)

    print("\n✅ Done.")


if __name__ == "__main__":
    main()
