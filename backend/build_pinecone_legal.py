"""
build_pinecone_legal.py
Builds the legal framework vector DB in Pinecone using bge-small-en-v1.5 (384 dims).
Sources: constitution_qa.json, ipc_sections.csv, bsa_sections.csv, crpc_sections.csv

Before running:
1. pip install pinecone-client sentence-transformers tqdm torch
2. Place all 4 source files in ./constitution/ folder
3. Set your PINECONE_API_KEY below

Run with: python build_pinecone_legal.py
"""

import os
import csv
import json
import time
from pathlib import Path
from tqdm import tqdm
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
import torch

# ── Configuration ─────────────────────────────────────────────────────────────
PINECONE_API_KEY  = "pcsk_3xZm5c_FcWbAXNUTzNUgMzimd1aQ2FHk9dbp8idGoWH429FGFFMwwu6KppRPd4bp6NdGek"   # ← paste your key
PINECONE_INDEX    = "legal-framework"
PINECONE_CLOUD    = "aws"
PINECONE_REGION   = "us-east-1"

CONSTITUTION_DIR  = "./constitution"
LOCAL_MODEL_DIR   = "./models/bge-small"            # shared with judgements builder
EMBED_MODEL_NAME  = "BAAI/bge-small-en-v1.5"
DEVICE            = "cuda" if torch.cuda.is_available() else "cpu"
UPSERT_BATCH      = 100
BGE_PREFIX        = "Represent this sentence for searching relevant passages: "

# File names inside CONSTITUTION_DIR
CONSTITUTION_FILE = "constitution_qa.json"
IPC_FILE          = "ipc_sections.csv"
BSA_FILE          = "bsa_sections.csv"
CRPC_FILE         = "crpc_sections.csv"
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


# ── Document loaders ──────────────────────────────────────────────────────────

def load_constitution(base: Path) -> list[dict]:
    path = base / CONSTITUTION_FILE
    if not path.exists():
        print(f"⚠️  Not found: {path}"); return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    docs = []
    for i, item in enumerate(data):
        q = item.get("question", "").strip()
        a = item.get("answer", "").strip()
        if not a:
            continue
        docs.append({
            "id":      f"const_{i}",
            "text":    f"Q: {q}\nA: {a}" if q else a,
            "source":  "Indian Constitution",
            "type":    "constitution_qa",
            "section": "",
        })
    print(f"   📜 Constitution: {len(docs)} Q&A pairs")
    return docs


def load_ipc(base: Path) -> list[dict]:
    path = base / IPC_FILE
    if not path.exists():
        print(f"⚠️  Not found: {path}"); return []
    docs = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for i, row in enumerate(csv.DictReader(f)):
            sec   = row.get("Section", "").strip()
            desc  = row.get("Description", "").strip()
            off   = row.get("Offense", "").strip()
            pun   = row.get("Punishment", "").strip()
            if not desc:
                continue
            docs.append({
                "id":      f"ipc_{i}",
                "text":    f"Section: {sec}\nOffense: {off}\nPunishment: {pun}\n\n{desc}",
                "source":  "Indian Penal Code",
                "type":    "ipc_section",
                "section": sec,
            })
    print(f"   ⚖️  IPC: {len(docs)} sections")
    return docs


def load_generic_csv(base: Path, filename: str, source_name: str, id_prefix: str) -> list[dict]:
    path = base / filename
    if not path.exists():
        print(f"⚠️  Not found: {path}"); return []
    docs = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for i, row in enumerate(csv.DictReader(f)):
            sec      = str(row.get("Section", "")).strip()
            sec_name = row.get("Section _name", row.get("Section_name", "")).strip()
            chap     = row.get("Chapter_name", "").strip()
            desc     = row.get("Description", "").strip()
            if not desc:
                continue
            docs.append({
                "id":      f"{id_prefix}_{i}",
                "text":    f"Act: {source_name}\nChapter: {chap}\nSection {sec}: {sec_name}\n\n{desc}",
                "source":  source_name,
                "type":    f"{id_prefix}_section",
                "section": sec,
            })
    print(f"   📋 {source_name}: {len(docs)} sections")
    return docs


def load_all_docs() -> list[dict]:
    base = Path(CONSTITUTION_DIR)
    if not base.exists():
        raise FileNotFoundError(f"Constitution folder not found: '{CONSTITUTION_DIR}'")
    all_docs = []
    all_docs += load_constitution(base)
    all_docs += load_ipc(base)
    all_docs += load_generic_csv(base, BSA_FILE,  "Bharatiya Sakshya Adhiniyam 2023", "bsa")
    all_docs += load_generic_csv(base, CRPC_FILE, "Code of Criminal Procedure 1973",  "crpc")
    print(f"\n   Total: {len(all_docs)} documents")
    return all_docs


# ── Pinecone connection ───────────────────────────────────────────────────────

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


# ── Main build ────────────────────────────────────────────────────────────────

def build():
    print("=" * 70)
    print("  LEGAL FRAMEWORK → PINECONE  (bge-small-en-v1.5 · 384 dims)")
    print(f"  Device : {DEVICE}")
    print("=" * 70)

    model = load_model()

    print("\n📚 Loading documents…")
    docs = load_all_docs()
    if not docs:
        print("❌ No documents loaded. Check your constitution/ folder.")
        return

    index = connect_pinecone()

    # Ask before overwriting
    stats = index.describe_index_stats()
    if stats.total_vector_count > 0:
        ans = input(f"\n⚠️  Index already has {stats.total_vector_count} vectors. Overwrite? (y/n): ").strip().lower()
        if ans != 'y':
            print("Aborted.")
            return
        index.delete(delete_all=True)
        print("   Cleared existing vectors.")

    print(f"\n📥 Embedding and uploading {len(docs)} documents…")

    buf    = []
    failed = []

    for doc in tqdm(docs, desc="Embedding & uploading"):
        try:
            emb = model.encode(
                BGE_PREFIX + doc["text"][:1000],
                normalize_embeddings=True,
                device=DEVICE
            ).tolist()
        except Exception as e:
            print(f"\n  ⚠️  Embed failed for {doc['id']}: {e}")
            failed.append(doc["id"])
            continue

        buf.append({
            "id":     doc["id"],
            "values": emb,
            "metadata": {
                "source":  doc["source"],
                "type":    doc["type"],
                "section": doc["section"],
                "content": doc["text"][:4000],
            }
        })

        if len(buf) >= UPSERT_BATCH:
            try:
                index.upsert(vectors=buf)
                buf = []
            except Exception as e:
                print(f"\n  ⚠️  Upsert failed: {e}")
                buf = []

    if buf:
        try:
            index.upsert(vectors=buf)
        except Exception as e:
            print(f"\n  ⚠️  Final upsert failed: {e}")

    stats = index.describe_index_stats()
    print(f"\n{'=' * 70}")
    print(f"  ✅ DONE  |  Pinecone vectors: {stats.total_vector_count}")
    if failed:
        print(f"  ⚠️  {len(failed)} failed: {failed[:5]}")
    print(f"  Index  : {PINECONE_INDEX}")
    print(f"  Model  : {EMBED_MODEL_NAME}")
    print("=" * 70)


if __name__ == "__main__":
    build()
