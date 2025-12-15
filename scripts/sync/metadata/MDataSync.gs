function mDataSync() {
  // ==================================================
  // syncMData_To_AnimeData
  // --------------------------------------------------
  // Purpose:
  //   Synchronizes canonical anime metadata from the
  //   MetaData spreadsheet into AnimeDataMerged.
  //
  // Design contract (VERY IMPORTANT):
  //   - This function ONLY writes to META-OWNED columns
  //   - User-entered data and ALL formulas are preserved
  //   - No full-row or full-sheet overwrites are allowed
  //
  // Why this exists:
  //   - MetaData is the single source of truth
  //   - AnimeDataMerged is a hybrid sheet:
  //       * Left side: script-owned metadata
  //       * Right side: user data + formulas
  //
  // Safety rules:
  //   - Never call setValues() on the full sheet
  //   - Never touch non-meta columns
  //   - Always gate updates by Last Updated when possible
  // ==================================================

  const start = Date.now();

  // ==================================================
  // SETUP — Active spreadsheet & settings
  // ==================================================
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName("Settings");
  const targetSheet = ss.getSheetByName("AnimeDataMerged");
  if (!targetSheet) throw new Error('Sheet "AnimeDataMerged" not found.');

  const metaDataURL = settings.getRange("MetaDataURL").getValue();
  const preferredTitleCol = settings.getRange("PreferredTitleLanguage").getValue();

  // ==================================================
  // SOURCE — MetaData.AnimeMetaData (read-only)
  // ==================================================
  const sourceSS = SpreadsheetApp.openById(getIdFromURL(metaDataURL));
  const sourceSheet = sourceSS.getSheetByName("AnimeMetaData");
  if (!sourceSheet) throw new Error('Sheet "AnimeMetaData" not found in MetaData file.');

  const srcData = sourceSheet.getDataRange().getValues();
  const srcHeader = srcData[0];

  const srcIdIdx = srcHeader.indexOf("Anime ID");
  const lastUpdatedIdx = srcHeader.indexOf("Last Updated");
  const titleIdx = srcHeader.indexOf(preferredTitleCol);

  if (srcIdIdx === -1 || lastUpdatedIdx === -1 || titleIdx === -1) {
    throw new Error("Source missing Anime ID / Last Updated / preferred Title column.");
  }

  // ==================================================
  // DESTINATION — AnimeDataMerged (hybrid sheet)
  // ==================================================
  const destHeader = targetSheet
    .getRange(1, 1, 1, targetSheet.getLastColumn())
    .getValues()[0];

  const destIdIdx = destHeader.indexOf("Anime ID");
  if (destIdIdx === -1) throw new Error('Missing "Anime ID" column in destination.');

  // ==================================================
  // LOGGING — Named ranges for observability
  // ==================================================
  const countCell = ss.getRangeByName('MDataAnimeDataCount');
  const updatesCell = ss.getRangeByName('MDataAnimeDataUpdates');
  const timeTookCell = ss.getRangeByName('MDataAnimeDataTimeTook');
  const updateCell = ss.getRangeByName('MDataAnimeDataUpdate');

  // ==================================================
  // DESTINATION MAP — Anime ID → row index
  // --------------------------------------------------
  // Allows O(1) lookup when deciding whether to update
  // or append a row.
  // ==================================================
  const destValues = targetSheet.getDataRange().getValues();
  const destMap = new Map();

  for (let r = 1; r < destValues.length; r++) {
    const id = destValues[r][destIdIdx];
    if (id) destMap.set(id, r + 1);
  }

  // ==================================================
  // META-OWNED COLUMNS (authoritative list)
  // --------------------------------------------------
  // These columns are owned by MetaData and may be
  // overwritten safely by this script.
  // Anything NOT listed here must NEVER be touched.
  // ==================================================
  const metaCols = [
    "Data Completion","Last Updated","Airing","Dubbed","Anime ID","Title",
    "AniList ID","Country ID","Poster URL","Banner URL","AniDB ID",
    "Start Date","Season ID","Release Year ID","Decade ID","End Date",
    "Episode Count","Episode Range ID","Running Time","Runtime","Runtime Range ID",
    "Episode Duration","Episode Duration Range ID","MAL ID","Format ID","Studio ID",
    "Source Material ID","Age Rating ID","Genre ID","Theme ID","Demographic ID",
    "Franchise ID","Anime Required","Relation"
  ];

  // ==================================================
  // COLUMN INDEX RESOLUTION (ONCE)
  // --------------------------------------------------
  // Pre-resolving indexes avoids repeated indexOf calls
  // and guarantees consistent column targeting.
  // ==================================================
  const destColIdx = {};
  for (const h of metaCols) {
    const idx = destHeader.indexOf(h);
    if (idx !== -1) destColIdx[h] = idx;
  }

  const srcColIdx = {};
  for (const h of metaCols) {
    if (h === "Title") srcColIdx[h] = titleIdx;
    else {
      const idx = srcHeader.indexOf(h);
      if (idx !== -1) srcColIdx[h] = idx;
    }
  }

  // ==================================================
  // INCREMENTAL SYNC GATE — Last successful run
  // ==================================================
  const lastSyncVal = updateCell?.getValue();
  const lastSyncDate = lastSyncVal ? new Date(lastSyncVal) : null;

  const updatedIDs = [];

  // ==================================================
  // MAIN LOOP — Row-level, formula-safe sync
  // --------------------------------------------------
  // For each anime in MetaData:
  //   - Skip if unchanged since last sync
  //   - Update existing row OR append new row
  //   - Write ONLY meta-owned columns
  // ==================================================
  for (let i = 1; i < srcData.length; i++) {
    const row = srcData[i];
    const id = row[srcIdIdx];
    if (!id) continue;

    const srcUpdated = row[lastUpdatedIdx] ? new Date(row[lastUpdatedIdx]) : null;
    if (lastSyncDate && (!srcUpdated || srcUpdated < lastSyncDate)) continue;

    let targetRow;
    let targetRowIndex;

    if (destMap.has(id)) {
      // Existing anime → update in place
      targetRowIndex = destMap.get(id);
      targetRow = targetSheet
        .getRange(targetRowIndex, 1, 1, destHeader.length)
        .getValues()[0];
    } else {
      // New anime → append clean row
      targetRowIndex = targetSheet.getLastRow() + 1;
      targetRow = new Array(destHeader.length).fill("");
      targetRow[destIdIdx] = id;
    }

    // --------------------------------------------------
    // Apply MetaData values ONLY to meta-owned columns
    // --------------------------------------------------
    for (const h of metaCols) {
      const sIdx = srcColIdx[h];
      const dIdx = destColIdx[h];
      if (sIdx === undefined || dIdx === undefined) continue;
      targetRow[dIdx] = row[sIdx];
    }

    // Row-level write preserves all formulas elsewhere
    targetSheet
      .getRange(targetRowIndex, 1, 1, destHeader.length)
      .setValues([targetRow]);

    updatedIDs.push(id);
  }

  // ==================================================
  // LOGGING — Timing, counts, and traceability
  // ==================================================
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  countCell?.setValue(updatedIDs.length);
  updatesCell?.setValue(updatedIDs.join(", "));
  timeTookCell?.setValue(elapsed);
  updateCell?.setValue(new Date().toISOString());

  Logger.log(`MetaData sync complete: ${updatedIDs.length} rows in ${elapsed}s`);
}
