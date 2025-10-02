# MyOtakuSpreadSheet


TODO
```
Google Sheets Formula Helper said:

Great idea — here’s a complete and structured To-Do List for your Anime Tracker project, organized by functional area and dependencies.

🗂️ Project To-Do List – Anime Tracker System
✅ Core Sync Logic

 Sync selected columns from UserData!UserAnimeMerged → UserList!UserAnimeMerged

 Auto-update logic based on interval (UserDataInterval, UserDataIntervalTime)

 Generate dynamic AniList / MAL / AniDB hyperlinks using favicons

 Episode completion sparkline with dynamic coloring

 Episode percentage formula

 Data Completion lookup from UserAnimeMerged

🔄 MetaData → UserData Sync

 Sync AnimeMetaData → AnimeMetaDataLocal

 Sync DataTables from MetaData!DataTables → UserData!DataTables (replace after SeasonData)

 Add auto-update wrapper for DataTables sync (optional)

 Sync timestamp logging for DataTables

🔀 UserData Merging Logic

 Merge AnimeUserList + AnimeMetaDataLocal into UserAnimeMerged

 Add base metadata columns (titles, IDs, etc.)

 Add interpreted fields using DataTables (e.g., Format Name, Country Name)

 Add episode % and sparkline fields

 Add Data Completion % and flag

 Add logic for “Generated Score” (requires DataTables to be complete)

📊 User Stats and Expansion

 Write user stats into DataTables (e.g., status counts, completion rates)

 Wait until UserAnimeMerged is finalized

 Add achievements or tag logic (e.g., “Watched all Studio Ghibli”)

🧾 UserList Expansion

 Create TrackerInfo or TrackerExport sheet in UserList

 Clean export version of merged list

 Include external ID links

 Add simplified export formulas (for Notion, apps, etc.)

🧹 Project Hygiene & UX

 Create naming conventions for:

 Sheets (e.g., User_, Meta_, Sync_)

 Scripts (e.g., syncMetaToLocal(), mergeUserAnime())

 Named Ranges (e.g., Settings_MetaDataURL)

 Add manual sync buttons (e.g., MetaData Sync, DataTables Sync, Merge Sync)

 Add logging for sync events (timestamped per sync)

 Add error handling for missing columns or invalid lookups

🧪 Extras / Advanced Ideas

 Genre/format breakdown charts (optional)

 Status-based dashboard (e.g., watching, completed %)

 Conditional formatting based on Completion or Episode %

 JSON export (Apps Script-based)
```
