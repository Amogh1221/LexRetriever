# Makefile for local development
.PHONY: dev-frontend dev-backend install

install:
	cd frontend && npm install
	cd backend && pip install -r requirements.txt

dev-frontend:
	cd frontend && npm run dev

dev-backend:
	cd backend && uvicorn main:app --reload --port 8000
