"""
LexMind — FastAPI Backend (Pinecone + HuggingFace Inference API)
Run with: uvicorn main:app --reload --port 8000
"""

import os
import re
import json
from pathlib import Path
from typing import Optional

import httpx
import fitz                    # PyMuPDF
import torch
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone
from dotenv import load_dotenv

load_dotenv()
# ── Configuration ─────────────────────────────────────────────────────────────
PINECONE_API_KEY        = os.getenv("PINECONE_API_KEY", "pcsk_78oZ4p_Ji4jqxt5xxb8pCwaJXkBRLNxbCWyqB9xWEzFGVkmQ6ws8hTcFFp646uDSb2btWz")
HF_API_KEY              = os.getenv("HF_API_KEY", "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")

JUDGEMENTS_INDEX        = "legal-judgements"
LEGAL_FRAMEWORK_INDEX   = "legal-framework"

LOCAL_MODEL_DIR         = "./models/bge-small"
EMBED_MODEL_NAME        = "BAAI/bge-small-en-v1.5"
DEVICE                  = "cuda" if torch.cuda.is_available() else "cpu"

# Both stages use the same model — change here to use different ones
HF_ROUTER_MODEL = "meta-llama/Llama-3.1-8B-Instruct"   # Stage 1: conversation + routing
HF_LEGAL_MODEL  = "meta-llama/Llama-3.1-8B-Instruct"   # Stage 2: legal RAG answer

HF_CHAT_URL        = "https://router.huggingface.co/v1/chat/completions"
BGE_PREFIX         = "Represent this sentence for searching relevant passages: "
TOP_K              = 10
CONSTITUTION_TOP_K = 5
# ─────────────────────────────────────────────────────────────────────────────


# ── Load embedding model ──────────────────────────────────────────────────────
def load_embed_model() -> SentenceTransformer:
    local = Path(LOCAL_MODEL_DIR)
    if local.exists() and any(local.iterdir()):
        print(f"✅ Loading bge-small from '{LOCAL_MODEL_DIR}'")
    else:
        print(f"📥 Downloading {EMBED_MODEL_NAME} (~130 MB)…")
        local.mkdir(parents=True, exist_ok=True)
        m = SentenceTransformer(EMBED_MODEL_NAME)
        m.save(str(local))
        print(f"✅ Model saved to '{LOCAL_MODEL_DIR}'")
    model = SentenceTransformer(str(local))
    model = model.to(DEVICE)
    print(f"   Embedding device: {DEVICE}")
    return model


embed_model = load_embed_model()


# ── Connect to Pinecone ───────────────────────────────────────────────────────
print("🔌 Connecting to Pinecone…")
pc = Pinecone(api_key=PINECONE_API_KEY)

judgements_index = pc.Index(JUDGEMENTS_INDEX)
print(f"✅ Judgements index | vectors: {judgements_index.describe_index_stats().total_vector_count}")

try:
    legal_index = pc.Index(LEGAL_FRAMEWORK_INDEX)
    print(f"✅ Legal framework index | vectors: {legal_index.describe_index_stats().total_vector_count}")
except Exception:
    legal_index = None
    print("⚠️  Legal framework index not found — run build_pinecone_legal.py.")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="LexMind API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────
class SearchRequest(BaseModel):
    query:     str
    top_k:     int = 10
    offset:    int = 0
    year_from: Optional[int] = None
    year_to:   Optional[int] = None
class ChatRequest(BaseModel):
    message:        str
    context:        str = ""
    system_prompt:  str = ""
    model_override: str = ""


class DroppedCitationModel(BaseModel):
    file_name: str = ""
    year:      str = ""
    content:   str = ""
    score:     float = 0.0


class SmartChatRequest(BaseModel):
    message:          str
    case_text:        str = ""                        # user's case description
    dropped_citation: Optional[DroppedCitationModel] = None  # only if user dragged a doc


# ── HuggingFace helper ────────────────────────────────────────────────────────
async def call_hf(
    model: str,
    system: str,
    user: str,
    temperature: float = 0.4,
    max_tokens: int = 1024,
    timeout: int = 120,
) -> str:
    headers = {
        "Authorization": f"Bearer {HF_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "max_tokens":  max_tokens,
        "temperature": temperature,
        "top_p":       0.9,
        "stream":      False,
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(HF_CHAT_URL, headers=headers, json=payload)

        if r.status_code != 200:
            print(f"[HF ERROR] status={r.status_code} model={model} body={r.text[:400]}")

        if r.status_code == 401:
            raise HTTPException(status_code=401,
                detail="Invalid HuggingFace API key.")
        if r.status_code == 403:
            raise HTTPException(status_code=403,
                detail=f"Access denied for '{model}'. Accept the license at huggingface.co/{model}")
        if r.status_code == 404:
            raise HTTPException(status_code=404,
                detail=f"Model '{model}' not found.")
        if r.status_code == 429:
            raise HTTPException(status_code=429,
                detail="HuggingFace rate limit hit. Please wait and retry.")
        if r.status_code == 503:
            raise HTTPException(status_code=503,
                detail=f"Model '{model}' is loading (~20s). Please retry.")

        r.raise_for_status()

    data = r.json()
    choices = data.get("choices", [])
    if choices:
        content = choices[0].get("message", {}).get("content", "")
        if content:
            return content.strip()

    if isinstance(data, list) and data:
        return data[0].get("generated_text", "").strip()

    raise HTTPException(status_code=500,
        detail=f"Unexpected HF response: {str(data)[:200]}")


# ── Embed helper ──────────────────────────────────────────────────────────────
def embed_query(text: str) -> list[float]:
    return embed_model.encode(
        BGE_PREFIX + text,
        normalize_embeddings=True,
        device=DEVICE
    ).tolist()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    hf_ok = False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                "https://huggingface.co/api/whoami",
                headers={"Authorization": f"Bearer {HF_API_KEY}"}
            )
            hf_ok = r.status_code == 200
    except Exception:
        pass

    j_stats = judgements_index.describe_index_stats()
    l_stats = legal_index.describe_index_stats() if legal_index else None

    return {
        "status":             "ok",
        "huggingface":        "authenticated" if hf_ok else "check HF_API_KEY",
        "router_model":       HF_ROUTER_MODEL,
        "legal_model":        HF_LEGAL_MODEL,
        "judgements_vectors": j_stats.total_vector_count,
        "legal_vectors":      l_stats.total_vector_count if l_stats else 0,
        "embed_device":       DEVICE,
    }


@app.post("/api/search")
async def search(req: SearchRequest):
    """Semantic search over judgements Pinecone index with pagination."""
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    fetch_k = min(req.offset + req.top_k, 100)

    try:
        result = judgements_index.query(
            vector=embed_query(req.query),
            top_k=fetch_k,
            include_metadata=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    output = []
    for m in result.get("matches", []):
        meta = m.get("metadata", {})
        output.append({
            "file_name": meta.get("file_name", "Unknown"),
            "year":      meta.get("year", "Unknown"),
            "source":    meta.get("source", ""),
            "score":     round(float(m.get("score", 0)), 4),
            "content":   meta.get("content", ""),
        })

    output.sort(key=lambda x: x["score"], reverse=True)
    return {"results": output[req.offset: req.offset + req.top_k], "count": len(output)}


@app.post("/api/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    """Extract full text from an uploaded PDF."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    contents = await file.read()
    try:
        doc   = fitz.open(stream=contents, filetype="pdf")
        pages = [page.get_text() for page in doc]
        doc.close()
        text  = "\n\n".join(pages).strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {str(e)}")
    return {"text": text, "pages": len(pages), "filename": file.filename}


@app.post("/api/legal-context")
async def legal_context(req: SearchRequest):
    """Retrieve legal framework chunks from Pinecone."""
    if not legal_index:
        return {"results": [], "count": 0}
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    try:
        result = legal_index.query(
            vector=embed_query(req.query),
            top_k=min(req.top_k or CONSTITUTION_TOP_K, 10),
            include_metadata=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Legal context search failed: {str(e)}")

    output = []
    for m in result.get("matches", []):
        meta = m.get("metadata", {})
        output.append({
            "source":  meta.get("source", "Unknown"),
            "type":    meta.get("type", ""),
            "section": meta.get("section", ""),
            "score":   round(float(m.get("score", 0)), 4),
            "content": meta.get("content", ""),
        })
    output.sort(key=lambda x: x["score"], reverse=True)
    return {"results": output, "count": len(output)}


@app.post("/api/chat")
async def chat_legacy(req: ChatRequest):
    """Legacy endpoint — used by CitationCard summarize and AI compare features."""
    system = (
        "You are LexMind, a professional Indian legal research assistant. "
        "Answer concisely and professionally based only on the provided context."
    )
    user = (
        f"CONTEXT:\n{req.context}\n\nQUESTION: {req.message}"
        if req.context.strip() else req.message
    )
    try:
        reply = await call_hf(HF_LEGAL_MODEL, system, user)
        return {"reply": reply}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@app.post("/api/smart-chat")
async def smart_chat(req: SmartChatRequest):
    """
    Two-stage conversational chat:

    Stage 1 — LLM1 (Llama-3.1-8B):
      - Always knows the user's case description
      - Handles casual conversation naturally
      - If legal question detected, produces a precise rag_query for LLM2
      - Has NO knowledge of retrieved judgements
      - Only knows about a dropped citation if user explicitly dragged one in

    Stage 2 — LLM2 (Llama-3.1-8B):
      - Only called when Stage 1 detects a legal question
      - Gets: legal framework from Pinecone + dropped citation (if any)
      - Returns grounded legal answer with [LAW: source] citations
    """

    # ── Build case context for LLM1 ──────────────────────────────────────────
    case_ctx = ""
    if req.case_text.strip():
        case_ctx = f"\nCURRENT USER CASE:\n{req.case_text[:800]}\n"

    dropped_ctx = ""
    if req.dropped_citation and req.dropped_citation.content.strip():
        name = (req.dropped_citation.file_name or '').replace('_', ' ').strip()
        dropped_ctx = (
            f"\nUSER HAS SHARED THIS JUDGEMENT FOR DISCUSSION:\n"
            f"Case: {name} ({req.dropped_citation.year or '?'})\n"
            f"{req.dropped_citation.content[:2000]}\n"
        )

    # ── Stage 1: Router + conversationalist ──────────────────────────────────
    router_system = f"""You are LexMind, a friendly and professional Indian legal research assistant.
{case_ctx}{dropped_ctx}
YOUR BEHAVIOUR:
- For casual messages (greetings, thanks, small talk): reply naturally and warmly in 1-2 sentences.
- For questions about the shared judgement above (if any): you can answer directly from it.
- For legal questions requiring Constitution/IPC/CrPC/BSA knowledge: identify what needs to be looked up.
- Never make up legal information you are not sure about.

Respond ONLY with valid JSON, no extra text, no markdown fences:

For casual chat:
{{"intent": "chat", "response": "your warm friendly reply here", "rag_query": null}}

For a legal question you can answer from the shared judgement:
{{"intent": "citation", "response": "your answer from the judgement", "rag_query": null}}

For a legal question needing Constitution/IPC/CrPC/BSA lookup:
{{"intent": "legal", "response": null, "rag_query": "precise 3-8 word search query"}}"""

    router_user = f'User message: "{req.message}"'

    try:
        raw = await call_hf(
            HF_ROUTER_MODEL,
            router_system,
            router_user,
            temperature=0.2,
            max_tokens=300,
            timeout=60,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stage 1 failed: {str(e)}")

    # ── Parse Stage 1 JSON ────────────────────────────────────────────────────
    intent    = "chat"
    response  = None
    rag_query = None
    try:
        clean  = re.sub(r"```json|```", "", raw).strip()
        match  = re.search(r"\{.*\}", clean, re.DOTALL)
        parsed = json.loads(match.group(0) if match else clean)
        intent    = parsed.get("intent", "chat")
        response  = parsed.get("response")
        rag_query = parsed.get("rag_query")
    except Exception:
        # JSON parse failed — treat raw text as a casual reply
        intent   = "chat"
        response = raw.strip() if raw.strip() else "How can I help you?"

    # ── Stage 1 exits: casual or citation answer ──────────────────────────────
    if intent in ("chat", "citation"):
        return {
            "reply":  response or "How can I help you today?",
            "intent": intent,
        }

    # ── Stage 2: Legal RAG answer ─────────────────────────────────────────────
    search_q = rag_query or req.message

    # 2a. Search Pinecone legal-framework index
    legal_ctx = ""
    if legal_index and search_q:
        try:
            law_result = legal_index.query(
                vector=embed_query(search_q),
                top_k=CONSTITUTION_TOP_K,
                include_metadata=True,
            )
            matches = sorted(
                law_result.get("matches", []),
                key=lambda x: x.get("score", 0),
                reverse=True,
            )
            if matches:
                legal_ctx = "RELEVANT LEGAL FRAMEWORK (Constitution / IPC / CrPC / BSA):\n\n"
                for m in matches:
                    meta = m.get("metadata", {})
                    src  = meta.get("source", "Law")
                    sec  = meta.get("section", "")
                    legal_ctx += f"[LAW: {src}{' S.' + str(sec) if sec else ''}]\n"
                    legal_ctx += f"{meta.get('content', '')[:600]}\n\n---\n\n"
        except Exception:
            pass  # continue without legal context

    # 2b. Build Stage 2 context
    # Includes: case description + dropped citation (if any) + legal framework
    # Does NOT include retrieved judgements
    stage2_context = ""
    if req.case_text.strip():
        stage2_context += f"USER'S CASE:\n{req.case_text[:800]}\n\n"
    if dropped_ctx:
        stage2_context += dropped_ctx + "\n"
    if legal_ctx:
        stage2_context += legal_ctx

    legal_system = """You are LexMind, a professional Indian legal research assistant.

KNOWLEDGE BASE YOU CAN USE:
- The user's case description (if provided)
- A shared judgement (if user dragged one in)
- Indian Constitution, IPC, CrPC, BSA 2023 — cited as [LAW: source S.section]

KNOWLEDGE GAPS — be honest if asked about these:
- Code of Civil Procedure (CPC) — not in your knowledge base
- Indian Contract Act — not in your knowledge base
- Transfer of Property Act — not in your knowledge base

RULES:
1. Answer ONLY from the provided context. Never fabricate.
2. Cite laws as [LAW: IPC S.302] or [LAW: Indian Constitution Art.21].
3. If context is insufficient: "I don't have enough information on this. Please search for relevant citations."
4. Be concise, clear, and professional.
5. Answer directly — no preamble like "Based on the context provided…"."""

    legal_user = (
        f"QUESTION: {req.message}\n\nCONTEXT:\n{stage2_context}"
        if stage2_context.strip()
        else req.message
    )

    try:
        reply = await call_hf(
            HF_LEGAL_MODEL,
            legal_system,
            legal_user,
            temperature=0.2,
            max_tokens=1024,
            timeout=120,
        )
        return {"reply": reply, "intent": "legal"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stage 2 failed: {str(e)}")


# ── Serve React frontend ──────────────────────────────────────────────────────
# Built frontend output is generated under ../frontend/dist (relative to backend/)
dist_path = Path("../frontend/dist")
if dist_path.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(dist_path / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(str(dist_path / "index.html"))
