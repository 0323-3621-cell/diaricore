"""Bake static/img/BOOK.json: remove AE expressions and apply static colors for lottie-web."""
import json
from pathlib import Path

SRC = Path("static/img/BOOK.json.bak")
if not SRC.exists():
    SRC = Path("static/img/BOOK.json")
OUT = Path("static/img/BOOK.json")
BACKUP = Path("static/img/BOOK.json.bak")

# From "Color & Stroke Change" effect in source file (RGB 0–1).
PRIMARY_RGB = [0.031, 0.659, 0.541]
SECONDARY_RGB = [0.071, 0.075, 0.192]
FILL_RGB = [1, 1, 1]


def strip_expressions(obj):
    if isinstance(obj, dict):
        if "x" in obj and isinstance(obj.get("x"), str) and ("var " in obj["x"] or "$bm" in obj["x"]):
            parent_ty = obj.get("ty")
            del obj["x"]
            if parent_ty == "st" and "c" in obj and not isinstance(obj["c"].get("k"), list):
                obj["c"] = {"a": 0, "k": PRIMARY_RGB, "ix": 3}
            elif parent_ty == "fl" and "c" in obj and not isinstance(obj["c"].get("k"), list):
                obj["c"] = {"a": 0, "k": FILL_RGB, "ix": 4}
        for v in obj.values():
            strip_expressions(v)
    elif isinstance(obj, list):
        for item in obj:
            strip_expressions(item)


def bake_paint_colors(obj):
    """After stripping expressions, ensure strokes/fills have static colors."""
    if isinstance(obj, dict):
        ty = obj.get("ty")
        if ty == "st" and "c" in obj:
            k = obj["c"].get("k") if isinstance(obj.get("c"), dict) else None
            if not isinstance(k, list) or len(k) < 3:
                obj["c"] = {"a": 0, "k": PRIMARY_RGB, "ix": obj["c"].get("ix", 3) if isinstance(obj.get("c"), dict) else 3}
        elif ty == "fl" and "c" in obj:
            k = obj["c"].get("k") if isinstance(obj.get("c"), dict) else None
            if not isinstance(k, list) or len(k) < 3:
                obj["c"] = {"a": 0, "k": FILL_RGB, "ix": obj["c"].get("ix", 4) if isinstance(obj.get("c"), dict) else 4}
        for v in obj.values():
            bake_paint_colors(v)
    elif isinstance(obj, list):
        for item in obj:
            bake_paint_colors(item)


def bake_layer_opacity(obj):
    """Layer opacity: expression-only or empty -> 100 after strip."""
    if isinstance(obj, dict):
        if obj.get("ty") in (0, 4) and "ks" in obj and isinstance(obj["ks"], dict):
            o = obj["ks"].get("o")
            if isinstance(o, dict):
                if "x" in o:
                    del o["x"]
                if "k" not in o:
                    obj["ks"]["o"] = {"a": 0, "k": 100, "ix": 11}
        for v in obj.values():
            bake_layer_opacity(v)
    elif isinstance(obj, list):
        for item in obj:
            bake_layer_opacity(item)


def bake_shape_opacity(obj):
    """Shape fill/stroke paint opacity without static k -> 100."""
    if isinstance(obj, dict):
        ty = obj.get("ty")
        if ty in ("fl", "st") and "o" in obj:
            po = obj["o"]
            if isinstance(po, dict):
                if "x" in po:
                    del po["x"]
                if "k" not in po:
                    po["a"] = 0
                    po["k"] = 100
                    po.setdefault("ix", 4 if ty == "fl" else 4)
        for v in obj.values():
            bake_shape_opacity(v)
    elif isinstance(obj, list):
        for item in obj:
            bake_shape_opacity(item)


def set_layer_opacity(layer, value):
    ks = layer.setdefault("ks", {})
    ks["o"] = {"a": 0, "k": value, "ix": 11}


def bake_root_layers(d):
    for layer in d.get("layers", []):
        nm = (layer.get("nm") or "").lower()
        if layer.get("ty") == 4 and "watermark" in nm:
            set_layer_opacity(layer, 0)


def bake_stroke_widths(obj, stroke_slider=70):
    """Keep static width when removing AE width expressions (w = value/70 * slider)."""
    if isinstance(obj, dict):
        if obj.get("ty") == "st" and "w" in obj:
            w = obj["w"]
            if isinstance(w, dict) and "x" in w:
                k = w.get("k", 0)
                try:
                    baked = float(k)
                except (TypeError, ValueError):
                    baked = 12.6
                if stroke_slider:
                    baked = baked / float(stroke_slider) * float(stroke_slider)
                obj["w"] = {"a": 0, "k": baked, "ix": w.get("ix", 5)}
        for v in obj.values():
            bake_stroke_widths(v, stroke_slider)
    elif isinstance(obj, list):
        for item in obj:
            bake_stroke_widths(item, stroke_slider)


def add_open_opacity_keyframes(d):
    """
    Match source AE sliders at rest: State-Morph=1, State-Hover=0, State-Loop=0.
    The opening animation lives entirely in morph-1; hover/loop are alternate states.
    """
    for layer in d.get("layers", []):
        nm = (layer.get("nm") or "").lower()
        if layer.get("ty") != 0:
            continue
        if "morph" in nm:
            set_layer_opacity(layer, 100)
        elif "hover" in nm or "loop" in nm:
            set_layer_opacity(layer, 0)


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    if not BACKUP.exists():
        BACKUP.write_text(json.dumps(data), encoding="utf-8")
    bake_stroke_widths(data)
    strip_expressions(data)
    bake_paint_colors(data)
    bake_layer_opacity(data)
    bake_shape_opacity(data)
    bake_root_layers(data)
    add_open_opacity_keyframes(data)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    remaining = OUT.read_text(encoding="utf-8").count("$bm")
    print("Baked", OUT, "bytes", OUT.stat().st_size, "expr remnants", remaining)


if __name__ == "__main__":
    main()
