# MOSS — Modular Otaku Scoring System

MOSS is a **highly customizable, spreadsheet‑based media tracking and analytics system** focused on Japanese and East Asian media (anime-first).

It is designed for users who want **more control than MAL / AniList**, without giving up automation, analytics, or extensibility.

Note that AI was heavily used in the creation of this project. Namely the functions, formulas, and documentation as these are skills I'm not adept in. Everything made by AI has been read over and likely modified by me however.

---

## What is MOSS?

MOSS is not just a watchlist.

It is a **modular data system** built in Google Sheets that lets you:

* Track anime with fine-grained control
* Compute personal analytics (counts, hours, averages, weighted scores)
* Generate recommendation signals based on your own viewing habits
* Extend or replace parts of the system without breaking everything

Think of it as:

> *A personal anime data engine, not a website clone.*

---

## Core Design Philosophy

MOSS is built around **clear ownership, minimal overlap, and predictable data flow**.

Rather than one monolithic spreadsheet, MOSS is intentionally split across two cooperating spreadsheets, each with a narrowly defined role.

### Spreadsheet roles

**MetaData spreadsheet**

* Holds *canonical, shared data*
* Contains:

  * `AnimeMetaData`
  * `DataTables`
* Acts as the single source of truth for anime facts and normalized IDs

**UserList spreadsheet**

* Holds *personal and derived data*
* Contains:

  * `Settings`
  * `AnimeUserList`
  * `AnimeDataMerged` (Meta + User join)
  * `DataTables_All` (lookup tables + analytics)

This split allows MetaData to remain stable and reusable, while UserList stays highly customizable and user‑specific.

### Design outcomes

This structure enables:

* Safe automation without formula loss
* Incremental syncing instead of full rebuilds
* Clear separation between facts, preferences, and analytics
* Aggressive customization without cascading breakage

---

## Sync System (Automation‑Safe)

MOSS uses Google Apps Script to synchronize data **without overwriting formulas or user logic**.

Three core sync functions handle all data movement:

* `syncMData_To_AnimeData` — MetaData → AnimeDataMerged
* `syncUserList_To_AnimeData` — AnimeUserList → AnimeDataMerged
* `syncDTables_To_UList` — MetaData DataTables → DataTables_All

Each function:

* Has explicit column ownership
* Writes only to allowed fields
* Supports incremental updates via timestamps

This design avoids the most common spreadsheet automation failure: **accidentally converting formulas into static values**.

---

## Analytics & Scoring

MOSS computes personal analytics automatically using your viewing history.

Core analytics include:

* **User Count** — how often a tag appears in your list
* **User Hours** — total watch time associated with a tag
* **User Mean Score** — average score you gave

These feed into a **Weighted Score**, which:

* Uses a neutral anchor (50)
* Expands as watch time increases
* Reduces volatility for low‑data tags

In addition, **each individual anime** is scored on a **1–100 scale** in `AnimeUserList`, allowing tag analytics and recommendations to reflect your personal ranking style.

All weighting behavior can be tuned from the **Settings** sheet.

---

## Recommendation System

MOSS includes a **transparent, user‑controlled recommendation model**.

Rather than a black box, it uses:

* Weighted tag scores (decade, genre, studio, franchise, etc.)
* User‑defined weights
* Additive recommendation values

Results:

* Fully explainable
* Fully customizable
* Easy to tweak or replace

---

## Modular by Design

You can:

* Remove the Dashboard entirely
* Replace recommendation logic
* Add new analytics columns
* Extend to manga, games, or other media

MOSS does not assume a single "correct" workflow.

---

## Who is MOSS for?

MOSS is ideal if you:

* Want more control than existing anime trackers
* Enjoy spreadsheets and systems
* Care about explainable recommendations
* Like tuning and experimenting

It is **not** designed to be:

* A social platform
* A hosted service
* A one‑click solution

---

## Requirements

* Google Sheets
* Google Apps Script enabled
* Basic spreadsheet literacy

No external services required.

---

## Repository Structure (WIP)

```text
/scripts        Apps Script sync + analytics
/templates      Starter spreadsheets
/docs           Design notes and explanations
```

---

## Status

MOSS is under active development.

Expect:

* Breaking changes
* Schema evolution
* New analytics

Stability will improve over time.

---

## Why the name MOSS?

MOSS stands for **Modular Otaku Scoring System**.

The name reflects the system’s focus on modularity, personal scoring, and Japanese media—without tying it to a single platform or workflow.

---

## License

MIT License

---

If you’re interested in extending or adapting MOSS, feel free to explore and experiment.
