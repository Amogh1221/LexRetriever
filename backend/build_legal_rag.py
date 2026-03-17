"""
build_legal_rag.py
Builds a second vector DB (constitution_db) from:
  - constitution_qa.json      (Indian Constitution Q&A pairs)
  - ipc_sections.csv          (Indian Penal Code sections)
  - bsa_sections.csv          (Bharatiya Sakshya Adhiniyam 2023 — new Evidence Act)
  - crpc_sections.csv         (Code of Criminal Procedure 1973)

Run with: python build_legal_rag.py
"""

import os
import json
import csv
import shutil
from pathlib import Path
from langchain_core.documents import Document
from langchain_chroma import Chroma
from tqdm import tqdm
import torch
import time

# ── Fix: use langchain_huggingface instead of deprecated langchain_community ──
try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    from langchain_community.embeddings import HuggingFaceEmbeddings

# ── Configuration ─────────────────────────────────────────────────────────────
CONSTITUTION_DIR = "./constitution"          # folder with all 4 source files
PERSIST_DIR      = "./constitution_db"       # new vector DB (separate from legal_db)
COLLECTION_NAME  = "LegalFramework"
LOCAL_MODEL_DIR  = "./models/bge-large"      # same model as judgements DB
BATCH_SIZE       = 20
RETRY_ATTEMPTS   = 3
RETRY_DELAY      = 3
DEVICE           = "cuda" if torch.cuda.is_available() else "cpu"

# ── File names inside CONSTITUTION_DIR ───────────────────────────────────────
CONSTITUTION_QA_FILE = "constitution_qa.json"
IPC_CSV_FILE         = "ipc_sections.csv"
BSA_CSV_FILE         = "bsa_sections.csv"
CRPC_CSV_FILE        = "crpc_sections.csv"
# ─────────────────────────────────────────────────────────────────────────────


def get_embeddings():
    """Load embedding model from local disk — no internet needed."""
    local_path = Path(LOCAL_MODEL_DIR)
    if not local_path.exists() or not any(local_path.iterdir()):
        raise FileNotFoundError(
            f"Local embedding model not found at '{LOCAL_MODEL_DIR}'.\n"
            f"Expected path: {local_path.resolve()}"
        )
    print(f"✅ Loading embedding model from: {local_path.resolve()}")
    return HuggingFaceEmbeddings(
        model_name=str(local_path.resolve()),
        model_kwargs={"device": DEVICE},
        encode_kwargs={"normalize_embeddings": True},
    )


# ── Loaders ───────────────────────────────────────────────────────────────────

def load_constitution_qa(filepath: Path) -> list[Document]:
    """
    Load constitution_qa.json.
    Each Q&A pair becomes one Document.
    Content = question + answer combined for better semantic search.
    """
    print(f"\n📜 Loading Constitution Q&A from '{filepath.name}'...")
    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    docs = []
    for item in data:
        question = item.get("question", "").strip()
        answer   = item.get("answer", "").strip()
        if not answer:
            continue
        content = f"Q: {question}\nA: {answer}" if question else answer
        docs.append(Document(
            page_content=content,
            metadata={
                "source":   "Indian Constitution",
                "type":     "constitution_qa",
                "question": question,
            }
        ))

    print(f"   ✅ {len(docs)} Constitution Q&A documents loaded.")
    return docs


def load_ipc_csv(filepath: Path) -> list[Document]:
    """
    Load ipc_sections.csv.
    Columns: Description, Offense, Punishment, Section
    Each section becomes one Document.
    """
    print(f"\n⚖️  Loading IPC sections from '{filepath.name}'...")
    docs = []

    with open(filepath, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            section     = row.get("Section", "").strip()
            description = row.get("Description", "").strip()
            offense     = row.get("Offense", "").strip()
            punishment  = row.get("Punishment", "").strip()

            if not description:
                continue

            content = (
                f"Section: {section}\n"
                f"Offense: {offense}\n"
                f"Punishment: {punishment}\n\n"
                f"{description}"
            )
            docs.append(Document(
                page_content=content,
                metadata={
                    "source":     "Indian Penal Code",
                    "type":       "ipc_section",
                    "section":    section,
                    "offense":    offense,
                    "punishment": punishment,
                }
            ))

    print(f"   ✅ {len(docs)} IPC section documents loaded.")
    return docs


def load_sections_csv(filepath: Path, source_name: str, doc_type: str) -> list[Document]:
    """
    Generic loader for BSA and CrPC CSVs.
    Columns: Chapter, Chapter_name, Chapter_subtype, Section, Section _name, Description
    Each section becomes one Document.
    """
    print(f"\n📋 Loading {source_name} from '{filepath.name}'...")
    docs = []

    with open(filepath, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Note: column has a space — "Section _name"
            section      = str(row.get("Section", "")).strip()
            section_name = row.get("Section _name", row.get("Section_name", "")).strip()
            chapter_name = row.get("Chapter_name", "").strip()
            description  = row.get("Description", "").strip()

            if not description:
                continue

            content = (
                f"Act: {source_name}\n"
                f"Chapter: {chapter_name}\n"
                f"Section {section}: {section_name}\n\n"
                f"{description}"
            )
            docs.append(Document(
                page_content=content,
                metadata={
                    "source":       source_name,
                    "type":         doc_type,
                    "section":      section,
                    "section_name": section_name,
                    "chapter":      chapter_name,
                }
            ))

    print(f"   ✅ {len(docs)} {source_name} documents loaded.")
    return docs


def load_all_documents() -> list[Document]:
    """Load and combine all legal framework documents."""
    base = Path(CONSTITUTION_DIR)
    all_docs = []

    # 1. Constitution Q&A
    constitution_path = base / CONSTITUTION_QA_FILE
    if constitution_path.exists():
        all_docs.extend(load_constitution_qa(constitution_path))
    else:
        print(f"⚠️  Skipping — not found: {constitution_path}")

    # 2. IPC sections
    ipc_path = base / IPC_CSV_FILE
    if ipc_path.exists():
        all_docs.extend(load_ipc_csv(ipc_path))
    else:
        print(f"⚠️  Skipping — not found: {ipc_path}")

    # 3. BSA (Evidence Act 2023)
    bsa_path = base / BSA_CSV_FILE
    if bsa_path.exists():
        all_docs.extend(load_sections_csv(bsa_path, "Bharatiya Sakshya Adhiniyam 2023", "bsa_section"))
    else:
        print(f"⚠️  Skipping — not found: {bsa_path}")

    # 4. CrPC
    crpc_path = base / CRPC_CSV_FILE
    if crpc_path.exists():
        all_docs.extend(load_sections_csv(crpc_path, "Code of Criminal Procedure 1973", "crpc_section"))
    else:
        print(f"⚠️  Skipping — not found: {crpc_path}")

    return all_docs


def build_vector_db(documents: list[Document]) -> Chroma | None:
    """Embed all documents and persist to constitution_db."""
    print(f"\n🔨 Building constitution vector DB...")
    print(f"   Total documents : {len(documents)}")
    print(f"   Embedding model : {LOCAL_MODEL_DIR}")
    print(f"   Device          : {DEVICE}")
    print(f"   Persist dir     : {PERSIST_DIR}")
    print(f"   Batch size      : {BATCH_SIZE}")

    if os.path.exists(PERSIST_DIR):
        print(f"\n⚠️  '{PERSIST_DIR}' already exists.")
        answer = input("   Overwrite? (y/n): ").strip().lower()
        if answer != "y":
            print("   Aborted.")
            return None
        shutil.rmtree(PERSIST_DIR)
        print("   Removed existing DB.")

    embeddings = get_embeddings()

    vector_store = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=PERSIST_DIR,
    )

    failed_batches = []
    print(f"\n📥 Inserting in batches of {BATCH_SIZE}...")

    with tqdm(total=len(documents), desc="Inserting") as pbar:
        for i in range(0, len(documents), BATCH_SIZE):
            batch     = documents[i : i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            success   = False

            for attempt in range(1, RETRY_ATTEMPTS + 1):
                try:
                    vector_store.add_documents(batch)
                    success = True
                    break
                except Exception as e:
                    print(f"\n  ⚠️  Batch {batch_num} attempt {attempt} failed: {e}")
                    if attempt < RETRY_ATTEMPTS:
                        print(f"     Retrying in {RETRY_DELAY}s…")
                        time.sleep(RETRY_DELAY)
                    else:
                        print(f"     ❌ Batch {batch_num} skipped after {RETRY_ATTEMPTS} attempts.")
                        failed_batches.append(i)

            pbar.update(len(batch))

    if failed_batches:
        print(f"\n⚠️  {len(failed_batches)} batch(es) failed at indices: {failed_batches}")
    else:
        print("✅ Constitution DB build complete — all batches inserted!")

    return vector_store


def verify_vector_db():
    """Run test queries to confirm the DB is working."""
    print("\n🔍 Verifying constitution DB...")
    embeddings = get_embeddings()
    vector_store = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=PERSIST_DIR,
    )

    prefix = "Represent this sentence for searching relevant passages: "
    test_queries = [
        "fundamental rights of citizens",
        "punishment for murder IPC",
        "bail conditions criminal procedure",
        "admissibility of evidence",
    ]

    print("-" * 70)
    for query in test_queries:
        results = vector_store.similarity_search(prefix + query, k=2)
        print(f"\n🔎 Query  : '{query}'")
        print(f"   Hits   : {len(results)}")
        if results:
            r = results[0]
            print(f"   Source : {r.metadata.get('source', '?')}")
            print(f"   Type   : {r.metadata.get('type', '?')}")
            snippet = r.page_content[:180].replace("\n", " ")
            print(f"   Preview: {snippet}…")
    print("-" * 70)


def print_summary(documents: list[Document]):
    """Print breakdown by source."""
    from collections import Counter
    counts = Counter(d.metadata.get("source", "Unknown") for d in documents)
    print("\n📊 Document breakdown by source:")
    for source, count in counts.most_common():
        print(f"   {source:<45} {count:>5} chunks")
    print(f"   {'TOTAL':<45} {len(documents):>5} chunks")


def main():
    print("=" * 70)
    print("  LEGAL FRAMEWORK — CONSTITUTION DB BUILDER")
    print(f"  Device      : {DEVICE}")
    print(f"  Source dir  : {Path(CONSTITUTION_DIR).resolve()}")
    print(f"  Output DB   : {Path(PERSIST_DIR).resolve()}")
    print("=" * 70)

    # Verify source directory exists
    if not Path(CONSTITUTION_DIR).exists():
        raise FileNotFoundError(
            f"Constitution folder not found: '{CONSTITUTION_DIR}'\n"
            f"Expected at: {Path(CONSTITUTION_DIR).resolve()}\n"
            f"Create the folder and add your source files."
        )

    # Load all documents
    documents = load_all_documents()

    if not documents:
        print("❌ No documents loaded. Check your source files.")
        return

    # Print breakdown
    print_summary(documents)

    # Build vector DB
    vector_store = build_vector_db(documents)

    # Verify
    if vector_store:
        verify_vector_db()

    print("\n" + "=" * 70)
    print("  DONE!")
    print(f"  DB location : {Path(PERSIST_DIR).resolve()}")
    print(f"  Total chunks: {len(documents)}")
    print(f"  Collection  : {COLLECTION_NAME}")
    print(f"  Model used  : {LOCAL_MODEL_DIR}")
    print(f"  Device      : {DEVICE}")
    print("=" * 70)
    print("\n  Next step: update main.py to query both legal_db and constitution_db")
    print("  so the chatbot has access to both judgements and legal framework.")


if __name__ == "__main__":
    main()
