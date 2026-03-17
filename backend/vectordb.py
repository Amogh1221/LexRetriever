import os
import zipfile
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

# ── Configuration ────────────────────────────────────────────────────────────
ZIP_PATH        = "Judgements.zip"
EXTRACT_DIR     = "judgements_extracted"
PERSIST_DIR     = "legal_db"
COLLECTION_NAME = "LegalJudgements"
LOCAL_MODEL_DIR = "./models/bge-large"        # ← local model, no download needed
BATCH_SIZE      = 10          # reduced from 50 to avoid ChromaDB compaction errors
RETRY_ATTEMPTS  = 3           # retry failed batches this many times
RETRY_DELAY     = 5           # seconds to wait between retries
DEVICE          = "cuda" if torch.cuda.is_available() else "cpu"
# ─────────────────────────────────────────────────────────────────────────────


def get_embeddings():
    """Load embedding model from local disk — no internet needed."""
    local_path = Path(LOCAL_MODEL_DIR)
    if not local_path.exists() or not any(local_path.iterdir()):
        raise FileNotFoundError(
            f"Local embedding model not found at '{LOCAL_MODEL_DIR}'.\n"
            f"Make sure the folder exists and contains the model files.\n"
            f"Expected path: {local_path.resolve()}"
        )
    print(f"✅ Loading embedding model from local disk: {local_path.resolve()}")
    return HuggingFaceEmbeddings(
        model_name=str(local_path.resolve()),
        model_kwargs={"device": DEVICE},
        encode_kwargs={"normalize_embeddings": True},
    )


def extract_zip(zip_path: str, extract_to: str):
    """Extract the judgements zip file."""
    print(f"📦 Extracting {zip_path} to {extract_to}...")
    if os.path.exists(extract_to):
        shutil.rmtree(extract_to)
    os.makedirs(extract_to)
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(extract_to)
    print("✅ Extraction complete.")


def find_pdfs(root_dir: str) -> list[Path]:
    """Recursively find ALL PDFs under root_dir, no matter how deep."""
    root = Path(root_dir)

    print("\n📂 Directory tree after extraction:")
    for item in sorted(root.rglob("*")):
        indent = "  " * (len(item.relative_to(root).parts) - 1)
        marker = "📄" if item.is_file() else "📁"
        print(f"  {indent}{marker} {item.name}")

    pdfs = list(root.rglob("*.pdf")) + list(root.rglob("*.PDF"))
    pdfs = list({p.resolve(): p for p in pdfs}.values())
    pdfs = sorted(pdfs)

    print(f"\n📄 Found {len(pdfs)} PDF files.")
    for p in pdfs:
        print(f"   → {p.relative_to(root)}")

    return pdfs


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract full text from a PDF using PyMuPDF."""
    try:
        import fitz
        doc = fitz.open(str(pdf_path))
        pages_text = [page.get_text() for page in doc]
        doc.close()
        full_text = "\n\n".join(pages_text).strip()
        return full_text
    except Exception as e:
        print(f"  ⚠️  Could not read {pdf_path.name}: {e}")
        return ""


def build_documents(pdf_paths: list[Path]) -> list[Document]:
    """One PDF = one Document (one chunk)."""
    documents = []
    print("\n📚 Building documents from PDFs...")

    for pdf_path in tqdm(pdf_paths, desc="Reading PDFs"):
        text = extract_text_from_pdf(pdf_path)
        if not text:
            print(f"  ⚠️  Skipping empty PDF: {pdf_path.name}")
            continue

        year = "unknown"
        for part in pdf_path.parts:
            if part.isdigit() and len(part) == 4:
                year = part
                break

        documents.append(Document(
            page_content=text,
            metadata={
                "source":    str(pdf_path),
                "file_name": pdf_path.stem,
                "year":      year,
                "full_path": str(pdf_path.resolve()),
            }
        ))

    print(f"✅ Created {len(documents)} document(s) — one per judgement.")
    return documents


def build_vector_db(documents: list[Document], start_from: int = 0) -> Chroma | None:
    """
    Embed documents and persist the Chroma vector store.
    start_from: resume from this document index if a previous run failed.
    """
    print("\n🔨 Building vector database...")
    print(f"   Embedding model  : {LOCAL_MODEL_DIR}")
    print(f"   Device           : {DEVICE}")
    print(f"   Persist directory: {PERSIST_DIR}")
    print(f"   Batch size       : {BATCH_SIZE}")
    if start_from > 0:
        print(f"   Resuming from document #{start_from}")

    # Only wipe DB if starting fresh
    if start_from == 0 and os.path.exists(PERSIST_DIR):
        print(f"\n⚠️  Vector DB already exists at '{PERSIST_DIR}'.")
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

    docs_to_insert = documents[start_from:]
    failed_batches = []

    print(f"\n📥 Inserting {len(docs_to_insert)} documents in batches of {BATCH_SIZE}...")

    with tqdm(total=len(docs_to_insert), desc="Inserting") as pbar:
        for i in range(0, len(docs_to_insert), BATCH_SIZE):
            batch     = docs_to_insert[i : i + BATCH_SIZE]
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
                        print(f"     ❌ Batch {batch_num} failed after {RETRY_ATTEMPTS} attempts. Skipping.")
                        failed_batches.append(start_from + i)

            pbar.update(len(batch))

    if failed_batches:
        print(f"\n⚠️  {len(failed_batches)} batch(es) failed and were skipped:")
        for idx in failed_batches:
            print(f"   → Starting at document #{idx} (resume with START_FROM={idx})")
    else:
        print("✅ Vector DB build complete — all batches inserted successfully!")

    return vector_store


def verify_vector_db():
    """Run a few test queries to confirm the DB is working."""
    print("\n🔍 Verifying vector database...")

    embeddings = get_embeddings()

    vector_store = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=PERSIST_DIR,
    )

    prefix = "Represent this sentence for searching relevant passages: "

    test_queries = [
        "mortgage deed property",
        "cheating IPC section 420",
        "partition of land revenue",
    ]

    print("-" * 70)
    for query in test_queries:
        results = vector_store.similarity_search(prefix + query, k=2)
        print(f"\n🔎 Query : '{query}'")
        print(f"   Hits  : {len(results)}")
        if results:
            snippet = results[0].page_content[:200].replace("\n", " ")
            name    = results[0].metadata.get("file_name", "?")
            year    = results[0].metadata.get("year", "?")
            print(f"   Best  : [{year}] {name}")
            print(f"   Preview: {snippet}...")
    print("-" * 70)


def cleanup_extracted(extract_dir: str):
    """Remove the temporary extraction folder."""
    if os.path.exists(extract_dir):
        shutil.rmtree(extract_dir)
        print(f"🗑️  Removed temporary folder '{extract_dir}'.")


def main():
    print("=" * 70)
    print("  LEGAL JUDGEMENTS — VECTOR DB BUILDER")
    print("  (1 PDF = 1 chunk = 1 judgement)")
    print(f"  Device       : {DEVICE}")
    print(f"  Local model  : {Path(LOCAL_MODEL_DIR).resolve()}")
    print("=" * 70)

    # ── RESUME CONTROL ────────────────────────────────────────────────────
    # If the script crashed mid-way, set START_FROM to the failed document
    # index printed in the error output — it will skip re-extraction and
    # resume inserting from that point without wiping the existing DB.
    # Set to 0 for a fresh run.
    START_FROM = 0
    # ──────────────────────────────────────────────────────────────────────

    if START_FROM == 0:
        if os.path.exists(PERSIST_DIR):
            print(f"\n🗑️  Removing old vector DB at '{PERSIST_DIR}'...")
            shutil.rmtree(PERSIST_DIR)
            print("   Done.")

        if not os.path.exists(ZIP_PATH):
            raise FileNotFoundError(
                f"Zip file not found: '{ZIP_PATH}'. "
                "Update ZIP_PATH at the top of the script."
            )
        extract_zip(ZIP_PATH, EXTRACT_DIR)
    else:
        print(f"\n▶️  Resuming from document #{START_FROM} — skipping extraction.")

    pdf_paths = find_pdfs(EXTRACT_DIR)
    if not pdf_paths:
        print("❌ No PDFs found inside the zip. Check the folder structure.")
        return

    documents = build_documents(pdf_paths)
    if not documents:
        print("❌ No readable text extracted from PDFs.")
        return

    vector_store = build_vector_db(documents, start_from=START_FROM)

    if vector_store:
        verify_vector_db()

    answer = input("\nDelete the extracted PDF folder? (y/n): ").strip().lower()
    if answer == "y":
        cleanup_extracted(EXTRACT_DIR)

    print("\n" + "=" * 70)
    print("  DONE!")
    print(f"  DB location  : {os.path.abspath(PERSIST_DIR)}")
    print(f"  Judgements   : {len(documents)}")
    print(f"  Collection   : {COLLECTION_NAME}")
    print(f"  Local model  : {Path(LOCAL_MODEL_DIR).resolve()}")
    print(f"  Device used  : {DEVICE}")
    print("=" * 70)


if __name__ == "__main__":
    main()