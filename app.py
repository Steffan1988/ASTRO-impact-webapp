import json
import math
import os
import random
import requests
import time
import urllib.parse
import pymysql
import pymysql.cursors

from flask import Flask, jsonify, request, render_template, Response, stream_with_context, send_from_directory
from dotenv import load_dotenv
from datetime import datetime, timedelta

import anthropic as anthropic_sdk

from richter_schaal import richter_schaal_data

load_dotenv()
api_key = os.getenv("API_KEY", "DEMO_KEY")
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
anthropic_client = anthropic_sdk.Anthropic(api_key=anthropic_api_key) if anthropic_api_key and not anthropic_api_key.startswith("vul_") else None

CHICXULUB_ENERGY = 1e23
WORLD_POP = int(8.2e9)
BEWOONBAAR_OPPERVLAK = 104_000_000
TOTAAL_OPPERVLAKTE_AARDE = 510_100_000
HIROSHIMA_JOULES = 6.3e13
MEGATON_TNT_JOULE = 4.184e15

DB_CONFIG = {
    "host": "127.0.0.1",
    "user": "root",
    "password": "Kisuma01",
    "database": "astro_impact",
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

app = Flask(__name__)


# ── Database ───────────────────────────────────────────────────────────────

def db_connect():
    return pymysql.connect(**DB_CONFIG)


def init_db():
    try:
        conn = pymysql.connect(
            host=DB_CONFIG["host"], user=DB_CONFIG["user"],
            password=DB_CONFIG["password"], charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
        with conn.cursor() as cur:
            cur.execute(
                "CREATE DATABASE IF NOT EXISTS astro_impact "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            cur.execute("USE astro_impact")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS simulations (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    asteroid_id     VARCHAR(20),
                    asteroid_naam   VARCHAR(255),
                    diameter_min    FLOAT,
                    diameter_max    FLOAT,
                    snelheid_kmu    FLOAT,
                    land_naam       VARCHAR(255),
                    land_populatie  BIGINT,
                    land_oppervlakte FLOAT,
                    lat             FLOAT,
                    lng             FLOAT,
                    energie_joules  DOUBLE,
                    energie_megaton FLOAT,
                    magnitude       FLOAT,
                    slachtoffers    BIGINT,
                    sl_direct       BIGINT,
                    sl_thermisch    BIGINT,
                    sl_shockgolf    BIGINT,
                    sl_seismisch    BIGINT,
                    sl_overig       BIGINT,
                    vernietigde_opp FLOAT,
                    procent_land    FLOAT,
                    extinction_event TINYINT(1),
                    richter_label   VARCHAR(100),
                    r_vuurbal       FLOAT,
                    r_zware_vern    FLOAT,
                    r_matige_vern   FLOAT,
                    r_thermisch     FLOAT,
                    r_lichte_schade FLOAT,
                    r_seismisch     FLOAT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS articles (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    simulation_id   INT NOT NULL,
                    kop             VARCHAR(500),
                    inhoud          MEDIUMTEXT,
                    image_url       TEXT,
                    city_image_url  TEXT,
                    generated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Kolommen toevoegen als ze nog niet bestaan (bestaande databases)
            for col, definition in [
                ("image_url",      "TEXT AFTER inhoud"),
                ("city_image_url", "TEXT AFTER image_url"),
            ]:
                try:
                    cur.execute(f"ALTER TABLE articles ADD COLUMN {col} {definition}")
                except Exception:
                    pass
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB init fout] {e}")
        return False


def sla_simulatie_op(data: dict) -> int:
    """Slaat de simulatie op en retourneert het ingevoegde ID."""
    try:
        conn = db_connect()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO simulations (
                    asteroid_id, asteroid_naam, diameter_min, diameter_max, snelheid_kmu,
                    land_naam, land_populatie, land_oppervlakte, lat, lng,
                    energie_joules, energie_megaton, magnitude,
                    slachtoffers, sl_direct, sl_thermisch, sl_shockgolf, sl_seismisch, sl_overig,
                    vernietigde_opp, procent_land, extinction_event, richter_label,
                    r_vuurbal, r_zware_vern, r_matige_vern, r_thermisch, r_lichte_schade, r_seismisch
                ) VALUES (
                    %(asteroid_id)s, %(asteroid_naam)s, %(diameter_min)s, %(diameter_max)s, %(snelheid_kmu)s,
                    %(land_naam)s, %(land_populatie)s, %(land_oppervlakte)s, %(lat)s, %(lng)s,
                    %(energie_joules)s, %(energie_megaton)s, %(magnitude)s,
                    %(slachtoffers)s, %(sl_direct)s, %(sl_thermisch)s, %(sl_shockgolf)s, %(sl_seismisch)s, %(sl_overig)s,
                    %(vernietigde_opp)s, %(procent_land)s, %(extinction_event)s, %(richter_label)s,
                    %(r_vuurbal)s, %(r_zware_vern)s, %(r_matige_vern)s, %(r_thermisch)s, %(r_lichte_schade)s, %(r_seismisch)s
                )
            """, data)
            inserted_id = cur.lastrowid
        conn.commit()
        conn.close()
        return inserted_id
    except Exception as e:
        print(f"[DB opslaan fout] {e}")
        return 0


# ── Bestanden/cache helpers ────────────────────────────────────────────────

def get_files_dir():
    d = os.path.join(os.path.dirname(__file__), "files")
    os.makedirs(d, exist_ok=True)
    return d


def get_img_dir():
    d = os.path.join(get_files_dir(), "img")
    os.makedirs(d, exist_ok=True)
    return d


_POLL_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "image/webp,image/jpeg,image/*",
}


def download_afbeelding(poll_url: str, bestandsnaam: str) -> str:
    """Download één Pollinations.AI afbeelding, sla op, geef lokaal pad terug.
    Val terug op de externe URL als downloaden mislukt."""
    lokaal = os.path.join(get_img_dir(), bestandsnaam)
    if os.path.exists(lokaal) and os.path.getsize(lokaal) > 5_000:
        return f"/api/img/{bestandsnaam}"
    try:
        resp = requests.get(poll_url, headers=_POLL_HEADERS, timeout=120)
        if resp.ok and "image" in resp.headers.get("Content-Type", ""):
            with open(lokaal, "wb") as f:
                f.write(resp.content)
            return f"/api/img/{bestandsnaam}"
    except Exception as e:
        print(f"[img download] {bestandsnaam}: {e}")
    return poll_url  # fallback: directe externe URL


# Asteroïden cache

def get_cache_path():
    return os.path.join(get_files_dir(), "nabije_asteroid.json")


def read_cache():
    try:
        with open(get_cache_path(), "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}


def write_cache():
    start_date = (datetime.today() - timedelta(days=6)).strftime("%Y-%m-%d")
    resp = requests.get(
        "https://api.nasa.gov/neo/rest/v1/feed",
        params={"start_date": start_date, "api_key": api_key},
        timeout=30,
    )
    if not resp.ok:
        raise RuntimeError(f"NASA API fout: {resp.status_code}")
    neo_data = resp.json()["near_earth_objects"]
    objecten = [a for datum, lijst in neo_data.items() for a in lijst]
    cache_data = {"objecten": objecten, "timestamp": datetime.now().strftime("%d%m%Y%H%M")}
    with open(get_cache_path(), "w") as f:
        json.dump(cache_data, f, indent=4)
    return cache_data


def get_valid_cache():
    cache = read_cache()
    if not cache:
        return write_cache()
    try:
        if datetime.now().date() != datetime.strptime(cache["timestamp"], "%d%m%Y%H%M").date():
            return write_cache()
    except ValueError:
        return write_cache()
    return cache


# Landen cache

def get_landen_cache_path():
    return os.path.join(get_files_dir(), "landen.json")


def read_landen_cache():
    try:
        with open(get_landen_cache_path(), "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}


def haal_world_bank_populatie():
    try:
        resp = requests.get(
            "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL"
            "?format=json&per_page=300&mrv=1",
            timeout=20,
        )
        records = resp.json()[1] or [] if resp.ok else []
        return {r["country"]["id"]: r["value"] for r in records if r.get("value")}
    except Exception:
        return {}


def write_landen_cache():
    resp = requests.get(
        "https://restcountries.com/v3.1/all?fields=name,population,area,cca2,ccn3,latlng,capital",
        timeout=30,
    )
    if not resp.ok:
        raise RuntimeError(f"REST Countries fout: {resp.status_code}")
    landen = resp.json()
    wb = haal_world_bank_populatie()
    data = []
    for land in landen:
        area   = land.get("area") or 1
        iso2   = land.get("cca2", "")
        ccn3   = land.get("ccn3", "")
        pop    = wb.get(iso2) or land.get("population") or 0
        latlng = land.get("latlng") or [0, 0]
        cap    = land.get("capital") or []
        data.append({
            "naam":       land["name"]["common"],
            "populatie":  pop,
            "oppervlakte": area,
            "dichtheid":  round(pop / area, 1),
            "ccn3":       ccn3,
            "lat":        latlng[0] if len(latlng) > 0 else 0,
            "lng":        latlng[1] if len(latlng) > 1 else 0,
            "hoofdstad":  cap[0] if cap else land["name"]["common"],
            "bron":       "World Bank" if iso2 in wb else "REST Countries",
        })
    cache_data = {"landen": data, "timestamp": datetime.now().strftime("%d%m%Y%H%M")}
    with open(get_landen_cache_path(), "w") as f:
        json.dump(cache_data, f, indent=4)
    return cache_data


def get_valid_landen_cache():
    cache = read_landen_cache()
    if not cache:
        return write_landen_cache()
    try:
        if datetime.now().date() != datetime.strptime(cache["timestamp"], "%d%m%Y%H%M").date():
            return write_landen_cache()
    except ValueError:
        return write_landen_cache()
    return cache


# ── Berekeningsfuncties ────────────────────────────────────────────────────

def extract_asteroide_data(asteroid):
    naam = asteroid["name"]
    d = asteroid["estimated_diameter"]["meters"]
    ca = asteroid["close_approach_data"][0]["relative_velocity"]
    return (
        naam,
        d["estimated_diameter_min"],
        d["estimated_diameter_max"],
        float(ca["kilometers_per_hour"]),
        float(ca["kilometers_per_second"]),
        asteroid["is_potentially_hazardous_asteroid"],
    )


def bereken_impactenergie(asteroid):
    _, d_min, d_max, _, v_kms, _ = extract_asteroide_data(asteroid)
    r = ((d_min + d_max) / 2) / 2
    massa = (4 / 3) * math.pi * r**3 * 3000
    return 0.5 * massa * (v_kms * 1000) ** 2


def bereken_impact_zones(joules, magnitude):
    """Bereken de radii van de impactzones in km (geschaald vanuit Hiroshima)."""
    scale = (joules / HIROSHIMA_JOULES) ** (1 / 3)
    R = 1.4 * scale  # basisradius (~5 psi lethal zone) in km

    def area(r):
        return round(math.pi * r ** 2, 1)

    vuurbal_r       = round(0.12 * R, 3)
    zware_vern_r    = round(0.35 * R, 3)
    matige_vern_r   = round(R,        3)
    thermisch_r     = round(1.5 * R,  3)
    lichte_schade_r = round(2.5 * R,  3)
    # Seismische zone gebaseerd op magnitude
    seismisch_r = round(max(80 * 10 ** ((magnitude - 7) / 2), lichte_schade_r * 2), 3)

    return {
        "vuurbal":        {"radius_km": vuurbal_r,       "area_km2": area(vuurbal_r),       "kleur": "#ef4444", "label": "Vuurbal"},
        "zware_vern":     {"radius_km": zware_vern_r,    "area_km2": area(zware_vern_r),    "kleur": "#f97316", "label": "Zware verwoesting"},
        "matige_vern":    {"radius_km": matige_vern_r,   "area_km2": area(matige_vern_r),   "kleur": "#f59e0b", "label": "Matige verwoesting"},
        "thermisch":      {"radius_km": thermisch_r,     "area_km2": area(thermisch_r),     "kleur": "#ec4899", "label": "Thermische zone"},
        "lichte_schade":  {"radius_km": lichte_schade_r, "area_km2": area(lichte_schade_r), "kleur": "#3b82f6", "label": "Lichte schade"},
        "seismisch":      {"radius_km": seismisch_r,     "area_km2": area(seismisch_r),     "kleur": "#8b5cf6", "label": "Seismische zone"},
    }


def bereken_slachtoffers_zones(zones, populatie, dichtheid):
    """Slachtoffers per zone, uitgesplitst naar oorzaak."""
    def pop_ring(r_out, r_in=0):
        return math.pi * (r_out**2 - r_in**2) * dichtheid

    rv  = zones["vuurbal"]["radius_km"]
    rzv = zones["zware_vern"]["radius_km"]
    rmv = zones["matige_vern"]["radius_km"]
    rth = zones["thermisch"]["radius_km"]
    rls = zones["lichte_schade"]["radius_km"]
    rse = zones["seismisch"]["radius_km"]

    sl_direct    = min(pop_ring(rzv),         populatie) * 0.92
    sl_thermisch = min(pop_ring(rth, rzv),    populatie) * 0.40
    sl_shockgolf = min(pop_ring(rls, rth),    populatie) * 0.12
    sl_seismisch = min(pop_ring(rse, rls),    populatie) * 0.03
    sl_overig    = (sl_direct + sl_thermisch + sl_shockgolf + sl_seismisch) * 0.07

    return {
        "direct":    round(sl_direct),
        "thermisch": round(sl_thermisch),
        "shockgolf": round(sl_shockgolf),
        "seismisch": round(sl_seismisch),
        "overig":    round(sl_overig),
        "totaal":    round(sl_direct + sl_thermisch + sl_shockgolf + sl_seismisch + sl_overig),
    }


def humanize_nl(g):
    g = float(g)
    if g >= 1e18: return f"{g/1e18:.2f} triljoen"
    if g >= 1e15: return f"{g/1e15:.2f} biljard"
    if g >= 1e12: return f"{g/1e12:.2f} biljoen"
    if g >= 1e9:  return f"{g/1e9:.2f} miljard"
    if g >= 1e6:  return f"{g/1e6:.2f} miljoen"
    return f"{g:,.0f}"


# ── Flask routes ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/asteroids")
def get_asteroids():
    try:
        cache = get_valid_cache()
        result = []
        for a in cache["objecten"]:
            naam, d_min, d_max, snelheid, _, gevaarlijk = extract_asteroide_data(a)
            afstand = float(a["close_approach_data"][0]["miss_distance"]["kilometers"])
            massa = round((4/3) * math.pi * (((d_min+d_max)/2)/2)**3 * 3000)
            result.append({
                "id": a["id"], "naam": naam,
                "diameter_min": round(d_min, 0), "diameter_max": round(d_max, 0),
                "snelheid": round(snelheid, 0), "afstand": round(afstand, 0),
                "gevaarlijk": gevaarlijk, "massa_kg": massa,
            })
        return jsonify({"data": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/countries")
def get_countries():
    try:
        return jsonify({"data": get_valid_landen_cache()["landen"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/simulate", methods=["POST"])
def simulate():
    body = request.get_json()
    asteroid_id  = body.get("asteroid_id")
    country_name = body.get("country_name")
    try:
        cache = get_valid_cache()
        asteroid = next((a for a in cache["objecten"] if a["id"] == asteroid_id), None)
        if not asteroid:
            return jsonify({"error": "Asteroïde niet gevonden"}), 404

        landen_cache = get_valid_landen_cache()
        land = next((l for l in landen_cache["landen"] if l["naam"] == country_name), None)
        if not land:
            return jsonify({"error": "Land niet gevonden"}), 404

        naam_land       = land["naam"]
        populatie       = land.get("populatie") or 0
        oppervlakte_land = land.get("oppervlakte") or 1
        dichtheid       = populatie / oppervlakte_land
        lat             = land.get("lat", 0)
        lng             = land.get("lng", 0)

        naam_astro, d_min, d_max, snelheid_kmu, snelheid_kms, gevaarlijk = extract_asteroide_data(asteroid)

        joules          = bereken_impactenergie(asteroid)
        megaton_tnt     = joules / MEGATON_TNT_JOULE
        aantal_bommen   = joules / HIROSHIMA_JOULES
        magnitude       = (math.log10(joules) - 4.8) / 1.5
        ratio_chicxulub = joules / CHICXULUB_ENERGY
        extinction_event = ratio_chicxulub >= 1

        richter_cat = next(
            (s for s in richter_schaal_data if s["min_magnitude"] <= magnitude <= s["max_magnitude"]),
            None,
        )

        # Schade totaal
        vernietigde_opp = (joules / HIROSHIMA_JOULES) * 13
        if extinction_event:
            slachtoffers     = WORLD_POP
            procent_land     = 100.0
            totaal_vernietigd = True
        elif vernietigde_opp >= oppervlakte_land:
            extra = (vernietigde_opp - oppervlakte_land) * dichtheid
            slachtoffers     = min(populatie + extra, WORLD_POP)
            procent_land     = 100.0
            totaal_vernietigd = True
        else:
            procent_land     = (vernietigde_opp / oppervlakte_land) * 100
            slachtoffers     = (procent_land / 100) * populatie
            totaal_vernietigd = False

        # Impactzones
        zones = bereken_impact_zones(joules, magnitude)

        # Slachtoffers per zone
        sl_zones = bereken_slachtoffers_zones(zones, populatie, dichtheid)

        # Hiroshima tekst
        if aantal_bommen <= 1:
            hiroshima_tekst = f"{(aantal_bommen * 100):.2f}% van de Hiroshima bom"
        else:
            hiroshima_tekst = f"{humanize_nl(aantal_bommen)} × de Hiroshima bom"

        # Massa asteroïde
        r_astro = ((d_min + d_max) / 2) / 2
        massa_kg = round((4/3) * math.pi * r_astro**3 * 3000)

        # Opslaan in DB
        simulation_id = sla_simulatie_op({
            "asteroid_id": asteroid_id, "asteroid_naam": naam_astro,
            "diameter_min": d_min, "diameter_max": d_max, "snelheid_kmu": snelheid_kmu,
            "land_naam": naam_land, "land_populatie": populatie,
            "land_oppervlakte": oppervlakte_land, "lat": lat, "lng": lng,
            "energie_joules": joules, "energie_megaton": round(megaton_tnt, 4),
            "magnitude": round(magnitude, 2), "slachtoffers": sl_zones["totaal"],
            "sl_direct": sl_zones["direct"], "sl_thermisch": sl_zones["thermisch"],
            "sl_shockgolf": sl_zones["shockgolf"], "sl_seismisch": sl_zones["seismisch"],
            "sl_overig": sl_zones["overig"],
            "vernietigde_opp": round(vernietigde_opp, 2),
            "procent_land": round(procent_land, 2),
            "extinction_event": int(extinction_event),
            "richter_label": richter_cat["label"] if richter_cat else "",
            "r_vuurbal":      zones["vuurbal"]["radius_km"],
            "r_zware_vern":   zones["zware_vern"]["radius_km"],
            "r_matige_vern":  zones["matige_vern"]["radius_km"],
            "r_thermisch":    zones["thermisch"]["radius_km"],
            "r_lichte_schade":zones["lichte_schade"]["radius_km"],
            "r_seismisch":    zones["seismisch"]["radius_km"],
        })

        return jsonify({
            "asteroide": {
                "id": asteroid_id, "naam": naam_astro,
                "diameter_min": round(d_min, 0), "diameter_max": round(d_max, 0),
                "snelheid_kmu": round(snelheid_kmu, 0), "massa_kg": massa_kg,
            },
            "land": {
                "naam": naam_land, "populatie": populatie,
                "oppervlakte": oppervlakte_land, "lat": lat, "lng": lng,
            },
            "energie": {
                "joules": joules, "joules_leesbaar": humanize_nl(joules),
                "megaton_tnt": round(megaton_tnt, 2), "hiroshima_tekst": hiroshima_tekst,
            },
            "chicxulub": {"ratio": ratio_chicxulub, "extinction_event": extinction_event},
            "magnitude": round(magnitude, 2),
            "richter": richter_cat,
            "schade": {
                "vernietigde_oppervlakte": round(vernietigde_opp, 2),
                "procent_van_land": round(procent_land, 2),
                "slachtoffers": sl_zones["totaal"],
                "totaal_land_vernietigd": totaal_vernietigd,
                "wereldbevolking_vernietigd": sl_zones["totaal"] >= WORLD_POP * 0.99,
            },
            "zones": zones,
            "slachtoffers_zones": sl_zones,
            "simulation_id": simulation_id,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/simulations")
def get_simulations():
    try:
        limit = int(request.args.get("limit", 20))
        conn = db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM simulations ORDER BY created_at DESC LIMIT %s", (limit,)
            )
            rows = cur.fetchall()
        conn.close()
        for row in rows:
            if isinstance(row.get("created_at"), datetime):
                row["created_at"] = row["created_at"].strftime("%Y-%m-%d %H:%M:%S")
        return jsonify({"data": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/cache/refresh", methods=["POST"])
def refresh_cache():
    try:
        write_cache()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/random/asteroid")
def random_asteroid():
    try:
        cache = get_valid_cache()
        a = random.choice(cache["objecten"])
        naam, d_min, d_max, snelheid, _, gevaarlijk = extract_asteroide_data(a)
        afstand = float(a["close_approach_data"][0]["miss_distance"]["kilometers"])
        massa = round((4/3) * math.pi * (((d_min+d_max)/2)/2)**3 * 3000)
        return jsonify({
            "id": a["id"], "naam": naam,
            "diameter_min": round(d_min, 0), "diameter_max": round(d_max, 0),
            "snelheid": round(snelheid, 0), "afstand": round(afstand, 0),
            "gevaarlijk": gevaarlijk, "massa_kg": massa,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/db/status")
def db_status():
    try:
        conn = db_connect()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as n FROM simulations")
            n = cur.fetchone()["n"]
        conn.close()
        return jsonify({"ok": True, "simulations": n})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


# ── Artikel generatie ─────────────────────────────────────────────────────

def bouw_afbeelding_url(sim: dict) -> str:
    """Bouwt een Pollinations.AI URL voor een impact-afbeelding (volledig gratis, geen API-sleutel)."""
    land = sim["land_naam"]
    ext = sim.get("extinction_event", 0)

    if ext:
        prompt = (
            f"cinematic aerial photograph of catastrophic asteroid impact on Earth, "
            f"enormous fireball explosion visible from space, glowing shockwave spreading across {land}, "
            f"massive mushroom cloud, apocalyptic destruction, dramatic lighting, photorealistic, "
            f"8k ultra-detailed, breaking news photography style"
        )
    else:
        d_avg = (sim["diameter_min"] + sim["diameter_max"]) / 2
        if d_avg > 500:
            prompt = (
                f"dramatic aerial news photograph of massive asteroid impact crater in {land}, "
                f"huge explosion fireball, smoke and fire, destroyed landscape, shockwave visible, "
                f"cinematic lighting, photorealistic, breaking news"
            )
        else:
            prompt = (
                f"dramatic aerial photograph of asteroid impact explosion in {land}, "
                f"large fireball and mushroom cloud, smoke rising high into atmosphere, "
                f"destruction visible from above, photorealistic, cinematic, news photography"
            )

    encoded = urllib.parse.quote(prompt)
    seed = (sim.get("id", 1) * 37) % 99999  # reproduceerbare seed per simulatie
    return (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=900&height=480&seed={seed}&nologo=true&model=flux-schnell"
    )


def bouw_stad_afbeelding_url(sim: dict) -> str:
    """Tweede afbeelding: de hoofdstad van het getroffen land in puin."""
    stad = sim.get("hoofdstad") or sim["land_naam"]
    land = sim["land_naam"]
    d_avg = (sim["diameter_min"] + sim["diameter_max"]) / 2

    if d_avg > 1000 or sim.get("extinction_event"):
        prompt = (
            f"photorealistic aerial photograph of {stad} {land} completely obliterated by asteroid impact, "
            f"total annihilation, massive crater where the city once stood, fires, ash clouds, "
            f"apocalyptic destruction, ultra detailed, cinematic"
        )
    elif d_avg > 300:
        prompt = (
            f"photorealistic street-level photograph of {stad} {land} destroyed by asteroid shockwave, "
            f"collapsed buildings, rubble and debris everywhere, fires burning, smoke filling the sky, "
            f"cars overturned, dramatic devastation, news photography style, hyper realistic"
        )
    else:
        prompt = (
            f"photorealistic photograph of central {stad} {land} heavily damaged by asteroid impact shockwave, "
            f"broken windows, partially collapsed facades, dust and debris in streets, "
            f"emergency services on scene, dramatic lighting, news photography"
        )

    encoded = urllib.parse.quote(prompt)
    seed = (sim.get("id", 1) * 73 + 42) % 99999
    return (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width=900&height=500&seed={seed}&nologo=true&model=flux-schnell"
    )


def bouw_artikel_prompt(sim: dict) -> str:
    """Bouwt een gedetailleerde prompt voor het krantenartikel."""
    ext = "JA — dit is een extinctie-niveau event vergelijkbaar met de Chicxulub-inslag!" if sim.get("extinction_event") else "Nee"
    hiroshima_x = round(sim["energie_joules"] / 6.3e13, 1)
    return f"""Schrijf een fictief dramatisch krantenartikel in het Nederlands over de volgende asteroïde-inslag simulatie.

## SIMULATIEGEGEVENS

**Asteroïde:**
- Naam: {sim['asteroid_naam']}
- Diameter: {sim['diameter_min']:.0f}–{sim['diameter_max']:.0f} meter
- Snelheid: {sim['snelheid_kmu']:,.0f} km/u bij inslag

**Impact locatie:** {sim['land_naam']}
- Bevolking: {sim['land_populatie']:,} inwoners
- Landoppervlak: {sim['land_oppervlakte']:,.0f} km²

**Impact kracht:**
- Energie: {sim['energie_megaton']:.2f} megaton TNT
- Vergelijking: {hiroshima_x:,.0f}× de atoombom op Hiroshima
- Richter magnitude: {sim['magnitude']} ({sim['richter_label']})
- Extinctie-event: {ext}

**Schade:**
- Verwoest oppervlak: {sim['vernietigde_opp']:,.0f} km² ({sim['procent_land']:.1f}% van {sim['land_naam']})
- Totale slachtoffers: {sim['slachtoffers']:,}
  - Directe explosie: {sim['sl_direct']:,}
  - Thermische straling: {sim['sl_thermisch']:,}
  - Shockgolf: {sim['sl_shockgolf']:,}
  - Seismisch: {sim['sl_seismisch']:,}
  - Overige oorzaken: {sim['sl_overig']:,}

**Impact zones (radius):**
- Vuurbal: {sim['r_vuurbal']:.1f} km
- Zware verwoesting: {sim['r_zware_vern']:.1f} km
- Thermische zone: {sim['r_thermisch']:.1f} km
- Seismische zone: {sim['r_seismisch']:.1f} km

---

## VEREIST FORMAAT

Schrijf het artikel als volgt (gebruik exacte Markdown-opmaak):

# [KRANTENKOP IN HOOFDLETTERS — dramatisch, max 10 woorden]

**[Ondertitel — één zin die de impact samenvat]**

*Astro Nieuws Redactie — [verzin een plaatsnaam dicht bij het impactgebied], [verzin een datum in de nabije toekomst]*

[Lead-alinea: meest cruciale feiten, journalistiek stijl, 3-4 zinnen]

[Tweede alinea: details over de kracht van de inslag en de eerste momenten — levendig en dramatisch beschreven]

[Derde alinea: de menselijke impact — slachtoffers, verwoesting, vluchtelingen — humaniseer de getallen]

[Vierde alinea: vergelijking met historische events zoals Hiroshima, Tsjeljabinsk, of Chicxulub]

[Vijfde alinea: fictieve citaten van een wetenschapper en een overheidswoordvoerder]

[Slotalinea: vooruitzicht en oproep — wat nu?]

---

Schrijf ALLEEN het artikel zelf (geen uitleg, geen meta-commentaar). Houd het journalistiek, dramatisch en meeslepend. Lengte: 400-550 woorden."""


# Fictieve wetenschappers en leiders per regio — zodat het artikel niet altijd Nederlands klinkt
_REGIO_NAMEN = {
    "Africa":        ("dr. K. Osei, Universiteit van Nairobi", "President A. Mensah"),
    "Asia":          ("prof. H. Tanaka, Universiteit van Tokio", "Minister-president L. Wei"),
    "Europe":        ("dr. S. Müller, ETH Zürich", "Premier J. Dupont"),
    "Americas":      ("prof. C. Rivera, MIT", "President M. Johnson"),
    "Oceania":       ("dr. B. Walsh, Universiteit van Sydney", "Premier T. Brown"),
    "Middle East":   ("prof. F. Al-Hassan, Universiteit van Caïro", "Minister-president A. Ibrahim"),
}
_AFRIKAANSE_LANDEN = {"Nigeria","Ethiopia","Egypt","Kenya","South Africa","Ghana","Tanzania",
                       "Mozambique","Madagascar","Cameroon","Zimbabwe","Zambia","Senegal","Mali",
                       "Angola","Niger","Burkina Faso","Sudan","Algeria","Morocco","Tunisia","Libya"}
_AZIATISCHE_LANDEN = {"China","India","Japan","Indonesia","Pakistan","Bangladesh","Philippines",
                       "Vietnam","Thailand","Myanmar","South Korea","Malaysia","Nepal","Sri Lanka"}
_MIDDEN_OOSTEN     = {"Iran","Iraq","Saudi Arabia","Turkey","Syria","Yemen","Jordan","Israel",
                       "Lebanon","United Arab Emirates","Qatar","Kuwait"}
_OCEANIE           = {"Australia","New Zealand","Papua New Guinea","Fiji"}
_AMERICAS          = {"United States","Brazil","Mexico","Colombia","Argentina","Peru","Chile",
                       "Venezuela","Canada","Bolivia","Ecuador","Guatemala"}

def _regio(land: str) -> str:
    if land in _AFRIKAANSE_LANDEN: return "Africa"
    if land in _AZIATISCHE_LANDEN: return "Asia"
    if land in _MIDDEN_OOSTEN:     return "Middle East"
    if land in _OCEANIE:           return "Oceania"
    if land in _AMERICAS:          return "Americas"
    return "Europe"


def genereer_demo_artikel(sim: dict) -> str:
    """Genereert een lokaal demo-artikel zonder API-aanroep."""
    def h(n):
        n = int(n)
        if n >= 1_000_000_000: return f"{n/1e9:.1f} miljard"
        if n >= 1_000_000:     return f"{n/1e6:.1f} miljoen"
        if n >= 1_000:         return f"{n/1e3:.0f} duizend"
        return str(n)

    def fmt(n): return f"{int(n):,}".replace(",", ".")

    land          = sim["land_naam"]
    regio         = _regio(land)
    weten, leider = _REGIO_NAMEN.get(regio, _REGIO_NAMEN["Europe"])
    hiroshima_x   = round(sim["energie_joules"] / 6.3e13, 1)
    ext           = sim.get("extinction_event", 0)
    magnitude     = float(sim.get("magnitude", 0))
    richter_label = sim.get("richter_label", "onbekend")
    land_vernietigd = float(sim.get("procent_land", 0)) >= 99.9

    sl_totaal = int(sim["sl_direct"]) + int(sim["sl_thermisch"]) + int(sim["sl_shockgolf"]) + int(sim["sl_seismisch"]) + int(sim["sl_overig"])

    # Kies een buitenlandse wetenschapper als het getroffen land vernietigd is
    # of als de inslag zo groot is dat de lokale overheid niet meer bestaat
    if land_vernietigd or sl_totaal >= 500_000_000:
        # Gebruik een wetenschapper uit een ANDER werelddeel
        andere_regio = next(
            (r for r in ["Europe", "Americas", "Asia", "Africa", "Oceania"] if r != regio),
            "Europe"
        )
        weten_int, _ = _REGIO_NAMEN.get(andere_regio, _REGIO_NAMEN["Europe"])
        citaat_wetenschap = f'*"De omvang van de verwoesting in {land} is onvoorstelbaar. We hebben nog nooit iets dergelijks geregistreerd op seismografen,"* aldus {weten_int}.'
        if land_vernietigd:
            citaat_autoriteit = (
                f'VN-secretaris-generaal A. Guterres riep een mondiale noodvergadering bijeen: '
                f'*"Het land {land} bestaat niet meer. Dit is een humanitaire catastrofe zonder precedent. '
                f'De internationale gemeenschap moet alles in het werk stellen om overlevenden te bereiken."*'
            )
        else:
            _, leider_int = _REGIO_NAMEN.get(andere_regio, _REGIO_NAMEN["Europe"])
            citaat_autoriteit = (
                f'{leider_int} bood namens zijn land onmiddellijk hulp aan: '
                f'*"We stellen al onze middelen beschikbaar voor het getroffen volk. '
                f'Dit overstijgt grenzen — dit is een catastrofe voor de hele mensheid."*'
            )
    else:
        citaat_wetenschap = (
            f'*"{sim["asteroid_naam"]} had een vermogen dat vergelijkbaar is met duizenden nucleaire wapens tegelijk,"* '
            f'aldus {weten}. *"De impact op het ecosysteem zal nog decennia voelbaar zijn."*'
        )
        citaat_autoriteit = (
            f'{leider} richtte zich in een spoedtoespraak tot de bevolking: '
            f'*"We staan voor een catastrofe van historische omvang. Alle beschikbare middelen worden ingezet '
            f'voor redding en herstel."*'
        )

    # Omschrijving van tektonische gevolgen op basis van magnitude
    if magnitude >= 10:
        seismische_gevolgen = (
            f"De seismische activiteit bereikte een magnitude van **{magnitude}** — een niveau dat nooit eerder "
            f"in de menselijke geschiedenis is geregistreerd. Volgens de schaal van Richter verschuiven op dit niveau "
            f"tektonische platen meetbaar, kunnen continenten van vorm veranderen en is de rotatieas van de aarde "
            f"mogelijk permanent verschoven. Seismografen wereldwijd registreerden de schokgolven gelijktijdig."
        )
    elif magnitude >= 9:
        seismische_gevolgen = (
            f"De seismische activiteit bereikte een magnitude van **{magnitude}** (*{richter_label}*). "
            f"Op dit niveau verschuiven tektonische platen, kunnen eilandformaties veranderen en zijn de "
            f"seismische golven tot op de andere kant van de aarde voelbaar. "
            f"Kusttsunamis van tientallen meters hoogte worden verwacht."
        )
    elif magnitude >= 8:
        seismische_gevolgen = (
            f"De seismische activiteit bereikte een magnitude van **{magnitude}** (*{richter_label}*). "
            f"Vrijwel alle gebouwen in het getroffen gebied zijn ingestort; vloedgolven tot 40 meter "
            f"hoogte zijn mogelijk langs de kustlijn."
        )
    else:
        seismische_gevolgen = (
            f"De seismische activiteit registreerde een magnitude van **{magnitude}** (*{richter_label}*). "
            f"De schokgolf was tot op honderden kilometers afstand voelbaar en deed gebouwen instorten "
            f"ver buiten de directe impactzone."
        )

    # --- Extinctie of quasi-extinctie: geen normale krant mogelijk ---
    if ext or sl_totaal >= 2_000_000_000:
        return f"""# ⚠ LAATSTE TRANSMISSIE — VERBINDING VALT WEG

**Systeem: Astro Nieuws Noodnet — Signaalsterkte kritiek**

---

*Astro Nieuws Noodredactie — onbekende locatie, datum onbekend*

Dit bericht wordt verzonden vanaf een noodsysteem op een onbekende locatie. Reguliere communicatie-infrastructuur is wereldwijd uitgevallen.

**{sim['energie_megaton']:,.0f} megaton TNT** vrijgekomen bij de inslag van **{sim['asteroid_naam']}**. Magnitude **{magnitude}** geregistreerd. {seismische_gevolgen}

Geschatte slachtoffers: **meer dan {h(sl_totaal)}**.

De internationale hulpcoördinatie is gestaakt. Overheden zijn niet meer bereikbaar.

Dit is het laatste bericht van Astro Nieuws. Moge deze transmissie iemand bereiken.

— *Redactie Astro Nieuws, onbekende locatie*

---
*⚠ Demo-artikel · Bij een extinctie-event is er geen journalist meer over om verslag te doen.*"""

    # --- Normaal artikel ---
    kop = f"ASTEROÏDE TREFT {land.upper()}: MASSALE VERWOESTING"
    ondertitel = (
        f"Object met diameter {sim['diameter_min']:.0f}–{sim['diameter_max']:.0f} m "
        f"sloeg in met {sim['energie_megaton']:.0f} megaton TNT — magnitude {magnitude}"
    )

    # Slotzin afhankelijk van ernst
    if land_vernietigd:
        slot = (
            f"Het getroffen gebied is voor lange tijd onbewoonbaar. "
            f"Stofwolken in de stratosfeer zullen de komende maanden de zonnestraling wereldwijd beïnvloeden. "
            f"De wederopbouw van {land} — voor zover dat nog mogelijk is — zal generaties duren."
        )
    elif magnitude >= 9:
        slot = (
            f"Wetenschappers waarschuwen dat de tektonische naschokken nog weken zullen aanhouden. "
            f"Stofwolken in de stratosfeer kunnen de komende maanden de mondiale landbouwproductie treffen. "
            f"De wederopbouw zal naar schatting tientallen jaren duren."
        )
    else:
        slot = (
            f"Onderzoekers waarschuwen dat de gevolgen van de inslag nog weken aanhouden. "
            f"Stofwolken in de stratosfeer kunnen de komende maanden de zonnestraling beperken. "
            f"De wederopbouw zal naar schatting jaren tot tientallen jaren duren."
        )

    return f"""# {kop}

**{ondertitel}**

---

*Astro Nieuws Redactie — {land}, 14 november 2026*

Een asteroïde met de naam **{sim['asteroid_naam']}** heeft {land} getroffen met een verwoestende kracht die wetenschappers omschrijven als ongekend in de moderne geschiedenis. De inslag vond plaats in de vroege ochtend en heeft een oppervlakte van {fmt(sim['vernietigde_opp'])} km² verwoest — goed voor {sim['procent_land']:.1f}% van het landoppervlak.

De vrijgekomen energie bedroeg **{sim['energie_megaton']:.0f} megaton TNT** — het equivalent van {fmt(hiroshima_x)} atoombommen van het type dat op Hiroshima werd afgeworpen. {seismische_gevolgen}

Hulporganisaties schatten het totale dodental op circa **{h(sl_totaal)}**. Daarvan kwamen {h(sim['sl_direct'])} mensen direct om het leven in de vuurbal en explosie. Nog eens {h(sim['sl_thermisch'])} slachtoffers bezweken aan de thermische straling binnen een straal van {sim['r_thermisch']:.0f} km. De shockgolf eiste {h(sim['sl_shockgolf'])} levens, terwijl {h(sim['sl_seismisch'])} mensen omkwamen door seismische naschokken tot op {sim['r_seismisch']:.0f} km van het epicentrum.

{citaat_wetenschap} De Chicxulub-inslag van 66 miljoen jaar geleden, die de dinosaurussen uitroeide, had een vergelijkbare oorsprong — zij het met een miljoenen maal grotere energie.

{citaat_autoriteit} De VN heeft een spoedvergadering bijeengeroepen; tientallen landen hebben hulpteams gemobiliseerd.

{slot}

*Demo-artikel op basis van simulatiedata · Activeer de Anthropic API-sleutel voor door Claude geschreven artikelen.*"""


@app.route("/api/article/generate", methods=["POST"])
def generate_article():
    use_demo = not anthropic_client

    body = request.get_json()
    sim_id = body.get("simulation_id")
    if not sim_id:
        return jsonify({"error": "simulation_id vereist"}), 400

    try:
        conn = db_connect()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM simulations WHERE id = %s", (sim_id,))
            sim = cur.fetchone()
        conn.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if not sim:
        return jsonify({"error": "Simulatie niet gevonden"}), 404

    # Haal hoofdstad op uit landen-cache en voeg toe aan sim-dict
    try:
        landen_cache = get_valid_landen_cache()
        land_data = next((l for l in landen_cache["landen"] if l["naam"] == sim["land_naam"]), {})
        sim["hoofdstad"] = land_data.get("hoofdstad", sim["land_naam"])
    except Exception:
        sim["hoofdstad"] = sim["land_naam"]

    image_url      = bouw_afbeelding_url(sim)
    city_image_url = bouw_stad_afbeelding_url(sim)

    def sla_artikel_op(full_text, sim_id):
        lines = full_text.lstrip().split('\n')
        kop = lines[0].lstrip('#').strip() if lines else sim['asteroid_naam']
        inhoud = '\n'.join(lines[1:]).strip() if len(lines) > 1 else full_text
        conn = db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO articles (simulation_id, kop, inhoud, image_url, city_image_url) VALUES (%s, %s, %s, %s, %s)",
                (sim_id, kop[:490], inhoud, image_url, city_image_url),
            )
            article_id = cur.lastrowid
        conn.commit()
        conn.close()
        return article_id

    def stream_artikel():
        full_text = ""
        try:
            # ── Stap 1: stream de artikeltekst ──────────────────────────────
            if use_demo:
                artikel = genereer_demo_artikel(sim)
                chunk = ""
                for i, word in enumerate(artikel.split(' ')):
                    chunk += word + ' '
                    if (i + 1) % 4 == 0 or i == len(artikel.split(' ')) - 1:
                        full_text += chunk
                        yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
                        chunk = ""
                        time.sleep(0.04)
            else:
                with anthropic_client.messages.stream(
                    model="claude-opus-4-8",
                    max_tokens=1500,
                    thinking={"type": "adaptive"},
                    system=(
                        "Je bent een senior journalist bij het fictieve Nederlandse nieuwsagentschap 'Astro Nieuws BV'. "
                        "Je schrijft dramatische, meeslepende nieuwsartikelen over astronomische catastrofes. "
                        "Schrijf altijd in het Nederlands. Gebruik journalistieke taal: actieve zinnen, korte alinea's, "
                        "concrete details. Het artikel is volledig fictief maar gebaseerd op echte fysische berekeningen."
                    ),
                    messages=[{"role": "user", "content": bouw_artikel_prompt(sim)}],
                ) as stream:
                    for text in stream.text_stream:
                        full_text += text
                        yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"

            # ── Stap 2: sla artikel op en stuur "tekst klaar" event ─────────
            article_id = sla_artikel_op(full_text, sim_id)
            yield f"data: {json.dumps({'article_done': True, 'article_id': article_id, 'demo': use_demo, 'hoofdstad': sim.get('hoofdstad', '')})}\n\n"

            # ── Stap 3: download afbeelding 1 server-side ───────────────────
            yield f"data: {json.dumps({'img_status': 'Luchtfoto downloaden via Pollinations.AI…'})}\n\n"
            bestand1 = f"art_{article_id}_1.jpg"
            lokaal1  = download_afbeelding(image_url, bestand1)
            yield f"data: {json.dumps({'img1_url': lokaal1})}\n\n"

            # ── Stap 4: download afbeelding 2 server-side ───────────────────
            yield f"data: {json.dumps({'img_status': 'Stadsverwoesting downloaden via Pollinations.AI…'})}\n\n"
            bestand2 = f"art_{article_id}_2.jpg"
            lokaal2  = download_afbeelding(city_image_url, bestand2)
            yield f"data: {json.dumps({'img2_url': lokaal2, 'done': True})}\n\n"

        except anthropic_sdk.AuthenticationError:
            yield f"data: {json.dumps({'error': 'Ongeldige Anthropic API-sleutel. Controleer het .env bestand.'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        stream_with_context(stream_artikel()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/article/<int:sim_id>")
def get_article(sim_id):
    try:
        conn = db_connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM articles WHERE simulation_id = %s ORDER BY generated_at DESC LIMIT 1",
                (sim_id,),
            )
            art = cur.fetchone()
        conn.close()
        if not art:
            return jsonify({"error": "Geen artikel gevonden"}), 404
        if isinstance(art.get("generated_at"), datetime):
            art["generated_at"] = art["generated_at"].strftime("%Y-%m-%d %H:%M:%S")
        return jsonify(art)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/img/<path:filename>")
def serve_img(filename):
    return send_from_directory(get_img_dir(), filename)


# ── Startup ────────────────────────────────────────────────────────────────

init_db()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
