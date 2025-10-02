# ✅ Anime Tracker – Project To-Do List

## 🔁 Core Sync Logic
- [x] Sync selected columns from `UserData!UserAnimeMerged` → `UserList!UserAnimeMerged`
- [x] Auto-update logic based on interval (`UserDataInterval`, `UserDataIntervalTime`)
- [x] Generate dynamic AniList / MAL / AniDB hyperlinks using favicons
- [x] Episode completion sparkline with dynamic coloring
- [x] Episode percentage formula
- [x] Data Completion lookup from `UserAnimeMerged`

---

## 🔄 MetaData → UserData Sync
- [x] Sync `AnimeMetaData` → `AnimeMetaDataLocal`
- [x] Sync `DataTables` from `MetaData!DataTables` → `UserData!DataTables` (replace after `SeasonData`)
- [ ] Add auto-update wrapper for `DataTables` sync
- [ ] Add timestamp logging for `DataTables` sync

---

## 🔀 UserData Merging Logic
- [ ] Merge `AnimeUserList` + `AnimeMetaDataLocal` into `UserAnimeMerged`
  - [ ] Add base metadata columns (titles, IDs, etc.)
  - [ ] Add interpreted fields using `DataTables` (e.g., Format Name, Country Name)
  - [ ] Add episode % and sparkline fields
  - [ ] Add Data Completion % and flag
- [ ] Add logic for `Generated Score` (requires `DataTables` to be complete)

---

## 📊 User Stats and Expansion
- [ ] Write user stats into `DataTables` (e.g., status counts, completion rates)
  - [ ] Wait until `UserAnimeMerged` is finalized
- [ ] Add achievements/tags (e.g., "Watched all Studio Ghibli")

---

## 🧾 UserList Expansion
- [ ] Create `TrackerInfo` or `TrackerExport` sheet in UserList
  - [ ] Clean export version of merged list
  - [ ] Include external ID links
- [ ] Add simplified export formulas (for Notion, apps, etc.)

---

## 🧹 Project Hygiene & UX
- [ ] Create naming conventions:
  - [ ] Sheets (e.g., `User_`, `Meta_`, `Sync_`)
  - [ ] Scripts (e.g., `syncMetaToLocal()`, `mergeUserAnime()`)
  - [ ] Named Ranges (e.g., `Settings_MetaDataURL`)
- [ ] Add manual sync buttons (MetaData, DataTables, Merge)
- [ ] Add sync logging (per event timestamps)
- [ ] Add error handling for missing data or columns
- [ ] Language Options for
  - [ ] Franchise
  - [ ] Country
  - [ ] Seasons

---

## 🧪 Advanced / Optional Features
- [ ] Genre/format breakdown charts
- [ ] Status-based dashboard (e.g., Watching %, Completed)
- [ ] Conditional formatting for Completion or Episode %
- [ ] JSON export via Apps Script
- [ ] Create a specific Debug sheet in UserData
