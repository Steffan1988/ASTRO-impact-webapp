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

CHICXULUB_ENERGY          = 1e23
WORLD_POP                 = int(8.2e9)
BEWOONBAAR_OPPERVLAK      = 104_000_000
TOTAAL_OPPERVLAKTE_AARDE  = 510_100_000
HIROSHIMA_JOULES          = 6.3e13
MEGATON_TNT_JOULE         = 4.184e15
KILOTON_TNT_JOULE         = 4.184e12

# Collins impact model constants (Collins, Melosh & Marcus 2005)
EARTH_GRAVITY             = 9.81    # m/s²
ATMOS_SCALE_HEIGHT        = 8400    # m
SURFACE_AIR_DENSITY       = 1.225   # kg/m³

TARGET_DENSITIES = {
    "rock":  2500,  # kg/m³ — crystalline/sedimentary rock
    "ocean": 1026,  # kg/m³ — seawater
    "soft":  1700,  # kg/m³ — loose sediment/soil
}

COMPOSITION_DATA = {
    "cometary": {"density": 1000, "strength": 1e4},
    "stony":    {"density": 3000, "strength": 3e6},
    "iron":     {"density": 8000, "strength": 5e8},
}

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
                ("image_url",       "TEXT AFTER inhoud"),
                ("city_image_url",  "TEXT AFTER image_url"),
                ("impact_angle",    "FLOAT DEFAULT 45 AFTER r_seismisch"),
                ("composition",     "VARCHAR(20) DEFAULT 'stony' AFTER impact_angle"),
                ("target_type",     "VARCHAR(20) DEFAULT 'rock' AFTER composition"),
                ("airburst",        "TINYINT(1) DEFAULT 0 AFTER target_type"),
                ("airburst_alt_km", "FLOAT DEFAULT 0 AFTER airburst"),
                ("crater_km",       "FLOAT DEFAULT 0 AFTER airburst_alt_km"),
                ("city_naam",       "VARCHAR(255) DEFAULT '' AFTER lng"),
            ]:
                for tbl in ("simulations", "articles"):
                    try:
                        cur.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} {definition}")
                    except Exception:
                        pass
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB init fout] {e}")
        return False


def sla_simulatie_op(data: dict) -> int:
    try:
        conn = db_connect()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO simulations (
                    asteroid_id, asteroid_naam, diameter_min, diameter_max, snelheid_kmu,
                    land_naam, land_populatie, land_oppervlakte, lat, lng,
                    city_naam,
                    energie_joules, energie_megaton, magnitude,
                    slachtoffers, sl_direct, sl_thermisch, sl_shockgolf, sl_seismisch, sl_overig,
                    vernietigde_opp, procent_land, extinction_event, richter_label,
                    r_vuurbal, r_zware_vern, r_matige_vern, r_thermisch, r_lichte_schade, r_seismisch,
                    impact_angle, composition, target_type, airburst, airburst_alt_km, crater_km
                ) VALUES (
                    %(asteroid_id)s, %(asteroid_naam)s, %(diameter_min)s, %(diameter_max)s, %(snelheid_kmu)s,
                    %(land_naam)s, %(land_populatie)s, %(land_oppervlakte)s, %(lat)s, %(lng)s,
                    %(city_naam)s,
                    %(energie_joules)s, %(energie_megaton)s, %(magnitude)s,
                    %(slachtoffers)s, %(sl_direct)s, %(sl_thermisch)s, %(sl_shockgolf)s, %(sl_seismisch)s, %(sl_overig)s,
                    %(vernietigde_opp)s, %(procent_land)s, %(extinction_event)s, %(richter_label)s,
                    %(r_vuurbal)s, %(r_zware_vern)s, %(r_matige_vern)s, %(r_thermisch)s, %(r_lichte_schade)s, %(r_seismisch)s,
                    %(impact_angle)s, %(composition)s, %(target_type)s, %(airburst)s, %(airburst_alt_km)s, %(crater_km)s
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


def collins_impact_model(diameter_m, density_kgm3, velocity_kms, angle_deg, target_type="rock"):
    """
    Fysisch impactmodel gebaseerd op gepubliceerde literatuur:
      - Collins, Melosh & Marcus (2005) — MAPS 40(6), 817-840  [energie, krater, seismisch]
      - Holsapple (1993) — J. Geophys. Res.  [kraterskalering]
      - Glasstone & Dolan (1977)             [luchtgolfdruk, thermische straling]
      - Melosh (1989) — Impact Cratering      [atmosferische intrede]
    """
    v_ms    = velocity_kms * 1000
    d       = float(diameter_m)
    rho_i   = float(density_kgm3)
    rho_t   = TARGET_DENSITIES.get(target_type, 2500)
    theta   = math.radians(max(5.0, float(angle_deg)))
    g       = EARTH_GRAVITY

    # Impactorsterkte op basis van compositie
    if rho_i >= 6000:   strength = 5e8  # ijzermeteoriet
    elif rho_i >= 2000: strength = 3e6  # steenachtig
    else:               strength = 1e4  # komeetachtig

    # Massa (bol)
    mass_kg = rho_i * (math.pi / 6.0) * d**3

    # Kinetische energie (J)
    E_total = 0.5 * mass_kg * v_ms**2

    # ── Atmosferische intrede ─────────────────────────────────────────────
    # Empirisch gekalibreerde kritieke diameter voor grondinslag
    # Gebaseerd op Chyba et al. (1993) + Collins et al. (2005) casestudies
    # Chelyabinsk (2013): 20m steen, 19 km/s, 18° → airburst ✓
    # Tunguska (1908):    60m komeet, 27 km/s, 40° → airburst/grond grens
    # Barringer (50 ka):  50m ijzer,  12 km/s, 45° → grondimpact ✓
    v_ref   = 20_000.0  # m/s referentie
    t_fac   = (math.sin(theta) / math.sin(math.radians(45)))**0.30
    v_fac   = (v_ms / v_ref)**0.50

    if rho_i < 1500:
        d_crit = 180.0 * t_fac * v_fac   # komeetachtig
    elif rho_i < 5000:
        d_crit = 40.0  * t_fac * v_fac   # steenachtig
    else:
        d_crit = 15.0  * t_fac * v_fac   # ijzerhoudend

    if d < d_crit:
        airburst            = True
        airburst_altitude_m = min(ATMOS_SCALE_HEIGHT * 2.0 * (d_crit / d)**0.5, 80_000)
    else:
        airburst            = False
        airburst_altitude_m = 0.0

    # Energie die de grond bereikt
    if airburst:
        z_norm    = airburst_altitude_m / ATMOS_SCALE_HEIGHT
        E_surface = E_total * math.exp(-z_norm * 0.35)
    else:
        E_surface = E_total * 0.82

    # ── Kraterdiameter (Collins eq.22 / Holsapple 1993) ───────────────────
    if not airburst:
        # Transiënte kraterdiameter (m) — Collins et al. 2005 eq.22
        D_tr = 1.161 * (rho_i / rho_t)**(1/3) * d**0.78 * v_ms**0.44 * g**(-0.22) * math.sin(theta)**(1/3)
        # Overgang eenvoudig→complex (~3,2 km voor aardse rotsbodem)
        D_sc = 3200.0  # m
        D_final = D_tr if D_tr <= D_sc else D_sc * (D_tr / D_sc)**1.13
        crater_depth_m = D_final / 5.0
    else:
        D_tr = D_final = crater_depth_m = 0.0

    # ── Seismische magnitude (Collins et al. 2005, eq.14) ─────────────────
    E_mt = E_total / MEGATON_TNT_JOULE
    M_s  = (0.67 * math.log10(max(E_mt, 1e-20)) + 5.87) if E_mt > 0 else 0.0

    # ── Thermische straling (empirische kernwapenschaling, Glasstone & Dolan 1977) ──
    # Gekalibreerd: Hiroshima 15 kt → ~2 km, 1 Mt → ~5 km, Tunguska 15 Mt → ~22 km
    Y_kt_therm = max(E_total / KILOTON_TNT_JOULE, 1e-9)
    if airburst:
        r_therm_km = 0.30 * Y_kt_therm**0.40   # airburst ≈ nucleaire luchtburst
    else:
        r_therm_km = 0.165 * Y_kt_therm**0.40  # grondburst: minder thermisch bereik
    r_therm_m = r_therm_km * 1000

    # ── Luchtgolfdruk (Brode 1955 / Glasstone & Dolan nucleaire schaling) ─
    Y_kt = max(E_surface / KILOTON_TNT_JOULE, 1e-9)
    Yk3  = Y_kt**(1/3)
    r_689kPa_km  = 0.29 * Yk3   # 100 psi — betonnen gebouwen vernietigd
    r_138kPa_km  = 0.49 * Yk3   # 20 psi  — bijna alle gebouwen vernietigd
    r_34kPa_km   = 0.74 * Yk3   # 5 psi   — houten gebouwen vernietigd
    r_69kPa_km   = 0.58 * Yk3   # 10 psi  — (tussenwaarde)
    r_7kPa_km    = 1.55 * Yk3   # 1 psi   — glasbreuk, trommelvliesschade

    # Seismische zone
    r_seis_km = max(80 * 10**((M_s - 7) / 2) if M_s > 4 else r_7kPa_km * 1.5, r_7kPa_km * 2)

    # Vuurbalstraal
    r_fireball_km = max(0.002 * E_surface**(1/3) / 1000, D_final / 2000)

    def z(r): return round(r, 3)
    def a(r): return round(math.pi * r**2, 1)

    zones = {
        "vuurbal": {
            "radius_km": z(r_fireball_km), "area_km2": a(r_fireball_km),
            "kleur": "#ef4444",
            "label": "Vuurbal" + (" / Krater" if not airburst else " (Airburst)"),
            "beschrijving": (
                f"Totale vaporisatie. Krater Ø {D_final/1000:.1f} km, diepte {crater_depth_m/1000:.2f} km."
                if not airburst else
                f"Airburst op ~{airburst_altitude_m/1000:.0f} km hoogte. Complete thermische destructie."
            ),
        },
        "zware_vern": {
            "radius_km": z(r_138kPa_km), "area_km2": a(r_138kPa_km),
            "kleur": "#f97316",
            "label": "Zware verwoesting (138 kPa)",
            "beschrijving": "Overpressure >138 kPa. Versterkt beton ingestort. Sterftekans >90%.",
        },
        "matige_vern": {
            "radius_km": z(r_34kPa_km), "area_km2": a(r_34kPa_km),
            "kleur": "#f59e0b",
            "label": "Matige verwoesting (34 kPa)",
            "beschrijving": "Overpressure >34 kPa. Houten gebouwen vernietigd. Sterftekans ~50%.",
        },
        "thermisch": {
            "radius_km": z(r_therm_m / 1000), "area_km2": a(r_therm_m / 1000),
            "kleur": "#ec4899",
            "label": "Thermische zone (3e-graads)",
            "beschrijving": "Thermische fluëntie >300 kJ/m². 3e-graads brandwonden. Sterftekans ~40%.",
        },
        "lichte_schade": {
            "radius_km": z(r_7kPa_km), "area_km2": a(r_7kPa_km),
            "kleur": "#3b82f6",
            "label": "Lichte schade (7 kPa)",
            "beschrijving": "Overpressure >7 kPa. Glasbreuk, trommelvliesschade, kans op letsel ~5%.",
        },
        "seismisch": {
            "radius_km": z(r_seis_km), "area_km2": a(r_seis_km),
            "kleur": "#8b5cf6",
            "label": f"Seismische zone (M {M_s:.1f})",
            "beschrijving": f"Seismische schokgolf M {M_s:.1f}. Instortingsrisico voor zwakke constructies.",
        },
    }

    return {
        "energy_joules":         E_total,
        "energy_joules_surface": E_surface,
        "energy_megatons":       round(E_total / MEGATON_TNT_JOULE, 6),
        "mass_kg":               round(mass_kg),
        "airburst":              airburst,
        "airburst_altitude_km":  round(airburst_altitude_m / 1000, 1),
        "crater_diameter_km":    round(D_final / 1000, 3),
        "crater_depth_km":       round(crater_depth_m / 1000, 3),
        "seismic_magnitude":     round(max(0.0, M_s), 2),
        "fireball_radius_km":    round(r_fireball_km, 3),
        "zones":                 zones,
        "model_ref":             "Collins et al. (2005) · Holsapple (1993) · Glasstone & Dolan (1977)",
    }


def bereken_slachtoffers_collins(zones, populatie, dichtheid):
    """
    Slachtoffer-schatting op basis van Collins blast-zones.
    Mortaliteitsfracties uit: Shuler et al. (2015), nukleaire analogiën (Glasstone & Dolan 1977).
    """
    def schijf(r_buit, r_in=0.0):
        return math.pi * (r_buit**2 - r_in**2) * dichtheid

    rzv = zones["zware_vern"]["radius_km"]
    rth = zones["thermisch"]["radius_km"]
    rls = zones["lichte_schade"]["radius_km"]

    # Mortaliteitsfraken per zone (literatuurgebaseerd)
    sl_direct    = min(schijf(rzv),        populatie) * 0.97   # 138 kPa zone: bijna volledig lethal
    sl_thermisch = min(schijf(rth,  rzv),  populatie) * 0.55   # thermisch + blast 34 kPa
    sl_shockgolf = min(schijf(rls,  rth),  populatie) * 0.07   # lichte schade
    sl_seismisch = min(schijf(rls * 2, rls), populatie) * 0.015
    sl_overig    = (sl_direct + sl_thermisch + sl_shockgolf + sl_seismisch) * 0.06

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
    body         = request.get_json()
    asteroid_id  = body.get("asteroid_id")
    country_name = body.get("country_name")
    angle_deg    = float(body.get("angle", 45))
    composition  = body.get("composition", "stony")
    target_type  = body.get("target_type", "rock")
    vel_override = body.get("velocity_override")
    city_name    = body.get("city_name", "")
    lat_override = body.get("lat_override")
    lng_override = body.get("lng_override")

    try:
        cache   = get_valid_cache()
        asteroid = next((a for a in cache["objecten"] if a["id"] == asteroid_id), None)
        if not asteroid:
            return jsonify({"error": "Asteroïde niet gevonden"}), 404

        landen_cache = get_valid_landen_cache()
        land = next((l for l in landen_cache["landen"] if l["naam"] == country_name), None)
        if not land:
            return jsonify({"error": "Land niet gevonden"}), 404

        naam_land        = land["naam"]
        populatie        = land.get("populatie") or 0
        oppervlakte_land = land.get("oppervlakte") or 1
        dichtheid        = populatie / oppervlakte_land
        lat              = land.get("lat", 0)
        lng              = land.get("lng", 0)
        if lat_override is not None and lng_override is not None:
            lat = float(lat_override)
            lng = float(lng_override)

        naam_astro, d_min, d_max, snelheid_kmu, snelheid_kms, gevaarlijk = extract_asteroide_data(asteroid)

        # Impactorparameters
        d_avg_m   = (d_min + d_max) / 2.0
        comp_data = COMPOSITION_DATA.get(composition, COMPOSITION_DATA["stony"])
        density   = comp_data["density"]
        vel_kms   = float(vel_override) if vel_override else snelheid_kms

        # Collins impact model
        impact = collins_impact_model(d_avg_m, density, vel_kms, angle_deg, target_type)

        joules          = impact["energy_joules"]
        megaton_tnt     = impact["energy_megatons"]
        aantal_bommen   = joules / HIROSHIMA_JOULES
        magnitude       = impact["seismic_magnitude"]
        ratio_chicxulub = joules / CHICXULUB_ENERGY
        extinction_event = ratio_chicxulub >= 1

        richter_cat = next(
            (s for s in richter_schaal_data if s["min_magnitude"] <= magnitude <= s["max_magnitude"]),
            None,
        )

        zones    = impact["zones"]
        sl_zones = bereken_slachtoffers_collins(zones, populatie, dichtheid)

        vernietigde_opp = zones["matige_vern"]["area_km2"]
        if extinction_event:
            slachtoffers      = WORLD_POP
            procent_land      = 100.0
            totaal_vernietigd = True
        elif vernietigde_opp >= oppervlakte_land:
            slachtoffers      = min(populatie * 1.05, float(WORLD_POP))
            procent_land      = 100.0
            totaal_vernietigd = True
        else:
            procent_land      = min(100.0, (vernietigde_opp / oppervlakte_land) * 100)
            slachtoffers      = sl_zones["totaal"]
            totaal_vernietigd = False

        if aantal_bommen <= 1:
            hiroshima_tekst = f"{(aantal_bommen * 100):.2f}% van de Hiroshima bom"
        else:
            hiroshima_tekst = f"{humanize_nl(aantal_bommen)} × de Hiroshima bom"

        massa_kg = impact["mass_kg"]

        # USGS aardbeving vergelijking (magnitude match)
        usgs_comparison = None
        try:
            r_usgs = requests.get(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson",
                timeout=4,
            )
            if r_usgs.ok:
                feats = r_usgs.json().get("features", [])
                closest = min(feats, key=lambda q: abs((q["properties"].get("mag") or 0) - magnitude), default=None)
                if closest:
                    p = closest["properties"]
                    usgs_comparison = {
                        "place": p.get("place", ""),
                        "mag":   p.get("mag"),
                        "time":  p.get("time"),
                    }
        except Exception:
            pass

        simulation_id = sla_simulatie_op({
            "asteroid_id": asteroid_id, "asteroid_naam": naam_astro,
            "diameter_min": d_min, "diameter_max": d_max, "snelheid_kmu": snelheid_kmu,
            "land_naam": naam_land, "land_populatie": populatie,
            "land_oppervlakte": oppervlakte_land, "lat": lat, "lng": lng,
            "city_naam": city_name,
            "energie_joules": joules, "energie_megaton": round(megaton_tnt, 6),
            "magnitude": round(magnitude, 2), "slachtoffers": sl_zones["totaal"],
            "sl_direct": sl_zones["direct"], "sl_thermisch": sl_zones["thermisch"],
            "sl_shockgolf": sl_zones["shockgolf"], "sl_seismisch": sl_zones["seismisch"],
            "sl_overig": sl_zones["overig"],
            "vernietigde_opp":  round(vernietigde_opp, 2),
            "procent_land":     round(procent_land, 2),
            "extinction_event": int(extinction_event),
            "richter_label":    richter_cat["label"] if richter_cat else "",
            "r_vuurbal":        zones["vuurbal"]["radius_km"],
            "r_zware_vern":     zones["zware_vern"]["radius_km"],
            "r_matige_vern":    zones["matige_vern"]["radius_km"],
            "r_thermisch":      zones["thermisch"]["radius_km"],
            "r_lichte_schade":  zones["lichte_schade"]["radius_km"],
            "r_seismisch":      zones["seismisch"]["radius_km"],
            "impact_angle":     angle_deg,
            "composition":      composition,
            "target_type":      target_type,
            "airburst":         int(impact["airburst"]),
            "airburst_alt_km":  impact["airburst_altitude_km"],
            "crater_km":        impact["crater_diameter_km"],
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
                "city_naam": city_name,
            },
            "energie": {
                "joules": joules, "joules_leesbaar": humanize_nl(joules),
                "megaton_tnt": round(megaton_tnt, 4), "hiroshima_tekst": hiroshima_tekst,
            },
            "chicxulub": {"ratio": ratio_chicxulub, "extinction_event": extinction_event},
            "magnitude":  round(magnitude, 2),
            "richter":    richter_cat,
            "schade": {
                "vernietigde_oppervlakte": round(vernietigde_opp, 2),
                "procent_van_land":        round(procent_land, 2),
                "slachtoffers":            sl_zones["totaal"],
                "totaal_land_vernietigd":  totaal_vernietigd,
                "wereldbevolking_vernietigd": sl_zones["totaal"] >= WORLD_POP * 0.99,
            },
            "zones":            zones,
            "slachtoffers_zones": sl_zones,
            "simulation_id":    simulation_id,
            "impact_params": {
                "angle":              angle_deg,
                "composition":        composition,
                "target_type":        target_type,
                "density_kgm3":       density,
                "velocity_kms":       round(vel_kms, 2),
                "airburst":           impact["airburst"],
                "airburst_alt_km":    impact["airburst_altitude_km"],
                "crater_diameter_km": impact["crater_diameter_km"],
                "crater_depth_km":    impact["crater_depth_km"],
                "model_ref":          impact["model_ref"],
            },
            "usgs_comparison": usgs_comparison,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/nasa/fireballs")
def get_fireballs():
    """NASA Center for Near Earth Object Studies — Fireball/Bolide database."""
    try:
        resp = requests.get(
            "https://ssd-api.jpl.nasa.gov/fireball.api",
            params={"limit": 15, "sort": "energy", "order": "desc"},
            timeout=8,
        )
        if not resp.ok:
            return jsonify({"error": "NASA Fireball API niet beschikbaar"}), 502
        data   = resp.json()
        fields = data.get("fields", [])
        result = []
        for rec in data.get("data", []):
            d = dict(zip(fields, rec))
            result.append({
                "date":          d.get("date", ""),
                "energy_kt":     float(d.get("energy") or 0),
                "impact_e_kt":   float(d.get("impact-e") or 0),
                "lat":           d.get("lat"),
                "lng":           d.get("lon"),
                "alt_km":        float(d.get("alt") or 0),
                "vel_kms":       float(d.get("vel") or 0),
                "radiated_j":    float(d.get("radiated") or 0),
            })
        return jsonify({"data": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/usgs/earthquakes")
def get_usgs_earthquakes():
    """USGS Earthquake Hazards — recente significante aardbevingen voor vergelijking."""
    try:
        resp = requests.get(
            "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson",
            timeout=6,
        )
        if not resp.ok:
            return jsonify({"error": "USGS API niet beschikbaar"}), 502
        feats = resp.json().get("features", [])[:20]
        result = []
        for f in feats:
            p = f["properties"]
            coords = f["geometry"]["coordinates"]
            result.append({
                "place": p.get("place", ""),
                "mag":   p.get("mag"),
                "time":  p.get("time"),
                "url":   p.get("url", ""),
                "lat":   coords[1] if len(coords) > 1 else None,
                "lng":   coords[0] if len(coords) > 0 else None,
            })
        return jsonify({"data": result})
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


@app.route("/api/geocode")
def geocode():
    q       = request.args.get("q", "").strip()
    country = request.args.get("country", "").strip()
    if not q or len(q) < 2:
        return jsonify({"results": []})
    try:
        search_q = f"{q}, {country}" if country else q
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": search_q, "format": "json", "limit": 6, "addressdetails": 1},
            headers={"User-Agent": "ASTRO-impact/3.0 (educational simulation)"},
            timeout=5,
        )
        results = []
        for r in resp.json():
            addr = r.get("address", {})
            naam = (addr.get("city") or addr.get("town") or addr.get("village") or
                    addr.get("municipality") or r.get("display_name", "").split(",")[0]).strip()
            results.append({
                "naam":    naam,
                "display": r.get("display_name", ""),
                "lat":     float(r["lat"]),
                "lng":     float(r["lon"]),
                "type":    r.get("type", ""),
            })
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e), "results": []})


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
    hiroshima_x  = round(sim["energie_joules"] / 6.3e13, 1)
    ext          = sim.get("extinction_event", 0)
    airburst     = sim.get("airburst", 0)
    crater       = sim.get("crater_km", 0)
    composition  = sim.get("composition", "stony")
    angle        = sim.get("impact_angle", 45)
    target       = sim.get("target_type", "rock")
    airburst_alt = sim.get("airburst_alt_km", 0)
    city_naam    = sim.get("city_naam", "").strip()
    lat          = sim.get("lat", 0)
    lng          = sim.get("lng", 0)

    comp_nl   = {"cometary": "komeet", "stony": "steenachtige asteroïde", "iron": "ijzermeteoriet"}.get(composition, "asteroïde")
    target_nl = {"rock": "vaste grond", "ocean": "oceaan", "soft": "zachte bodem"}.get(target, "grond")
    ext_str   = "JA — dit is een extinctie-niveau catastrofe, vergelijkbaar met de Chicxulub-inslag!" if ext else "Nee"
    airburst_str = f"JA — airburst op {airburst_alt:.0f} km hoogte" if airburst else "Nee"

    sl_totaal = int(sim.get("sl_direct", 0)) + int(sim.get("sl_thermisch", 0)) + \
                int(sim.get("sl_shockgolf", 0)) + int(sim.get("sl_seismisch", 0)) + int(sim.get("sl_overig", 0))

    if city_naam:
        impact_locatie = f"{city_naam}, {sim['land_naam']}"
        geo_instructie = f"""
EXACT IMPACTPUNT: {city_naam}, {sim['land_naam']}
Coördinaten: {lat:.3f}°N, {lng:.3f}°E

⚠ VERPLICHTE GEOGRAFISCHE INSTRUCTIE:
Gebruik je ingebouwde geografische kennis om in het artikel CONCRETE, ECHTE plaatsnamen te noemen.
Bereken voor elke radius welke echte steden, dorpen, provincies, regio's en bekende locaties
BINNEN die straal vanuit {city_naam} liggen:

  • Vuurbalzone ({sim['r_vuurbal']:.1f} km radius): Wat staat er letterlijk op de inslagplek? Welke wijken/buurten worden vaporiseerd?
  • Zware verwoesting ({sim['r_zware_vern']:.1f} km radius): Welke steden en dorpen zijn VOLLEDIG vernietigd?
  • Matige verwoesting ({sim['r_matige_vern']:.1f} km radius): Welke grotere steden ondervinden zware schade?
  • Seismisch ({sim['r_seismisch']:.1f} km radius): Tot hoe ver reikt de schokgolf? Welke grote steden zijn voelbaar geraakt?

Schrijf ZO SPECIFIEK MOGELIJK. "De provincie Groningen is van de kaart geveegd.
Tot aan Utrecht staan er geen gebouwen meer overeind." is goed. Generieke beschrijvingen zijn NIET goed.
"""
    else:
        impact_locatie = sim['land_naam']
        geo_instructie = f"""
IMPACTLOCATIE: {sim['land_naam']} (coördinaten: {lat:.1f}°N, {lng:.1f}°E)
Noem in het artikel concrete steden en regio's van {sim['land_naam']} die door elke schaderadius worden getroffen.
"""

    return f"""Je bent een senior journalist van het Nederlandse nieuwsagentschap "Astro Nieuws BV".
Schrijf een MEESLEPEND, CINEMATISCH en GEDETAILLEERD fictief nieuwsartikel over de volgende gesimuleerde asteroïde-inslag.

═══════════════════════ SIMULATIEGEGEVENS ═══════════════════════

IMPACTOR:
- Naam: {sim['asteroid_naam']}
- Type: {comp_nl}
- Diameter: {sim['diameter_min']:.0f}–{sim['diameter_max']:.0f} meter
- Snelheid: {sim['snelheid_kmu']:,.0f} km/u ({sim['snelheid_kmu']/3600:.1f} km/s)
- Invalshoek: {angle:.0f}° ten opzichte van horizon
- Doelwit: {target_nl}

{geo_instructie}

IMPACTKRACHT (Collins et al. 2005 model):
- Vrijgekomen energie: {sim['energie_megaton']:.2f} megaton TNT
- Vergelijking Hiroshima: {hiroshima_x:,.0f}×
- Richter magnitude: {sim['magnitude']} ({sim['richter_label']})
- Airburst: {airburst_str}
{"- Kraterdiameter: " + str(round(crater, 1)) + " km" if crater > 0.1 else ""}
- Extinctie-event: {ext_str}

SCHADE:
- Verwoest oppervlak: {sim['vernietigde_opp']:,.0f} km² ({sim['procent_land']:.1f}% van {sim['land_naam']})
- TOTALE SLACHTOFFERS: {sl_totaal:,}
  • Directe explosie/blast: {sim['sl_direct']:,}
  • Thermische straling: {sim['sl_thermisch']:,}
  • Shockgolf: {sim['sl_shockgolf']:,}
  • Seismisch: {sim['sl_seismisch']:,}
  • Overige oorzaken: {sim['sl_overig']:,}

═══════════════════════ SCHRIJFINSTRUCTIES ═══════════════════════

Structuur (gebruik EXACTE Markdown-opmaak):

# [KRANTENKOP — VERPLICHT IN HOOFDLETTERS, dramatisch, max 12 woorden, geen punt]

**[Korte ondertitel — één zin, de kern van de ramp]**

---

*Astro Nieuws Redactie — [fictieve stad nabij impactgebied], [fictieve datum nabije toekomst]*

**[BREAKING LEAD — 2-3 zinnen: het meest schokkende feit vooraan. Concrete getallen. Begin met impact-moment.]**

[TWEEDE ALINEA — De eerste seconden: beschrijf sensorisch de lichtflits, schokgolf, hitte. Wetenschappelijk maar cinematisch.]

[DERDE ALINEA — VERWOESTING: gebruik de bovenstaande geografische instructie en NOEM EXPLICTIET echte plaatsnamen per schadezone. "De vuurbal met een straal van X km verwoestte [concrete plaatsen]. Binnen de zwaar-verwoestingszone van Y km lagen [concrete steden/dorpen]. Tot Z km afstand — tot [bekende stad] — stonden geen gebouwen meer overeind."]

[VIERDE ALINEA — Historische context: vergelijk specifiek met Tsjeljabinsk (2013), Tunguska (1908) of Chicxulub.]

[VIJFDE ALINEA — TWEE fictieve citaten met specifieke getallen van een impactfysicus en een overheidsfunctionaris.]

[ZESDE ALINEA — Vooruitzicht: hulpverlening, langetermijngevolgen.]

═══════════════════════════════════════════════════════════════════

STIJLGIDS:
- Schrijf ALLEEN in het Nederlands
- Toon: BBC Breaking News × apokalyptische literaire spanning
- Actieve zinnen, korte alinea's, concrete plaatsnamen
- GEEN meta-commentaar, GEEN uitleg buiten het artikel
- Lengte: 500–700 woorden
- Het artikel is 100% fictief maar gebaseerd op echte fysica"""


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
    city_naam     = sim.get("city_naam", "").strip()
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
    if city_naam:
        kop = f"ASTEROÏDE TREFT {city_naam.upper()}: {land.upper()} IN AS"
    else:
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

Een asteroïde met de naam **{sim['asteroid_naam']}** heeft {city_naam + ', ' if city_naam else ''}{land} getroffen met een verwoestende kracht die wetenschappers omschrijven als ongekend in de moderne geschiedenis. De inslag vond plaats in de vroege ochtend en heeft een oppervlakte van {fmt(sim['vernietigde_opp'])} km² verwoest — goed voor {sim['procent_land']:.1f}% van het landoppervlak.

De vrijgekomen energie bedroeg **{sim['energie_megaton']:.0f} megaton TNT** — het equivalent van {fmt(hiroshima_x)} atoombommen van het type dat op Hiroshima werd afgeworpen. {seismische_gevolgen}{f" Het impactpunt in {city_naam} en directe omgeving is volledig verdampt." if city_naam else ""}

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

    # Haal hoofdstad en extra velden op
    try:
        landen_cache = get_valid_landen_cache()
        land_data = next((l for l in landen_cache["landen"] if l["naam"] == sim["land_naam"]), {})
        sim["hoofdstad"] = land_data.get("hoofdstad", sim["land_naam"])
    except Exception:
        sim["hoofdstad"] = sim["land_naam"]

    # Zorg dat nieuwe kolommen bestaan (oudere DB-rijen hebben ze mogelijk niet)
    sim.setdefault("airburst", 0)
    sim.setdefault("airburst_alt_km", 0)
    sim.setdefault("crater_km", 0)
    sim.setdefault("composition", "stony")
    sim.setdefault("impact_angle", 45)
    sim.setdefault("target_type", "rock")

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
