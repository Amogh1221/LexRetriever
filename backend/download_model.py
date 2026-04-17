from sentence_transformers import SentenceTransformer
import os

model_name = "BAAI/bge-small-en-v1.5"
save_path = "./models/bge-small"

print(f"Pre-downloading {model_name}...")
model = SentenceTransformer(model_name)
model.save(save_path)
print(f"Model saved to {save_path}")
