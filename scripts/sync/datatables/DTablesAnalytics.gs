function dTablesAnalytics() {
  // ==================================================
  // calcDTables_Analytics
  // --------------------------------------------------
  // Purpose:
  //   Computes all analytical fields for DataTables_All
  //   using AnimeDataMerged as the source of truth.
  //
  // Outputs per DataType + ID:
  //   - User Count
  //   - User Hours
  //   - User Mean Score
  //   - Weighted Score (confidence-based, hour-driven)
  //   - Rec Value (normalized & settings-scaled)
  //
  // Design philosophy:
  //   - AnimeDataMerged = raw user behavior
  //   - DataTables_All  = aggregated, stable analytics
  //   - Confidence grows primarily with watch hours
  //   - Scores anchor at 50 and stretch outward only
  //     once enough data exists
  // ==================================================

  const start = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const animeSheet = ss.getSheetByName("AnimeDataMerged");
  const tableSheet = ss.getSheetByName("DataTables_All");
  if (!animeSheet || !tableSheet) throw new Error("Required sheets missing.");

  const animeValues = animeSheet.getDataRange().getValues();
  const tableValues = tableSheet.getDataRange().getValues();

  const animeHeader = animeValues[0];
  const tableHeader = tableValues[0];

  // =========================
  // Resolve AnimeDataMerged columns
  // -------------------------
  // These are the *only* user-driven inputs needed:
  //   - Episodes Watched (presence gate)
  //   - User Watchtime (minutes, main confidence driver)
  //   - User Score (rating signal)
  //
  // If any of these are missing, analytics cannot run safely.

  // =========================
  const epWatchedCol = animeHeader.indexOf("Episodes Watched");
  const watchMinCol = animeHeader.indexOf("User Watchtime"); // minutes
  const scoreCol = animeHeader.indexOf("User Score");

  if ([epWatchedCol, watchMinCol, scoreCol].some(i => i === -1)) {
    throw new Error("AnimeDataMerged missing Episodes Watched / User Watchtime / User Score.");
  }

  // =========================
  // Resolve DataTables_All columns
  // -------------------------
  // DataTables_All is the canonical analytics table.
  // Each row represents one ID within a DataType
  // (e.g. GenreData, StudioData, FranchiseData).
  //
  // These columns are *written* by this function.

  // =========================
  const typeCol = tableHeader.indexOf("DataType");
  const sourceCol = tableHeader.indexOf("SourceColumn");
  const idCol = tableHeader.indexOf("ID");

  const countCol = tableHeader.indexOf("User Count");
  const hoursCol = tableHeader.indexOf("User Hours");
  const meanCol = tableHeader.indexOf("User Mean Score");
  const weightedCol = tableHeader.indexOf("Weighted Score");
  const recCol = tableHeader.indexOf("Rec Value");

  if ([typeCol, sourceCol, idCol, countCol, hoursCol, meanCol, weightedCol, recCol].some(i => i === -1)) {
    throw new Error('DataTables_All missing required analytics columns (need DataType, SourceColumn, ID, User Count/Hours/Mean, Weighted Score, and Rec Value).');
  }

  // ==================================================
  // PASS 1 — Build aggregates from AnimeDataMerged
  // ------------------------------------------------
  // Walk every anime the user has interacted with
  // and accumulate stats per SourceColumn → ID.
  //
  // Notes:
  //   - Presence is gated by Episodes Watched != blank
  //   - Multi-ID fields (Genre, Theme, etc.) are split
  //   - Minutes are accumulated and converted later
  // ==================================================

  // ==================================================
  // Precompute all "... ID" columns once (PERF CRITICAL)
  // --------------------------------------------------
  const idCols = [];
  for (let c = 0; c < animeHeader.length; c++) {
    if (typeof animeHeader[c] === "string" && animeHeader[c].endsWith(" ID")) {
      idCols.push({ index: c, name: animeHeader[c] });
    }
  }

  const aggBySource = new Map(); // Map<SourceColumn, Map<ID, agg>>(); // Map<SourceColumn, Map<ID, agg>>

  for (let r = 1; r < animeValues.length; r++) {
    const row = animeValues[r];
    const epsRaw = row[epWatchedCol];
    if (epsRaw === "" || epsRaw === null) continue;

    const minutes = Number(row[watchMinCol]) || 0;
    const score = Number(row[scoreCol]);

    for (const { index: c, name: sourceName } of idCols) {
      const raw = String(row[c] ?? "").trim();
      if (!raw) continue;

      if (!aggBySource.has(sourceName)) aggBySource.set(sourceName, new Map());
      const idMap = aggBySource.get(sourceName);

      const ids = raw.split(",").map(s => s.trim()).filter(Boolean);
      for (const id of ids) {
        if (!idMap.has(id)) {
          idMap.set(id, { count: 0, minutes: 0, scoreSum: 0, scoreCount: 0 });
        }
        const a = idMap.get(id);
        a.count += 1;
        a.minutes += minutes;
        if (!isNaN(score)) {
          a.scoreSum += score;
          a.scoreCount += 1;
        }
      }
    }
  }

  // ==================================================
  // PASS 2 — Collect per-DataType distributions
  // ------------------------------------------------
  // For each DataType, we gather distributions needed
  // to compute confidence and normalization:
  //   - counts  → median (kc)
  //   - hours   → median (kh)
  //   - weights → IQR (for Rec Value normalization)
  //
  // This step intentionally ignores zeros/blanks
  // to avoid skew from unused tags.
  // ==================================================

  // ==================================================
  const distByType = new Map(); // Map<DataType, {counts, hours, means, weights}>

  for (let r = 1; r < tableValues.length; r++) {
    const row = tableValues[r];
    const type = String(row[typeCol] ?? "").trim();
    if (!type) continue;

    if (!distByType.has(type)) {
      distByType.set(type, { counts: [], hours: [], means: [], weights: [] });
    }

    const d = distByType.get(type);
    const c = Number(row[countCol]);
    const h = Number(row[hoursCol]);
    const m = Number(row[meanCol]);
    const w = Number(row[weightedCol]);

    if (!isNaN(c) && c > 0) d.counts.push(c);
    if (!isNaN(h) && h > 0) d.hours.push(h);
    if (!isNaN(m)) d.means.push(m);
    if (!isNaN(w)) d.weights.push(w);
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function avg(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  }

  // Precompute stats per DataType
  const statsByType = new Map();
  for (const [type, d] of distByType.entries()) {
    statsByType.set(type, {
      kc: median(d.counts),
      kh: median(d.hours),
      p25w: percentile(d.weights, 0.25),
      p75w: percentile(d.weights, 0.75)
    });
  }

  // ==================================================
  // PASS 3 — Write analytics, Weighted Score, Rec Value
  // --------------------------------------------------
  // PERF NOTE:
  //   All Settings / named ranges are resolved ONCE
  //   before the row loop. Do NOT move them back
  //   inside the loop — that was the #1 slowdown.

  // --------------------------------------------------
  // For each DataTables_All row:
  //   1. Pull aggregated stats (count / hours / mean)
  //   2. Compute confidence (hours-driven)
  //   3. Compute Weighted Score (anchored at 50)
  //   4. Normalize into Rec Value using IQR + Settings
  //
  // This is the *only* pass that mutates the sheet.
  // ==================================================

  // ==================================================
  // Resolve Settings ONCE (critical for performance)
  // ==================================================
  const spread = Number(ss.getRangeByName("WSSpread")?.getValue()) || 1.55;
  const hExp = Number(ss.getRangeByName("WSHoursExponent")?.getValue()) || 0.55;
  const minConf = Number(ss.getRangeByName("WSMinConfidence")?.getValue()) || 0.20;
  const maxConf = Number(ss.getRangeByName("WSMaxConfidence")?.getValue()) || 0.98;

  const recBounds = {};
  const recKeys = [
    "Decade","RuntimeRange","Studio","SourceMaterial",
    "Genre","Theme","Demographic","AgeRating","Franchise"
  ];
  for (const k of recKeys) {
    const hi = ss.getRangeByName(`RecWeightHigh${k}`)?.getValue();
    const lo = ss.getRangeByName(`RecWeightLow${k}`)?.getValue();
    recBounds[k] = {
      max: (typeof hi === "number" && !isNaN(hi)) ? hi : 1,
      min: (typeof lo === "number" && !isNaN(lo)) ? lo : -1
    };
  }

  const out = tableValues.map((row, i) => {
    if (i === 0) return row;

    const type = String(row[typeCol] ?? "").trim();
    const sourceName = String(row[sourceCol] ?? "").trim();
    const id = String(row[idCol] ?? "").trim();

    let count = 0, hours = 0, mean = "";

    if (aggBySource.has(sourceName)) {
      const idMap = aggBySource.get(sourceName);
      if (idMap.has(id)) {
        const a = idMap.get(id);
        count = a.count;
        hours = Math.round((a.minutes / 60) * 100) / 100;
        mean = a.scoreCount ? a.scoreSum / a.scoreCount : "";
      }
    }

    row[countCol] = count = count > 0 ? count : "";
    row[hoursCol] = hours = count > 0 ? hours : "";
    row[meanCol] = mean;

            // ---- Weighted Score ----
    if (type && mean !== "" && statsByType.has(type)) {
      const { kc, kh } = statsByType.get(type);

      const cEff = kc > 0 ? Math.pow(count / (count + kc), 0.85) : 0;
      const hEff = kh > 0 ? Math.pow(hours / (hours + kh), hExp) : 0;

      const confidenceRaw = 0.20 * cEff + 0.80 * hEff;
      const confidence = Math.max(Math.min(confidenceRaw, maxConf), minConf);

      const anchorMean = 50;
      const baseWS = anchorMean + (mean - anchorMean) * confidence;
      const stretched = anchorMean + (baseWS - anchorMean) * spread;

      row[weightedCol] = Math.round(
        Math.max(0, Math.min(100, stretched)) * 10000
      ) / 10000;
    }

    // ---- Rec (Settings-driven MIN/MAX per DataType) ----
    if (statsByType.has(type) && row[weightedCol] !== "") {
      const { p25w, p75w } = statsByType.get(type);
      const w = Number(row[weightedCol]);

      // Normalize using IQR, centered so that ~median-ish sits near 0.
      // p25 -> -1, p75 -> +1 (before clamping)
      let norm = 0;
      if (p75w !== p25w) {
        norm = ((w - p25w) / (p75w - p25w)) * 2 - 1;
      }
      norm = Math.max(-1, Math.min(1, norm));

      // Map DataType -> Settings token {x}
      const typeKeyMap = {
        DecadeData: "Decade",
        RuntimeRangeData: "RuntimeRange",
        StudioData: "Studio",
        SourceMaterialData: "SourceMaterial",
        GenreData: "Genre",
        ThemeData: "Theme",
        DemographicData: "Demographic",
        AgeRatingData: "AgeRating",
        FranchiseData: "Franchise"
      };
      const key = typeKeyMap[type] || type;

      // Resolve bounds from named ranges RecWeightHigh{x} / RecWeightLow{x}
      const highName = `RecWeightHigh${key}`;
      const lowName = `RecWeightLow${key}`;

      const maxVal = ss.getRangeByName(highName)?.getValue();
      const minVal = ss.getRangeByName(lowName)?.getValue();

      // Defaults keep things safe if a named range is missing
      const maxBound = (typeof maxVal === "number" && !isNaN(maxVal)) ? maxVal : 1;
      const minBound = (typeof minVal === "number" && !isNaN(minVal)) ? minVal : -1;

      // Map norm [-1,1] -> [minBound,maxBound]
      const mapped = minBound + ((norm + 1) * (maxBound - minBound)) / 2;
      row[recCol] = Math.round(mapped * 1000) / 1000;
    } else {
      row[recCol] = "";
    }

    return row;
  });

  tableSheet.getRange(1, 1, out.length, out[0].length).setValues(out);

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  ss.getRangeByName("DTablesAnalyticsTimeTook")?.setValue(elapsed);
}
