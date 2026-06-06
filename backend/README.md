# RunBeat backend

Backend simples para buscar musicas reais no YouTube Music via `ytmusicapi`.

## Instalar

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Rodar

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Deploy no Railway

Como seu repositório contém app mobile e backend juntos, no Railway configure o serviço Python com:

- Root Directory: `backend`
- Builder: `Nixpacks`
- Start command:

```bash
uvicorn app:app --host 0.0.0.0 --port $PORT
```

Arquivos já preparados para isso:

- `backend/requirements.txt`
- `backend/nixpacks.toml`
- `backend/Procfile`

Depois do deploy, copie a URL pública HTTPS do Railway e use essa URL no campo de backend dentro do RunBeat.

## Endpoints

- `GET /health`
- `GET /search?bpm=168`
- `GET /playlist?bpm=168`
- `GET /search/text?q=tempo%20run&bpm=168`

## Cache local

As respostas ficam em `backend/.cache/ytmusic_cache.json` por 12 horas.
Isso acelera bastante buscas repetidas por BPM e por texto.
