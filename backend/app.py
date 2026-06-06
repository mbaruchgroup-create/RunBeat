from __future__ import annotations

import json
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic

app = FastAPI(title="RunBeat Music Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ytmusic = YTMusic()
CACHE_DIR = Path(__file__).resolve().parent / ".cache"
CACHE_FILE = CACHE_DIR / "ytmusic_cache.json"
CACHE_TTL = timedelta(hours=12)


def load_cache() -> dict[str, Any]:
    if not CACHE_FILE.exists():
        return {}
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_cache(cache: dict[str, Any]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=True), encoding="utf-8")


def get_cached(key: str) -> Any | None:
    cache = load_cache()
    item = cache.get(key)
    if not item:
        return None
    try:
        created_at = datetime.fromisoformat(item["created_at"])
    except Exception:
        return None
    if datetime.now(timezone.utc) - created_at > CACHE_TTL:
        return None
    return item.get("value")


def set_cached(key: str, value: Any) -> None:
    cache = load_cache()
    cache[key] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "value": value,
    }
    save_cache(cache)


def build_queries(bpm: int) -> list[str]:
    return [
        f"{bpm} bpm running",
        f"{bpm} bpm running playlist",
        f"{bpm} bpm tempo run",
        f"{bpm} bpm cardio music",
    ]


def build_playlist_bands(bpm: int) -> list[dict[str, Any]]:
    return [
        {
            "id": "warmup",
            "label": "Warmup",
            "bpm": max(120, bpm - 8),
            "description": "Entrando no ritmo com passada solta",
        },
        {
            "id": "steady",
            "label": "Steady",
            "bpm": max(120, bpm - 4),
            "description": "Rodagem constante e confortável",
        },
        {
            "id": "target",
            "label": "Target",
            "bpm": bpm,
            "description": "Faixa central para a sua cadencia de hoje",
        },
        {
            "id": "push",
            "label": "Push",
            "bpm": min(220, bpm + 4),
            "description": "Para acelerar ou fechar forte",
        },
    ]


def normalize_song(item: dict[str, Any], bpm: int, query: str) -> dict[str, Any] | None:
    video_id = item.get("videoId")
    title = item.get("title")
    artists = [artist.get("name") for artist in item.get("artists", []) if artist.get("name")]

    if not video_id or not title or not artists:
        return None

    thumbnails = item.get("thumbnails") or []
    thumbnail_url = thumbnails[-1]["url"] if thumbnails else None

    return {
        "id": video_id,
        "videoId": video_id,
        "title": title,
        "artists": artists,
        "durationText": item.get("duration"),
        "album": (item.get("album") or {}).get("name") if isinstance(item.get("album"), dict) else None,
        "thumbnailUrl": thumbnail_url,
        "bpmHint": bpm,
        "query": query,
        "musicUrl": f"https://music.youtube.com/watch?v={video_id}",
        "youtubeUrl": f"https://www.youtube.com/watch?v={video_id}",
    }


def fetch_song_results(bpm: int, limit: int) -> list[dict[str, Any]]:
    cache_key = f"search:{bpm}:{limit}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    deduped: OrderedDict[str, dict[str, Any]] = OrderedDict()

    for query in build_queries(bpm):
        results = ytmusic.search(query, filter="songs", limit=min(limit, 8))
        for result in results:
            song = normalize_song(result, bpm, query)
            if song and song["videoId"] not in deduped:
                deduped[song["videoId"]] = song
            if len(deduped) >= limit:
                break
        if len(deduped) >= limit:
            break

    value = list(deduped.values())
    set_cached(cache_key, value)
    return value


def fetch_playlist_bands(bpm: int, limit_per_band: int) -> list[dict[str, Any]]:
    cache_key = f"playlist:{bpm}:{limit_per_band}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    bands: list[dict[str, Any]] = []
    for band in build_playlist_bands(bpm):
        items = fetch_song_results(band["bpm"], limit_per_band)
        bands.append({**band, "items": items})

    set_cached(cache_key, bands)
    return bands


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/search")
def search_by_bpm(
    bpm: int = Query(..., ge=120, le=220),
    limit: int = Query(12, ge=1, le=25),
):
    return {"items": fetch_song_results(bpm, limit)}


@app.get("/playlist")
def playlist_by_bpm(
    bpm: int = Query(..., ge=120, le=220),
    limit_per_band: int = Query(5, ge=1, le=10),
):
    return {"bands": fetch_playlist_bands(bpm, limit_per_band)}


@app.get("/search/text")
def search_by_text(
    q: str = Query(..., min_length=2),
    bpm: int = Query(170, ge=120, le=220),
    limit: int = Query(12, ge=1, le=25),
):
    cache_key = f"text:{q.lower()}:{bpm}:{limit}"
    cached = get_cached(cache_key)
    if cached is not None:
        return {"items": cached}

    deduped: OrderedDict[str, dict[str, Any]] = OrderedDict()
    results = ytmusic.search(q, filter="songs", limit=limit)

    for result in results:
        song = normalize_song(result, bpm, q)
        if song and song["videoId"] not in deduped:
            deduped[song["videoId"]] = song

    value = list(deduped.values())
    set_cached(cache_key, value)
    return {"items": value}
