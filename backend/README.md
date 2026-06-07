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
- `GET /catalog?bpm=168`

Agora o backend tenta usar o `GetSongBPM` como fonte principal de BPM e gênero, e cai para `ytmusicapi` como fallback.

## Variáveis de ambiente

- `GETSONGBPM_API_KEY`

Cadastre a chave em:

- https://getsongbpm.com/api

Observação importante: a documentação do GetSongBPM exige backlink para o serviço no app ou store listing.

## Filtro por gênero

Os endpoints aceitam `genre`, por exemplo:

```bash
/search?bpm=168&genre=rock
/playlist?bpm=168&genre=pop
/search/text?q=too+sweet&bpm=117&genre=pop
```

## Catálogo próprio

O backend agora consulta primeiro o catálogo estruturado em:

- `backend/data/catalog.json`

Use isso para pré-cadastrar músicas por:

- BPM
- gênero
- artista
- query do YouTube Music

Depois disso, ele só complementa com GetSongBPM e ytmusicapi se faltar resultado.

## Cache local

As respostas ficam em `backend/.cache/ytmusic_cache.json` por 12 horas.
Isso acelera bastante buscas repetidas por BPM e por texto.
