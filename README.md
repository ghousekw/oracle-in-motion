# Oracle in Motion

An animated Oracle Database & Enterprise Linux learning platform in Hinglish, with synced Hindi voice-over, interactive captions, full in-browser Oracle 23ai SQL/PLSQL/DBA and Linux Bash simulators, and cloud-synced learner progress.

## Courses (8 Courses · 284 Lessons)

1. **SQL Basics** (62 lessons) — querying, filtering, joins, grouping, subqueries, set operators, `PIVOT`/`UNPIVOT`, DDL, data types, constraints, DML, views, indexes, synonyms, sequences.
2. **Functions** (38 lessons) — comparison (`NVL`, `COALESCE`, `DECODE`), string & regex, date/timezone, aggregate (`LISTAGG`), analytic (`ROW_NUMBER`, `RANK`, `LAG`/`LEAD`, `NTILE`).
3. **PL/SQL** (31 lessons) — blocks, conditionals, loops, `SELECT INTO`, exceptions, records, cursors (`REF CURSOR`, `FOR UPDATE`), procedures/functions, packages, triggers, collections.
4. **Python + Oracle** (7 lessons) — `python-oracledb`, connection pooling, bind variables, cursors, transactions, batch inserts.
5. **Oracle Forms 12c** (24 lessons) — architecture, triggers, data blocks, canvases, LOVs, alerts, parameters, WebLogic deployment.
6. **Oracle Reports 12c** (15 lessons) — data models, repeating frames, formula/summary/placeholder columns, lexical parameters, Reports Server.
7. **DBA** (35 lessons) — instance & SGA architecture, Listener (`lsnrctl`), `STARTUP`/`SHUTDOWN`, tablespaces, users/privileges/roles/profiles, External Tables, `sqlldr`, Data Pump (`expdp`/`impdp`), DB links, troubleshooting.
8. **Linux: Zero to Expert** (36 lessons) — Enterprise architecture, filesystem hierarchy, bash commands, file manipulation, grep/sed/awk log analysis, pipes/redirection, user/group management, permissions & sudoers, process management & system monitoring (`ps`, `top`, `free`, `vmstat`, `systemd`, `journalctl`), storage/mounts/LVM, networking (`ip`, `ss`, `lsof`, `curl`, `ssh`), package management, crontab automation, enterprise hardening & real-life production incident troubleshooting on virtual host `prod-db01`.

## Key Features

- **Animated SVG Stage + Synced Voice-Over**: Step-by-step diagrams with sentence-level audio sync (click any sentence in captions to seek directly), adjustable speed, Auto-Next mode, and inline Hinglish glossary tooltips.
- **Dual-Engine Playground**:
  - **In-Browser Oracle Simulator (`SIM`)**:
    - Pre-seeded `OT` sample schema (12 tables) + interactive **ER Diagram (`ER Map`)** with 1-click `JOIN` builders.
    - Expandable **Schema Explorer** with `PK`/`FK`/`NN` column badges and DBA object inspector (Tablespaces, Users, Roles, Profiles, DB Links, Directories).
    - Interactive **Result Grid** (with `NULL` pills and 1-click `Copy CSV`) + classic `SQL*Plus` text toggle.
    - **SQL Autocomplete** (`Tab` / `Ctrl+Space`), **Session Switcher** (`OT` ↔ `SYS AS SYSDBA`), multi-statement task grading, and **2-step Progressive Hints** across all runnable tasks.
  - **In-Browser Stateful Linux Bash Simulator (`LINUX_SIM`)**:
    - Virtual enterprise production host (`prod-db01`) with full Linux directory tree (`/home/oracle`, `/var/log`, `/etc`, `/u01/app/oracle`, `/tmp`).
    - 60+ real Linux CLI commands, pipelines (`|`), redirects (`>`, `>>`, `2>`, `2>&1`), compound statements (`if`, `for`, `while`), and environment variables.
    - Automated task judge verifying exit codes, file inodes, and command outputs for all 36 lessons.
- **Profile, Revision & Certificates**: Streaks, XP levels, personal notes, bookmarks, missed-question **Revision + 10-question Rapid-Fire Mock Test**, printable course certificates across all 8 courses, JSON backup, and optional Supabase cloud sync.
- **Installable PWA & Offline Support**: `manifest.webmanifest` + `sw.js` (network-first app shell, Range-aware MP3 voice caching).

## Layout

- `public/index.html` — lightweight 15 KB HTML shell for instant first paint.
- `public/app.css` — core styling & responsive layout.
- `public/motion.js` — SVG motion graphics engine (`Motion`).
- `public/sim.js` — in-browser Oracle SQL/PLSQL/DBA simulator (`SIM`).
- `public/lessons-oracle.js` — 248 Oracle curriculum lessons (`COURSES`, `LESSONS`).
- `public/linux.js` — in-browser stateful Linux Bash simulator (`LINUX_SIM`) and 36 Linux lessons.
- `public/audio-map.js` — synced voice-over sprite timestamps and sentence offsets (`AUDIO`, `AUDIO2`).
- `public/app.js` — main player, interactive captions, audio sync, and playground controller.
- `public/profile.js` & `public/profile.css` — learner profile, cloud sync, revision/mock quiz, notes, and certificates.
- `public/voice/` — one MP3 voice sprite per lesson (`248` MP3 files, including `lx-*.mp3`).
- `public/sw.js` & `public/manifest.webmanifest` — PWA offline & stale-while-revalidate caching (`oim-shell-v5`).
- `netlify.toml` — publishes `public/` directly with no build step.

## Run locally

```bash
cd public
python -m http.server 8080
```

Then open http://localhost:8080.
