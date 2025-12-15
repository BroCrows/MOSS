function mDataSync() {
  // ==================================================
  // PURPOSE
  //   Synchronize canonical anime metadata from the
  //   MetaData spreadsheet into AnimeDataMerged.
  //
  // ARCHITECTURAL ROLE
  //   - MetaData is the *single source of truth*
  //   - AnimeDataMerged is a *hybrid backend sheet*:
  //       • Left block  → script-owned metadata
  //       • Right block → user data + formulas
  //
  // HARD CONTRACT (DO NOT BREAK)
  //   - ONLY meta-owned columns may be written
  //   - User-entered columns must NEVER be touched
  //   - Formula columns must NEVER be overwritten
  //   - No full-row or full-sheet writes
  //
  // PERFORMANCE DESIGN
  //   - Read source + destination once
  //   - Resolve column indexes once
  //   - Gate work via Last Updated timestamps
  //   - Update rows individually to preserve formulas
  //
  // FAILURE MODES THIS FUNCTION AVOIDS
  //   - Formula snapshotting
  //   - Full-sheet recalculation storms
  //   - Accidental user data loss
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
  // DESTINATION — AnimeDataMerged (hybrid backend)
  // ==================================================
  const destValues = targetSheet.getDataRange().getValues();
  const destHeader = destValues[0];

  const destIdIdx = destHeader.indexOf("Anime ID");
  if (destIdIdx === -1) throw new Error('Missing "Anime ID" column in destination.');

  // ==================================================
  // LOGGING — Named ranges (observability only)
  // ==================================================
  const countCell = ss.getRangeByName('MDataAnimeDataCount');
  const updatesCell = ss.getRangeByName('MDataAnimeDataUpdates');
  const timeTookCell = ss.getRangeByName('MDataAnimeDataTimeTook');
  const updateCell = ss.getRangeByName('MDataAnimeDataUpdate');

  // ==================================================
  // DESTINATION MAP — Anime ID → sheet row index
  // --------------------------------------------------
  // Enables O(1) lookup when deciding whether to
  // update an existing row or append a new one.
  // ==================================================
  const destMap = new Map();
  for (let r = 1; r < destValues.length; r++) {
    const id = destValues[r][destIdIdx];
    if (id) destMap.set(id, r + 1);
  }

  // ==================================================
  // META-OWNED COLUMNS (authoritative list)
  // --------------------------------------------------
  // These columns are fully controlled by MetaData.
  // Anything NOT listed here must NEVER be modified.
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
  // COLUMN INDEX RESOLUTION (ONE-TIME)
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
  const lastSyncVal = updateCell ? updateCell.getValue() : "";
  const lastSyncDate = lastSyncVal ? new Date(lastSyncVal) : null;

  const updatedIDs = [];

  // ==================================================
  // MAIN LOOP — Row-level, formula-safe synchronization
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
      targetRowIndex = destMap.get(id);
      targetRow = destValues[targetRowIndex - 1].slice();
    } else {
      targetRowIndex = targetSheet.getLastRow() + 1;
      targetRow = new Array(destHeader.length).fill("");
      targetRow[destIdIdx] = id;
    }

    for (const h of metaCols) {
      const sIdx = srcColIdx[h];
      const dIdx = destColIdx[h];
      if (sIdx === undefined || dIdx === undefined) continue;
      targetRow[dIdx] = row[sIdx];
    }

    targetSheet
      .getRange(targetRowIndex, 1, 1, destHeader.length)
      .setValues([targetRow]);

    updatedIDs.push(id);
  }

  // ==================================================
  // LOGGING — Timing & traceability
  // ==================================================
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  if (countCell) countCell.setValue(updatedIDs.length);
  if (updatesCell) updatesCell.setValue(updatedIDs.join(", "));
  if (timeTookCell) timeTookCell.setValue(elapsed);
  if (updateCell) updateCell.setValue(new Date().toISOString());

  Logger.log(`MetaData sync complete: ${updatedIDs.length} rows in ${elapsed}s`);
}
