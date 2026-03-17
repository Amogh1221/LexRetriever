"""
build_pinecone_judgements.py
Rebuilds the judgements vector DB in Pinecone using bge-small-en-v1.5 (384 dims).

Before running:
1. pip install pinecone-client sentence-transformers tqdm pymupdf torch
2. Create a Pinecone index named 'legal-judgements' with dimension=384, metric=cosine
   OR let this script create it automatically (serverless).
3. Set your PINECONE_API_KEY below.

Run with: python build_pinecone_judgements.py
"""

import os
import zipfile
import time
from pathlib import Path
from tqdm import tqdm
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
import torch

# ── Configuration ─────────────────────────────────────────────────────────────
PINECONE_API_KEY  = "pcsk_3xZm5c_FcWbAXNUTzNUgMzimd1aQ2FHk9dbp8idGoWH429FGFFMwwu6KppRPd4bp6NdGek"   # ← paste your key
PINECONE_INDEX    = "legal-judgements"
PINECONE_CLOUD    = "aws"
PINECONE_REGION   = "us-east-1"

ZIP_PATH          = "./Judgements.zip"
EXTRACT_DIR       = "./judgements_extracted"
LOCAL_MODEL_DIR   = "./models/bge-small"
EMBED_MODEL_NAME  = "BAAI/bge-small-en-v1.5"
DEVICE            = "cuda" if torch.cuda.is_available() else "cpu"
UPSERT_BATCH      = 100
BGE_PREFIX        = "Represent this sentence for searching relevant passages: "
# ─────────────────────────────────────────────────────────────────────────────


def load_model() -> SentenceTransformer:
    local = Path(LOCAL_MODEL_DIR)
    if local.exists() and any(local.iterdir()):
        print(f"✅ Loading bge-small from '{LOCAL_MODEL_DIR}'")
    else:
        print(f"📥 Downloading {EMBED_MODEL_NAME} (~130 MB)…")
        local.mkdir(parents=True, exist_ok=True)
        m = SentenceTransformer(EMBED_MODEL_NAME)
        m.save(str(local))
        print(f"✅ Saved to '{LOCAL_MODEL_DIR}'")
    model = SentenceTransformer(str(local))
    model = model.to(DEVICE)
    print(f"   Device: {DEVICE} | Dim: {model.get_sentence_embedding_dimension()}")
    return model


def extract_zip():
    if Path(EXTRACT_DIR).exists():
        print(f"📂 '{EXTRACT_DIR}' already exists — skipping extraction.")
        return
    print(f"📦 Extracting {ZIP_PATH}…")
    Path(EXTRACT_DIR).mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH, 'r') as z:
        z.extractall(EXTRACT_DIR)
    print("✅ Extraction complete.")


def find_pdfs() -> list[Path]:
    root = Path(EXTRACT_DIR)
    pdfs = list({p.resolve(): p for p in
                 list(root.rglob("*.pdf")) + list(root.rglob("*.PDF"))}.values())
    pdfs = sorted(pdfs)
    print(f"📄 Found {len(pdfs)} PDF files.")
    return pdfs


def extract_text(pdf_path: Path) -> str:
    try:
        import fitz
        doc  = fitz.open(str(pdf_path))
        text = "\n\n".join(p.get_text() for p in doc).strip()
        doc.close()
        return text
    except Exception as e:
        print(f"  ⚠️  {pdf_path.name}: {e}")
        return ""


def get_year(pdf_path: Path) -> str:
    for part in pdf_path.parts:
        if part.isdigit() and len(part) == 4:
            return part
    return "unknown"


def connect_pinecone():
    print("🔌 Connecting to Pinecone…")
    pc = Pinecone(api_key=PINECONE_API_KEY)
    existing = [i.name for i in pc.list_indexes()]
    if PINECONE_INDEX not in existing:
        print(f"   Index '{PINECONE_INDEX}' not found — creating it…")
        pc.create_index(
            name=PINECONE_INDEX,
            dimension=384,
            metric="cosine",
            spec=ServerlessSpec(cloud=PINECONE_CLOUD, region=PINECONE_REGION)
        )
        while not pc.describe_index(PINECONE_INDEX).status['ready']:
            print("   Waiting for index to be ready…")
            time.sleep(3)
        print(f"   ✅ Index '{PINECONE_INDEX}' created.")
    index = pc.Index(PINECONE_INDEX)
    stats = index.describe_index_stats()
    print(f"✅ Connected | Existing vectors: {stats.total_vector_count}")
    return index


def build(resume_from: int = 0):
    print("=" * 70)
    print("  JUDGEMENTS → PINECONE  (bge-small-en-v1.5 · 384 dims)")
    print(f"  Device : {DEVICE}")
    print("=" * 70)

    model = load_model()
    extract_zip()
    pdfs  = find_pdfs()
    if not pdfs:
        print("❌ No PDFs found. Check ZIP_PATH.")
        return

    index = connect_pinecone()

    to_process = pdfs[resume_from:]
    print(f"\n📥 Processing {len(to_process)} PDFs from index #{resume_from}…")

    buf    = []
    failed = []

    for i, pdf_path in enumerate(tqdm(to_process, desc="Embedding & uploading")):
        gidx = resume_from + i
        text = extract_text(pdf_path)
        if not text.strip():
            continue

        try:
            emb = model.encode(
                BGE_PREFIX + text[:3000],
                normalize_embeddings=True,
                device=DEVICE
            ).tolist()
        except Exception as e:
            print(f"\n  ⚠️  Embed failed #{gidx} ({pdf_path.name}): {e}")
            failed.append(gidx)
            continue

        buf.append({
            "id":     f"j_{gidx}",
            "values": emb,
            "metadata": {
                "file_name": pdf_path.stem,
                "year":      get_year(pdf_path),
                "source":    str(pdf_path),
                "content":   text[:8000],   # stored for retrieval display
            }
        })

        if len(buf) >= UPSERT_BATCH:
            try:
                index.upsert(vectors=buf)
                buf = []
            except Exception as e:
                print(f"\n  ⚠️  Upsert failed near #{gidx}: {e}")
                failed.append(gidx)
                buf = []

    # Flush remainder
    if buf:
        try:
            index.upsert(vectors=buf)
        except Exception as e:
            print(f"\n  ⚠️  Final upsert failed: {e}")

    stats = index.describe_index_stats()
    print(f"\n{'=' * 70}")
    print(f"  ✅ DONE  |  Pinecone vectors: {stats.total_vector_count}")
    if failed:
        print(f"  ⚠️  {len(failed)} failed. Resume with: build(resume_from={failed[0]})")
    print(f"  Index  : {PINECONE_INDEX}")
    print(f"  Model  : {EMBED_MODEL_NAME}")
    print("=" * 70)


if __name__ == "__main__":
    # If a previous run failed at e.g. doc #5000, set resume_from=5000
    build(resume_from=0)
