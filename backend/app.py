from __future__ import annotations

import json
import os
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import requests
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic

app = FastAPI(title="RunBeat Music Backend", version="1.1.0")
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
CATEGORY_FILE = Path(__file__).resolve().parent / "data" / "catalog.json"
CACHE_TTL = timedelta(hours=12)
GETSONGBPM_API_KEY = os.getenv("GETSONGBPM_API_KEY", "").strip()
GETSONGBPM_BASE_URL = "https://api.getsong.co"
MIN_BPM = 117
MAX_BPM = 208


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


def load_catalog() -> list[dict[str, Any]]:
    if not CATEGORY_FILE.exists():
        return []
    try:
        value = json.loads(CATEGORY_FILE.read_text(encoding="utf-8"))
        return value if isinstance(value, list) else []
    except Exception:
        return []


def build_playlist_bands(bpm: int) -> list[dict[str, Any]]:
    return [
        {
            "id": "warmup",
            "label": "Warmup",
            "bpm": max(MIN_BPM, bpm - 8),
            "description": "Entrando no ritmo com passada solta",
        },
        {
            "id": "steady",
            "label": "Steady",
            "bpm": max(MIN_BPM, bpm - 4),
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
            "bpm": min(MAX_BPM, bpm + 4),
            "description": "Para acelerar ou fechar forte",
        },
    ]


def normalize_artist_names(artist_value: Any) -> list[str]:
    if isinstance(artist_value, list):
        names: list[str] = []
        for item in artist_value:
            if isinstance(item, dict) and item.get("name"):
                names.append(item["name"])
            elif isinstance(item, str):
                names.append(item)
        return names
    if isinstance(artist_value, dict) and artist_value.get("name"):
        return [artist_value["name"]]
    return []


def normalize_genres(artist_value: Any) -> list[str]:
    if isinstance(artist_value, dict):
        genres = artist_value.get("genres")
        if isinstance(genres, list):
          return [genre for genre in genres if isinstance(genre, str)]
    if isinstance(artist_value, list):
        all_genres: list[str] = []
        for item in artist_value:
            if isinstance(item, dict):
                genres = item.get("genres")
                if isinstance(genres, list):
                    all_genres.extend([genre for genre in genres if isinstance(genre, str)])
        return sorted(set(all_genres))
    return []


def build_music_query(title: str, artists: list[str], bpm: int) -> str:
    artist_part = " ".join(artists[:2]).strip()
    return " ".join(part for part in [title, artist_part, f"{bpm} bpm"] if part).strip()


def make_music_url(query: str) -> str:
    return f"https://music.youtube.com/search?q={quote_plus(query)}"


def make_youtube_url(query: str) -> str:
    return f"https://www.youtube.com/results?search_query={quote_plus(query)}"


def normalize_getsong_song(item: dict[str, Any], fallback_bpm: int) -> dict[str, Any] | None:
    title = item.get("title") or item.get("song_title")
    song_id = item.get("id") or item.get("song_id")
    artist_value = item.get("artist")
    artists = normalize_artist_names(artist_value)
    genres = normalize_genres(artist_value)

    if not title or not song_id or not artists:
        return None

    try:
        bpm = int(float(item.get("tempo") or fallback_bpm))
    except Exception:
        bpm = fallback_bpm

    query = build_music_query(title, artists, bpm)
    video_id = f"getsong-{song_id}"

    album = item.get("album")
    album_title = None
    if isinstance(album, dict):
        album_title = album.get("title")

    return {
        "id": video_id,
        "videoId": video_id,
        "title": title,
        "artists": artists,
        "genres": genres,
        "durationText": item.get("time_sig"),
        "album": album_title,
        "thumbnailUrl": None,
        "bpmHint": bpm,
        "query": query,
        "musicUrl": make_music_url(query),
        "youtubeUrl": make_youtube_url(query),
    }


def normalize_catalog_song(item: dict[str, Any]) -> dict[str, Any] | None:
    title = item.get("title")
    song_id = item.get("id")
    artists = item.get("artists") or []
    genres = item.get("genres") or []
    bpm = item.get("bpm")

    if not title or not song_id or not artists or bpm is None:
        return None

    query = item.get("youtubeMusicQuery") or build_music_query(title, artists, int(bpm))
    youtube_query = item.get("youtubeQuery") or query

    return {
        "id": str(song_id),
        "videoId": str(song_id),
        "title": title,
        "artists": artists,
        "genres": genres,
        "durationText": f"{int(bpm)} BPM",
        "album": item.get("album"),
        "thumbnailUrl": item.get("thumbnailUrl"),
        "bpmHint": int(bpm),
        "query": query,
        "musicUrl": make_music_url(query),
        "youtubeUrl": make_youtube_url(youtube_query),
    }


def normalize_ytmusic_song(item: dict[str, Any], bpm: int, query: str) -> dict[str, Any] | None:
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
        "genres": [],
        "durationText": item.get("duration"),
        "album": (item.get("album") or {}).get("name") if isinstance(item.get("album"), dict) else None,
        "thumbnailUrl": thumbnail_url,
        "bpmHint": bpm,
        "query": query,
        "musicUrl": f"https://music.youtube.com/watch?v={video_id}",
        "youtubeUrl": f"https://www.youtube.com/watch?v={video_id}",
    }


def getsong_request(path: str, params: dict[str, Any]) -> dict[str, Any] | None:
    if not GETSONGBPM_API_KEY:
        return None

    merged = {"api_key": GETSONGBPM_API_KEY, **params}
    response = requests.get(f"{GETSONGBPM_BASE_URL}{path}", params=merged, timeout=15)
    response.raise_for_status()
    return response.json()


def matches_genre(song: dict[str, Any], genre: str | None) -> bool:
    if not genre:
        return True
    genres = [value.lower() for value in song.get("genres", []) if isinstance(value, str)]
    return any(genre.lower() in value for value in genres)


def tempo_variants(bpm: int) -> list[int]:
    variants = {int(bpm)}
    halved = float(bpm)
    while halved > MAX_BPM:
        halved /= 2
        variants.add(int(round(halved)))
    doubled = float(bpm)
    while doubled < MIN_BPM:
        doubled *= 2
        variants.add(int(round(doubled)))
    return sorted(variants)


def best_tempo_distance(song_bpm: int, target_bpm: int) -> tuple[int, int]:
    variants = tempo_variants(song_bpm)
    best_variant = min(variants, key=lambda value: abs(value - target_bpm))
    return abs(best_variant - target_bpm), best_variant


def search_catalog_by_bpm(bpm: int, limit: int, genre: str | None = None, tolerance: int = 8) -> list[dict[str, Any]]:
    matches: list[tuple[int, dict[str, Any]]] = []
    for item in load_catalog():
        song = normalize_catalog_song(item)
        if not song:
            continue
        distance, matched_variant = best_tempo_distance(song["bpmHint"], bpm)
        if distance > tolerance:
            continue
        if not matches_genre(song, genre):
            continue
        song["matchedBpm"] = matched_variant
        matches.append((distance, song))

    matches.sort(key=lambda item: (item[0], abs(item[1]["bpmHint"] - bpm), item[1]["title"]))
    return [song for _, song in matches[:limit]]


def search_catalog_by_text(q: str, bpm: int, limit: int, genre: str | None = None) -> list[dict[str, Any]]:
    normalized_query = q.lower().strip()
    matches: list[dict[str, Any]] = []

    for item in load_catalog():
        song = normalize_catalog_song(item)
        if not song:
            continue
        haystack = " ".join(
            [
                song["title"],
                " ".join(song["artists"]),
                " ".join(song.get("genres", [])),
                song.get("album") or "",
            ]
        ).lower()
        if normalized_query not in haystack:
            continue
        if not matches_genre(song, genre):
            continue
        matches.append(song)

    matches.sort(key=lambda song: (abs(song["bpmHint"] - bpm), song["title"]))
    return matches[:limit]


def fetch_song_results_from_getsong(bpm: int, limit: int, genre: str | None) -> list[dict[str, Any]]:
    response = getsong_request("/tempo/", {"bpm": bpm, "limit": limit * 3})
    if not response:
        return []

    raw_items = response.get("tempo") or response.get("search") or []
    items: list[dict[str, Any]] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        song = normalize_getsong_song(raw_item, bpm)
        if song and matches_genre(song, genre):
            items.append(song)
        if len(items) >= limit:
            break
    return items


def fetch_song_results_from_ytmusic(bpm: int, limit: int) -> list[dict[str, Any]]:
    deduped: OrderedDict[str, dict[str, Any]] = OrderedDict()

    for query in build_queries(bpm):
        results = ytmusic.search(query, filter="songs", limit=min(limit, 8))
        for result in results:
            song = normalize_ytmusic_song(result, bpm, query)
            if song and song["videoId"] not in deduped:
                deduped[song["videoId"]] = song
            if len(deduped) >= limit:
                break
        if len(deduped) >= limit:
            break

    return list(deduped.values())


def fetch_song_results(bpm: int, limit: int, genre: str | None = None, tolerance: int = 8) -> list[dict[str, Any]]:
    cache_key = f"search:{bpm}:{limit}:{genre or 'all'}:{tolerance}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    deduped: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for source_list in (
        search_catalog_by_bpm(bpm, limit, genre, tolerance),
        fetch_song_results_from_getsong(bpm, limit, genre),
        fetch_song_results_from_ytmusic(bpm, limit),
    ):
        for song in source_list:
            if song["id"] not in deduped:
                deduped[song["id"]] = song
            if len(deduped) >= limit:
                break
        if len(deduped) >= limit:
            break

    value = list(deduped.values())[:limit]

    set_cached(cache_key, value)
    return value


def fetch_playlist_bands(
    bpm: int, limit_per_band: int, genre: str | None = None, tolerance: int = 8
) -> list[dict[str, Any]]:
    cache_key = f"playlist:{bpm}:{limit_per_band}:{genre or 'all'}:{tolerance}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    bands: list[dict[str, Any]] = []
    for band in build_playlist_bands(bpm):
        items = fetch_song_results(band["bpm"], limit_per_band, genre, tolerance)
        bands.append({**band, "items": items})

    set_cached(cache_key, bands)
    return bands


def search_songs_by_text(q: str, bpm: int, limit: int, genre: str | None = None) -> list[dict[str, Any]]:
    cache_key = f"text:{q.lower()}:{bpm}:{limit}:{genre or 'all'}"
    cached = get_cached(cache_key)
    if cached is not None:
        return cached

    value = search_catalog_by_text(q, bpm, limit, genre)

    if not value:
        response = getsong_request("/search/", {"type": "both", "lookup": q, "limit": limit * 3})
    else:
        response = None

    if response and not value:
        raw_items = response.get("search") or []
        deduped: OrderedDict[str, dict[str, Any]] = OrderedDict()
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                continue
            song = normalize_getsong_song(raw_item, bpm)
            if song and matches_genre(song, genre) and song["id"] not in deduped:
                deduped[song["id"]] = song
            if len(deduped) >= limit:
                break
        value = list(deduped.values())

    if not value:
        deduped: OrderedDict[str, dict[str, Any]] = OrderedDict()
        results = ytmusic.search(q, filter="songs", limit=limit)
        for result in results:
            song = normalize_ytmusic_song(result, bpm, q)
            if song and song["videoId"] not in deduped:
                deduped[song["videoId"]] = song
        value = list(deduped.values())

    set_cached(cache_key, value)
    return value


@app.get("/health")
def health():
    return {
        "ok": True,
        "providers": {
            "getsongbpm": bool(GETSONGBPM_API_KEY),
            "ytmusicapi": True,
        },
        "catalogSize": len(load_catalog()),
    }


@app.get("/search")
def search_by_bpm(
    bpm: int = Query(..., ge=MIN_BPM, le=MAX_BPM),
    limit: int = Query(12, ge=1, le=25),
    genre: str | None = Query(None),
    tolerance: int = Query(8, ge=0, le=20),
):
    return {"items": fetch_song_results(bpm, limit, genre, tolerance)}


@app.get("/playlist")
def playlist_by_bpm(
    bpm: int = Query(..., ge=MIN_BPM, le=MAX_BPM),
    limit_per_band: int = Query(5, ge=1, le=10),
    genre: str | None = Query(None),
    tolerance: int = Query(8, ge=0, le=20),
):
    return {"bands": fetch_playlist_bands(bpm, limit_per_band, genre, tolerance)}


@app.get("/catalog")
def catalog(
    bpm: int = Query(..., ge=MIN_BPM, le=MAX_BPM),
    limit: int = Query(20, ge=1, le=50),
    genre: str | None = Query(None),
    tolerance: int = Query(8, ge=0, le=20),
):
    return {"items": search_catalog_by_bpm(bpm, limit, genre, tolerance)}


@app.get("/search/text")
def search_by_text(
    q: str = Query(..., min_length=2),
    bpm: int = Query(170, ge=MIN_BPM, le=MAX_BPM),
    limit: int = Query(12, ge=1, le=25),
    genre: str | None = Query(None),
):
    return {"items": search_songs_by_text(q, bpm, limit, genre)}
