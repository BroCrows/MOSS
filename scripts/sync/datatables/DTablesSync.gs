function dTablesSync() {
  // ==================================================
  // syncDTables_To_UList
  // --------------------------------------------------
  // Purpose:
  //   Synchronize canonical lookup tables (DataTables)
  //   from MetaData → DataTables_All in the user file.
  //
  // What this sync does:
  //   - Flattens ALL MetaData DataTables into ONE AIO table
  //   - Each row represents ONE (DataType, ID)
  //   - Preserves user-added analytic columns
  //
  // Design constraints:
  //   - MetaData tables are authoritative for:
  //       * DataType
  //       * SourceColumn
  //       * ID
  //       * Name
  //   - DataTables_All may contain MANY extra columns
  //     (analytics, rec values, scores, etc.)
  //   - Only the canonical columns above may be overwritten
  //
  // Performance strategy:
  //   - Uses Google Sheets Tables API to resolve table names
  //   - Uses DTablesIndex for 4.3 last-updated gating
  //   - Skips entire tables if unchanged
  //
  // Safety rules:
  //   - Never rebuild the whole table
  //   - Never delete rows
  //   - Never touch non-canonical columns
  // ==================================================

  const start = Date.now();

  // ==================================================
  // SETUP — Active spreadsheet & settings
  // ==================================================
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName("Settings");

  const metaDataURL = settings.getRange("MetaDataURL").getValue();
  if (!metaDataURL) throw new Error("MetaDataURL not set.");

  const metaSS = SpreadsheetApp.openById(getIdFromURL(metaDataURL));
  const metaSheet = metaSS.getSheetByName("DataTables");
  const targetSheet = ss.getSheetByName("DataTables_All");

  if (!metaSheet || !targetSheet) {
    throw new Error("Missing DataTables (meta) or DataTables_All (target) sheet.");
  }

  const metaValues = metaSheet.getDataRange().getValues();
  const targetValues = targetSheet.getDataRange().getValues();

  // ==================================================
  // TARGET INDEX — (DataType | ID) → row index
  // --------------------------------------------------
  // Enables O(1) detection of existing rows
  // ==================================================
  const header = targetValues[0];
  const typeCol = header.indexOf("DataType");
  const sourceCol = header.indexOf("SourceColumn");
  const idCol = header.indexOf("ID");
  const nameCol = header.indexOf("Name");

  if ([typeCol, sourceCol, idCol, nameCol].some(i => i === -1)) {
    throw new Error("DataTables_All missing required canonical headers.");
  }

  const targetMap = new Map();
  for (let r = 1; r < targetValues.length; r++) {
    const type = String(targetValues[r][typeCol] ?? "").trim();
    const id = String(targetValues[r][idCol] ?? "").trim();
    if (type && id) targetMap.set(`${type}|${id}`, r);
  }

  // ==================================================
  // META TABLE METADATA — Resolve table → row mapping
  // --------------------------------------------------
  // Uses Sheets API Tables metadata to determine
  // which rows belong to which logical DataTable
  // ==================================================
  const metaSheetId = metaSheet.getSheetId();
  const metaSpreadsheetId = metaSS.getId();

  const metaSheetInfo = Sheets.Spreadsheets.get(metaSpreadsheetId, {
    fields: "sheets(properties(sheetId),tables(name,range))"
  }).sheets.find(s => s.properties.sheetId === metaSheetId);

  const tableRanges = (metaSheetInfo.tables || []).map(t => ({
    name: t.name,
    startRow: t.range.startRowIndex,
    endRow: t.range.endRowIndex
  }));

  // Row index → DataType (table name)
  const rowToTable = new Map();
  for (const t of tableRanges) {
    for (let r = t.startRow; r < t.endRow; r++) {
      rowToTable.set(r, t.name);
    }
  }

  // ==================================================
  // 4.3 GATING — Read DTablesIndex from MetaData
  // --------------------------------------------------
  // Determines whether an entire DataType needs syncing
  // ==================================================
  const indexTable = metaSheetInfo.tables?.find(t => t.name === "DTablesIndex");
  const metaIndexMap = new Map(); // DataType → lastUpdated (ms)

  if (indexTable) {
    const idxStart = indexTable.range.startRowIndex + 1; // skip header
    const idxEnd = indexTable.range.endRowIndex;

    for (let r = idxStart; r < idxEnd; r++) {
      const type = String(metaValues[r][0] ?? "").trim();
      const ts = metaValues[r][1];
      if (type && ts) metaIndexMap.set(type, new Date(ts).getTime());
    }
  }

  const lastSyncRaw = ss.getRangeByName("DTablesUpdate")?.getValue();
  const lastSyncTime = lastSyncRaw ? new Date(lastSyncRaw).getTime() : 0;

  // ==================================================
  // SCAN META TABLES — AIO + GATED
  // ==================================================
  const updates = [];
  const newRows = [];
  let totalUpdates = 0;

  for (let r = 0; r < metaValues.length; r++) {
    const row = metaValues[r];

    // Detect DataTable header row
    const sc = row.indexOf("SourceColumn");
    const ic = row.indexOf("ID");
    const nc = row.indexOf("Name");
    if (sc === -1 || ic === -1 || nc === -1) continue;

    const dataType = rowToTable.get(r);
    if (!dataType || dataType === "DTablesIndex") continue;

    // ---- 4.3 gating: skip whole table if unchanged ----
    const metaUpdated = metaIndexMap.get(dataType) || 0;
    if (metaUpdated <= lastSyncTime) {
      while (r + 1 < metaValues.length && metaValues[r + 1].some(v => v !== "")) r++;
      continue;
    }

    // ---- Iterate rows inside this DataTable ----
    let metaRow = r + 1;
    while (metaRow < metaValues.length && metaValues[metaRow].some(v => v !== "")) {
      const id = String(metaValues[metaRow][ic] ?? "").trim();
      if (!id) { metaRow++; continue; }

      const name = metaValues[metaRow][nc];
      const sourceValue = metaValues[metaRow][sc];
      const key = `${dataType}|${id}`;

      if (targetMap.has(key)) {
        const rowIndex = targetMap.get(key);
        const tRow = targetValues[rowIndex];

        // Update only if canonical values changed
        if (tRow[nameCol] !== name || tRow[sourceCol] !== sourceValue) {
          tRow[nameCol] = name;
          tRow[sourceCol] = sourceValue;
          updates.push({ rowIndex, values: tRow });
          totalUpdates++;
        }
      } else {
        // New canonical entry
        const newRow = new Array(header.length).fill("");
        newRow[typeCol] = dataType;
        newRow[sourceCol] = sourceValue;
        newRow[idCol] = id;
        newRow[nameCol] = name;
        newRows.push(newRow);
        totalUpdates++;
      }

      metaRow++;
    }

    // Jump to end of table
    r = metaRow;
  }

  // ==================================================
  // WRITE CHANGES — minimal, row-level writes
  // ==================================================
  for (const u of updates) {
    targetSheet
      .getRange(u.rowIndex + 1, 1, 1, u.values.length)
      .setValues([u.values]);
  }

  if (newRows.length) {
    targetSheet
      .getRange(targetSheet.getLastRow() + 1, 1, newRows.length, header.length)
      .setValues(newRows);
  }

  // ==================================================
  // LOGGING — Sync metadata
  // ==================================================
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  ss.getRangeByName("DTablesUpdate")?.setValue(new Date().toISOString());
  ss.getRangeByName("DTablesTimeTook")?.setValue(elapsed);
  ss.getRangeByName("DTablesCount")?.setValue(totalUpdates);
}
