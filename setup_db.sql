-- ============================================================
--  ASTRO-impact  –  Database setup
--  Voer uit met: mysql -u root -p < setup_db.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS astro_impact
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE astro_impact;

-- ── Simulaties ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS simulations (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    created_at        DATETIME        DEFAULT CURRENT_TIMESTAMP,

    -- Asteroïde
    asteroid_id       VARCHAR(20),
    asteroid_naam     VARCHAR(255),
    diameter_min      FLOAT,
    diameter_max      FLOAT,
    snelheid_kmu      FLOAT,

    -- Locatie
    land_naam         VARCHAR(255),
    land_populatie    BIGINT,
    land_oppervlakte  FLOAT,
    lat               FLOAT,
    lng               FLOAT,
    city_naam         VARCHAR(255)    DEFAULT '',

    -- Energie & kracht
    energie_joules    DOUBLE,
    energie_megaton   FLOAT,
    magnitude         FLOAT,

    -- Slachtoffers
    slachtoffers      BIGINT,
    sl_direct         BIGINT,
    sl_thermisch      BIGINT,
    sl_shockgolf      BIGINT,
    sl_seismisch      BIGINT,
    sl_overig         BIGINT,

    -- Schade
    vernietigde_opp   FLOAT,
    procent_land      FLOAT,
    extinction_event  TINYINT(1)      DEFAULT 0,
    richter_label     VARCHAR(100),

    -- Zones (stralen in km)
    r_vuurbal         FLOAT,
    r_zware_vern      FLOAT,
    r_matige_vern     FLOAT,
    r_thermisch       FLOAT,
    r_lichte_schade   FLOAT,
    r_seismisch       FLOAT,

    -- Impact parameters
    impact_angle      FLOAT           DEFAULT 45,
    composition       VARCHAR(20)     DEFAULT 'stony',
    target_type       VARCHAR(20)     DEFAULT 'rock',
    airburst          TINYINT(1)      DEFAULT 0,
    airburst_alt_km   FLOAT           DEFAULT 0,
    crater_km         FLOAT           DEFAULT 0
);

-- ── Krantenartikelen (Claude AI) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS articles (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    simulation_id   INT             NOT NULL,
    kop             VARCHAR(500),
    inhoud          MEDIUMTEXT,
    image_url       TEXT,
    city_image_url  TEXT,
    generated_at    DATETIME        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_article_sim
        FOREIGN KEY (simulation_id)
        REFERENCES simulations(id)
        ON DELETE CASCADE
);

-- ── Indexen ───────────────────────────────────────────────────────────────

CREATE INDEX idx_sim_created   ON simulations (created_at DESC);
CREATE INDEX idx_sim_land      ON simulations (land_naam);
CREATE INDEX idx_sim_asteroid  ON simulations (asteroid_id);
CREATE INDEX idx_art_sim       ON articles    (simulation_id);

-- ── Klaar ─────────────────────────────────────────────────────────────────

SELECT CONCAT('Database aangemaakt: ', DATABASE()) AS status;
SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = 'astro_impact';
