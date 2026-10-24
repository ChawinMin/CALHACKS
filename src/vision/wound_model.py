"""Wound-type classifier trained on dataset/Wound_dataset.

Frozen ImageNet ResNet18 features + a linear head. Because the head sits on a
global-average-pooled feature map, applying it to each spatial cell gives a
class activation map (CAM), which we use to place a box on the wound.

    python -m src.vision.wound_model train     # fit and write models/wound_head.pt
    python -m src.vision.wound_model predict path/to/image.jpg
"""
import io
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "dataset" / "Wound_dataset"
MODEL_PATH = Path(__file__).resolve().parent / "models" / "wound_head.pt"

# Classes whose first aid is the bleeding-control flow in protocols/severe_bleeding.json.
BLEEDING = {"Cut", "Laceration", "Stab_wound"}
SIZE = 320

_norm = transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
_to_tensor = transforms.Compose([transforms.Resize((SIZE, SIZE)), transforms.ToTensor(), _norm])


def _backbone():
    net = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
    return nn.Sequential(*list(net.children())[:-2]).eval()  # -> (B, 512, h, w)


@torch.no_grad()
def _features(backbone, imgs):
    return backbone(torch.stack([_to_tensor(i) for i in imgs]))


def _augment(img):
    return [img, img.transpose(Image.FLIP_LEFT_RIGHT), img.transpose(Image.FLIP_TOP_BOTTOM)]


def train():
    from sklearn.model_selection import train_test_split

    classes = sorted(p.name for p in DATA.iterdir() if p.is_dir())
    paths, labels = [], []
    for i, c in enumerate(classes):
        for f in sorted((DATA / c).glob("*")):
            if f.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                paths.append(f)
                labels.append(i)
    tr_p, te_p, tr_y, te_y = train_test_split(paths, labels, test_size=0.2, stratify=labels, random_state=0)

    bb = _backbone()

    def pooled(ps, ys, aug):
        X, Y = [], []
        for p, y in zip(ps, ys):
            im = Image.open(p).convert("RGB")
            for v in (_augment(im) if aug else [im]):
                X.append(_features(bb, [v]).mean((2, 3))[0])
                Y.append(y)
        return torch.stack(X), torch.tensor(Y)

    print(f"{len(paths)} images, classes: {classes}")
    Xtr, Ytr = pooled(tr_p, tr_y, True)
    Xte, Yte = pooled(te_p, te_y, False)

    counts = torch.bincount(Ytr, minlength=len(classes)).float()
    head = nn.Linear(512, len(classes))
    opt = torch.optim.AdamW(head.parameters(), lr=3e-3, weight_decay=1e-2)
    lossf = nn.CrossEntropyLoss(weight=counts.sum() / counts / len(classes))  # classes are imbalanced
    torch.manual_seed(0)
    for _ in range(400):
        opt.zero_grad()
        lossf(head(Xtr), Ytr).backward()
        opt.step()

    pred = head(Xte).argmax(1)
    print(f"held-out accuracy: {(pred == Yte).float().mean():.3f} on {len(Yte)} images")
    bleed = torch.tensor([c in BLEEDING for c in classes])
    print(f"bleeding-vs-not accuracy: {(bleed[pred] == bleed[Yte]).float().mean():.3f}")
    for i, c in enumerate(classes):
        m = Yte == i
        print(f"  {c:14s} {(pred[m] == i).float().mean():.2f}  (n={int(m.sum())})")

    # Refit on everything for the shipped head.
    Xall, Yall = pooled(paths, labels, True)
    counts = torch.bincount(Yall, minlength=len(classes)).float()
    head = nn.Linear(512, len(classes))
    opt = torch.optim.AdamW(head.parameters(), lr=3e-3, weight_decay=1e-2)
    lossf = nn.CrossEntropyLoss(weight=counts.sum() / counts / len(classes))
    for _ in range(400):
        opt.zero_grad()
        lossf(head(Xall), Yall).backward()
        opt.step()
    MODEL_PATH.parent.mkdir(exist_ok=True)
    torch.save({"head": head.state_dict(), "classes": classes}, MODEL_PATH)
    print("saved", MODEL_PATH)


class WoundClassifier:
    def __init__(self):
        ck = torch.load(MODEL_PATH, map_location="cpu")
        self.classes = ck["classes"]
        self.head = nn.Linear(512, len(self.classes))
        self.head.load_state_dict(ck["head"])
        self.backbone = _backbone()

    @torch.no_grad()
    def predict(self, img: Image.Image):
        img = img.convert("RGB")
        f = _features(self.backbone, [img])[0]  # (512, h, w)
        logits = self.head(f.mean((1, 2)))
        probs = torch.softmax(logits, 0)
        k = int(probs.argmax())
        # CAM: the linear head applied per cell, minus the other classes' mean.
        cam = torch.einsum("c,chw->hw", self.head.weight[k] - self.head.weight.mean(0), f)
        cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-6)
        ys, xs = torch.where(cam >= 0.6)
        h, w = cam.shape
        box = [float(xs.min()) / w, float(ys.min()) / h,
               float(xs.max() + 1 - xs.min()) / w, float(ys.max() + 1 - ys.min()) / h]
        label = self.classes[k]
        return {
            "label": label,
            "confidence": float(probs[k]),
            "bleeding": label in BLEEDING,
            "box": box,
            "probs": {c: round(float(p), 4) for c, p in zip(self.classes, probs)},
        }

    def predict_bytes(self, data: bytes):
        return self.predict(Image.open(io.BytesIO(data)))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "train":
        train()
    elif len(sys.argv) > 2 and sys.argv[1] == "predict":
        print(WoundClassifier().predict(Image.open(sys.argv[2])))
    else:
        print(__doc__)
