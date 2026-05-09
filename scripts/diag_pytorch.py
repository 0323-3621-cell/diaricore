import torch, torch.nn.functional as F, sys, warnings
warnings.filterwarnings('ignore')

from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch.nn as nn

class XLMRobertaMoodClassifier(nn.Module):
    def __init__(self, num_classes=5, dropout=0.4):
        super().__init__()
        self.xlm_roberta = AutoModelForSequenceClassification.from_pretrained(
            'xlm-roberta-base', num_labels=num_classes,
            hidden_dropout_prob=0.1, attention_probs_dropout_prob=0.1,
            ignore_mismatched_sizes=True)
        h = self.xlm_roberta.config.hidden_size
        self.xlm_roberta.classifier = nn.Sequential(
            nn.Dropout(dropout), nn.Linear(h, h//2),
            nn.LayerNorm(h//2), nn.GELU(),
            nn.Dropout(dropout/2), nn.Linear(h//2, num_classes))
    def forward(self, input_ids, attention_mask):
        out = self.xlm_roberta.roberta(input_ids=input_ids, attention_mask=attention_mask)
        return self.xlm_roberta.classifier(out.last_hidden_state[:, 0, :])

print('Loading model...')
state = torch.load('model/pytorch_model.bin', map_location='cpu')
if 'model_state_dict' in state:
    state = state['model_state_dict']
if isinstance(state, dict):
    print('Keys sample:', list(state.keys())[:5])

model = XLMRobertaMoodClassifier()
missing, unexpected = model.load_state_dict(state, strict=False)
print(f'missing={len(missing)} unexpected={len(unexpected)}')
if missing: print('Missing (first 5):', missing[:5])
model.eval()

tokenizer = AutoTokenizer.from_pretrained('model/')

text = 'Kanina last 250 ko na lang ang kinashoud. Subrang guilty siya at iyak siya ng iyak nalinis ako pero di na ko siya binungangaan umupo na lang ako at nag ikot. habang nag iikot ano mabibili ko for money napulot ko kontil ko ng bigas para hang gusto ko para so santi ko at mga anak ko pero napaka matas ko Araw araw na lang survival mood.'

enc = tokenizer(text, add_special_tokens=True, max_length=256,
                padding='max_length', truncation=True, return_tensors='pt')

with torch.no_grad():
    logits = model(enc['input_ids'], enc['attention_mask'])
    probs = F.softmax(logits, dim=1).numpy()[0]

LABELS = ['angry', 'anxious', 'happy', 'neutral', 'sad']
THRESHOLDS = {'angry':1.40,'sad':1.30,'neutral':1.35,'happy':0.75,'anxious':0.70}

print('\n--- RAW probs (local PyTorch) ---')
for i, lbl in enumerate(LABELS):
    print(f'  {lbl:10} {probs[i]*100:.2f}%')

import numpy as np
cal = probs.copy()
for i, lbl in enumerate(LABELS):
    cal[i] *= THRESHOLDS[lbl]
cal = cal / cal.sum()

print('\n--- CALIBRATED probs (local PyTorch) ---')
for i, lbl in enumerate(LABELS):
    print(f'  {lbl:10} {cal[i]*100:.2f}%')

print('\nConclusion: If local PyTorch ~= ONNX (both ~93% sad), the Colab is using a DIFFERENT model.')
print('If local PyTorch ~= Colab (47.9%/45.2%), there is an ONNX export bug.')
