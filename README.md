# LexRetriever — Fullstack (React + FastAPI)

This repo is organized into two main folders:

- `frontend/` — React + Vite UI
- `backend/` — FastAPI API, Pinecone + HuggingFace integration, and dataset builders
- `docs/` — reports, archives, and other supporting artifacts

---

## Frontend (React + Vite)

### Install dependencies
```bash
cd frontend
npm install
```

### Run in development mode
```bash
npm run dev
```

The dev server runs at **http://localhost:3000** and proxies `/api/*` to **http://localhost:8000**.

### Build for production
```bash
npm run build
```

The build output will appear in `frontend/dist/`. The backend is configured to serve this build automatically when running from `backend/`.

---

## Backend (FastAPI)

### Setup
```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

### Run
```bash
uvicorn main:app --reload --port 8000
```

### Notes
- The backend serves the frontend build from `../frontend/dist/` when it exists.
- API endpoints are under `/api/*` (e.g., `/api/search`, `/api/chat`).

---

## Building/Updating the Vector DBs

The backend includes scripts to build Pinecone indexes from local datasets:

- `build_pinecone_judgements.py` — build/query vector DB for judgement documents
- `build_pinecone_legal.py` — build/query vector DB for legal framework sources
- `build_legal_rag.py` — build a local Chroma DB for constitution+law content

Run these from the `backend/` directory.

---

## Directory Layout

```
frontend/      # React app (Vite)
backend/       # FastAPI server + Pinecone/LLM tooling + data
  ├── data/    # datasets, models, and indexes
  ├── main.py
  ├── requirements.txt
  └── ...
docs/          # reports and archive artifacts
```
