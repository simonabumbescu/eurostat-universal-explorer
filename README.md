# Eurostat Universal Explorer

Aplicație web full-stack pentru vizualizarea interactivă a datelor statistice
europene (Eurostat), cu hartă coropletă a Europei și asistent AI conversațional.

**Lucrare de disertație** — [Numele studentului], 2025.

---

## Ce face aplicația

- Acces în timp real la **35 de seturi de date** Eurostat, în 9 categorii
  (populație, economie, piața muncii, sănătate, educație, mediu, prețuri, digital).
- **4 tipuri de vizualizare**: grafic cu linii, cu bare, cu suprafață și
  hartă coropletă a Europei (D3.js), cu colorare automată și export PNG.
- **Asistent AI** (OpenAI GPT-4o-mini) care răspunde la întrebări în limba
  română, pe baza datelor reale afișate (tehnica RAG — răspunsuri verificabile).

## Arhitectură

| Nivel | Tehnologie | Rol |
|-------|-----------|-----|
| Frontend | React 19, Recharts, D3.js | Interfața, grafice, hartă |
| Backend | FastAPI (Python), Pandas | Parsare date, filtrare, AI |
| Surse externe | Eurostat API, OpenAI API | Date statistice, inteligență artificială |

---

## Rulare locală

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Configurează cheia OpenAI (copiază .env.example în .env și completează):
#   OPENAI_API_KEY=sk-...

uvicorn main:app --reload --port 8000
```

Backend-ul rulează la `http://localhost:8000`
(documentație interactivă la `http://localhost:8000/docs`).

### 2. Frontend (React)

```bash
cd frontend
npm install
npm start
```

Aplicația se deschide la `http://localhost:3000`.

> În dezvoltare, frontend-ul folosește automat `http://localhost:8000`.
> Pentru producție se setează variabila `REACT_APP_API_URL`.

---

## Deploy online (gratuit)

### Backend → Render
1. Creează cont pe [render.com](https://render.com) și conectează GitHub.
2. **New → Blueprint** și selectează acest repo (citește `render.yaml`).
3. La variabile de mediu, adaugă `OPENAI_API_KEY` (secret) și, după ce ai
   adresa frontend-ului, `ALLOWED_ORIGINS`.
4. Vei primi un URL de forma `https://eurostat-backend.onrender.com`.

### Frontend → Vercel
1. Creează cont pe [vercel.com](https://vercel.com) și conectează GitHub.
2. **Import Project** → selectează repo-ul, root directory `frontend`.
3. La **Environment Variables** adaugă:
   `REACT_APP_API_URL = https://eurostat-backend.onrender.com`
4. Deploy → vei primi un URL public de forma
   `https://eurostat-explorer.vercel.app`.

> După deploy, întoarce-te în Render și pune URL-ul Vercel în `ALLOWED_ORIGINS`.

---

## Securitate

- Cheia OpenAI **nu** se află în cod — se citește din variabila de mediu
  `OPENAI_API_KEY` și se introduce doar în dashboard-ul de hosting (secret).
- Fișierele `.env` sunt excluse din Git (`.gitignore`).

## Structura proiectului

```
.
├── backend/            # API FastAPI
│   ├── main.py         # endpoint-uri + algoritmi
│   ├── requirements.txt
│   └── .env.example
├── frontend/           # aplicație React
│   ├── src/App.js
│   ├── vercel.json
│   └── .env.example
├── render.yaml         # config deploy backend
└── README.md
```

## Licență

Proiect academic — utilizare educațională.
