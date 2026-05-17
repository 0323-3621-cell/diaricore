"""Bake static/img/BOOK.json: remove AE expressions so lottie-web can render it."""
import json
from pathlib import Path

SRC = Path("static/img/BOOK.json.bak")
if not SRC.exists():
    SRC = Path("static/img/BOOK.json")
OUT = Path("static/img/BOOK.json")
BACKUP = Path("static/img/BOOK.json.bak")


def strip_expressions(obj):
    if isinstance(obj, dict):
        if "x" in obj and isinstance(obj.get("x"), str) and ("var " in obj["x"] or "$bm" in obj["x"]):
            del obj["x"]
        for v in obj.values():
            strip_expressions(v)
    elif isinstance(obj, list):
        for item in obj:
            strip_expressions(item)


def set_layer_opacity(layer, value):
    ks = layer.setdefault("ks", {})
    ks["o"] = {"a": 0, "k": value, "ix": 11}


def bake_root_layers(d):
    for layer in d.get("layers", []):
        nm = (layer.get("nm") or "").lower()
        if layer.get("ty") == 4:
            if "morph" in nm:
                set_layer_opacity(layer, 100)
            elif "hover" in nm or "loop" in nm:
                set_layer_opacity(layer, 0)
            elif "watermark" in nm:
                set_layer_opacity(layer, 0)


def add_open_opacity_keyframes(d, open_start=6, open_end=42):
    morph = hover = None
    for layer in d.get("layers", []):
        nm = (layer.get("nm") or "").lower()
        if "morph" in nm and layer.get("ty") == 0:
            morph = layer
        elif "hover" in nm and layer.get("ty") == 0:
            hover = layer

    if morph:
        morph.setdefault("ks", {})["o"] = {
            "a": 1,
            "k": [
                {"t": 0, "s": [100]},
                {"t": open_start, "s": [100]},
                {"t": open_start + 3, "s": [0]},
                {"t": open_end, "s": [0]},
            ],
            "ix": 11,
        }
    if hover:
        hover.setdefault("ks", {})["o"] = {
            "a": 1,
            "k": [
                {"t": 0, "s": [0]},
                {"t": open_start + 2, "s": [0]},
                {"t": open_start + 6, "s": [100]},
                {"t": open_end, "s": [100]},
            ],
            "ix": 11,
        }


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    if not BACKUP.exists():
        BACKUP.write_text(json.dumps(data), encoding="utf-8")
    strip_expressions(data)
    bake_root_layers(data)
    add_open_opacity_keyframes(data)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    remaining = OUT.read_text(encoding="utf-8").count("$bm")
    print("Baked", OUT, "bytes", OUT.stat().st_size, "expr remnants", remaining)


if __name__ == "__main__":
    main()
