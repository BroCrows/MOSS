function uListSync() {
  // ==================================================
  // syncUserList_To_AnimeData
  // --------------------------------------------------
  // Purpose:
  //   Synchronize user-owned fields from AnimeUserList
  //   into AnimeDataMerged.
  //
  // Design contract (CRITICAL):
  //   - AnimeUserList is the authoritative source for
  //     ALL user-entered anime data.
  //   - AnimeDataMerged is a hybrid sheet:
  //       * Meta columns → written by MetaData sync
  //       * User columns → written by THIS function
  //       * Formula columns → NEVER written by scripts
  //
  // Safety rules:
  //   - Only explicitly whitelisted user columns may
  //     be overwritten.
  //   - Formula columns must always survive intact.
  //   - Never perform full-sheet or full-row overwrites.
  // ==================================================

  const start = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ==================================================
  // SHEETS — User list & backend data
  // ==================================================
  const userSheet = ss.getSheetByName("AnimeUserList");
  const dataSheet = ss.getSheetByName("AnimeDataMerged");

  if (!userSheet || !dataSheet) {
    throw new Error('Missing "AnimeUserList" or "AnimeDataMerged" sheet.');
  }

  // ==================================================
  // LOGGING — Named ranges
  // ==================================================
  const countCell = ss.getRangeByName("UListAnimeDataCount");
  const updatesCell = ss.getRangeByName("UListAnimeDataUpdates");
  const timeTookCell = ss.getRangeByName("UListAnimeDataTimeTook");
  const updateCell = ss.getRangeByName("UListAnimeDataUpdate");

  // ==================================================
  // READ SHEETS — Snapshot values (read-only)
  // ==================================================
  const userValues = userSheet.getDataRange().getValues();
  const dataValues = dataSheet.getDataRange().getValues();

  const userHeader = userValues[0];
  const dataHeader = dataValues[0];

  const idIdxUser = userHeader.indexOf("Anime ID");
  const idIdxData = dataHeader.indexOf("Anime ID");

  if (idIdxUser === -1 || idIdxData === -1) {
    throw new Error('Missing "Anime ID" column in one of the sheets.');
  }

  // ==================================================
  // BACKEND INDEX — Anime ID → row index
  // --------------------------------------------------
  // Allows O(1) row lookup when syncing user data
  // ==================================================
  const dataMap = new Map();
  for (let r = 1; r < dataValues.length; r++) {
    const id = dataValues[r][idIdxData];
    if (id) dataMap.set(id, r + 1);
  }

  // ==================================================
  // USER-OWNED COLUMNS (authoritative list)
  // --------------------------------------------------
  // These fields are owned by AnimeUserList and may be
  // safely overwritten in AnimeDataMerged.
  // ==================================================
  const copyCols = [
    "Status",
    "Watch Next",
    "User Rank",
    "User Score",
    "Episodes Watched",
    "Rewatch Count",
    "Started On",
    "Finished On",
    "Last Day Rewatched",
  ];

  // Resolve column indexes ONCE
  const copyIdxUser = copyCols.map(c => userHeader.indexOf(c));
  const copyIdxData = copyCols.map(c => dataHeader.indexOf(c));

  // ==================================================
  // INCREMENTAL SYNC GATE — User Last Updated
  // --------------------------------------------------
  // If available, only rows changed since the last
  // successful sync will be processed.
  // ==================================================
  const lastSyncVal = updateCell?.getValue();
  const lastSyncDate = lastSyncVal ? new Date(lastSyncVal) : null;

  const userUpdatedIdx = userHeader.indexOf("User Last Updated");
  const incremental = userUpdatedIdx !== -1 && lastSyncDate;

  const updatedIDs = [];

  // ==================================================
  // MAIN LOOP — Row-level, formula-safe sync
  // ==================================================
  for (let i = 1; i < userValues.length; i++) {
    const userRow = userValues[i];
    const id = userRow[idIdxUser];
    if (!id) continue;

    const targetRowIdx = dataMap.get(id);
    if (!targetRowIdx) continue; // Anime not in backend

    // ---- Incremental skip ----
    if (incremental) {
      const changedDate = userRow[userUpdatedIdx]
        ? new Date(userRow[userUpdatedIdx])
        : null;
      if (!changedDate || changedDate < lastSyncDate) continue;
    }

    // Pull current backend row
    const targetRow = dataSheet
      .getRange(targetRowIdx, 1, 1, dataHeader.length)
      .getValues()[0];

    let rowChanged = false;

    // ---- Copy user-owned fields ----
    for (let j = 0; j < copyCols.length; j++) {
      const uIdx = copyIdxUser[j];
      const dIdx = copyIdxData[j];
      if (uIdx === -1 || dIdx === -1) continue;

      const uVal = userRow[uIdx];
      if (targetRow[dIdx] !== uVal) {
        targetRow[dIdx] = uVal;
        rowChanged = true;
      }
    }

    // ---- Write only if something changed ----
    if (rowChanged) {
      dataSheet
        .getRange(targetRowIdx, 1, 1, dataHeader.length)
        .setValues([targetRow]);
      updatedIDs.push(id);
    }
  }

  // ==================================================
  // LOGGING — Timing & traceability
  // ==================================================
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  countCell?.setValue(updatedIDs.length);
  updatesCell?.setValue(updatedIDs.join(", "));
  timeTookCell?.setValue(elapsed);
  updateCell?.setValue(new Date().toISOString());

  Logger.log(`UserList sync complete: ${updatedIDs.length} rows in ${elapsed}s`);
}
