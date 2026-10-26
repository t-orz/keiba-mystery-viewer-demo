(() => {
  const cfg = window.PUBLIC_VIEWER_CONFIG || {};
  const SHUTUBA_SORT_KEY = "mystery_viewer_shutuba_sort";
  const JUMP_LAYOUT_KEY = "mystery_viewer_jump_layout";

  function loadShutubaSort() {
    try {
      const v = localStorage.getItem(SHUTUBA_SORT_KEY);
      if (v === "umaban" || v === "default" || v === "ninki") return v;
    } catch (_) {
      /* ignore */
    }
    return "default";
  }

  function loadJumpLayout() {
    try {
      const v = localStorage.getItem(JUMP_LAYOUT_KEY);
      if (v === "timeline" || v === "venue") return v;
    } catch (_) {
      /* ignore */
    }
    return "venue";
  }

  const state = {
    data: null,
    place: null,
    raceId: null,
    shutubaSort: loadShutubaSort(),
    jumpLayout: loadJumpLayout(),
  };

  const $ = (id) => document.getElementById(id);

  function syncShutubaSortControls() {
    const mode = state.shutubaSort;
    document.querySelectorAll("[data-shutuba-sort]").forEach((btn) => {
      const active = btn.getAttribute("data-shutuba-sort") === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const hint = $("shutubaSortHint");
    if (hint) {
      hint.textContent =
        mode === "umaban"
          ? "馬番の小さい順"
          : mode === "ninki"
          ? "人気の高い順（単勝オッズが低い順）"
          : "推定3着内率の高い順";
    }
  }

  function setShutubaSort(mode) {
    state.shutubaSort = mode === "umaban" || mode === "ninki" ? mode : "default";
    try {
      localStorage.setItem(SHUTUBA_SORT_KEY, state.shutubaSort);
    } catch (_) {
      /* ignore */
    }
    syncShutubaSortControls();
    renderShutuba();
  }

  function setCtas() {
    const disc = $("discordCta");
    if (cfg.BRAND_NAME) {
      const brand = $("brandName");
      if (brand) {
        const img = brand.querySelector("img.brand-logo-img");
        if (img) img.alt = cfg.BRAND_NAME;
        else brand.textContent = cfg.BRAND_NAME;
      }
    }
    setDiscordCta(disc, cfg.DISCORD_INVITE_URL, "DISCORD_INVITE_URL");
    // 超直前予想（Discord通知限定）の参加ボタン（2026-10-13）
    setDiscordCta($("discordCta5m"), cfg.DISCORD_5M_INVITE_URL, "DISCORD_5M_INVITE_URL");
    // スマホ用に最下段へ出している同じボタン（2026-10-25）
    setDiscordCta($("discordCtaBottom"), cfg.DISCORD_INVITE_URL, "DISCORD_INVITE_URL");
    setDiscordCta($("discordCta5mBottom"), cfg.DISCORD_5M_INVITE_URL, "DISCORD_5M_INVITE_URL");
  }

  function setDiscordCta(el, url, key) {
    if (!el) return;
    if (url && /^https:\/\//.test(String(url)) && !String(url).includes("YOUR_")) {
      el.href = url;
      el.removeAttribute("aria-disabled");
      el.removeAttribute("title");
    } else {
      el.href = "#";
      el.setAttribute("aria-disabled", "true");
      el.title = `config.js の ${key} を設定してください`;
    }
  }

  /** config.SHOW_CAST_ICONS=false で旧テキストのみ表示に戻せる */
  function applyCastIconMode() {
    const hide = cfg.SHOW_CAST_ICONS === false;
    document.documentElement.classList.toggle("hide-cast-icons", hide);
  }

  function venues() {
    return (state.data && state.data.venues) || [];
  }

  function findRace(raceId) {
    for (const v of venues()) {
      for (const r of v.races || []) {
        if (String(r.race_id) === String(raceId)) return { venue: v, race: r };
      }
    }
    return null;
  }

  /** マトリクスの指数欄。「57（21位/35レース中）」の「/35レース中」は全行同じなので見出しに寄せて省く（2026-10-26） */
  function matrixHolmesText(row) {
    return formatHolmesIndexDisplay(row).replace(/[（(](\d+位)\/\d+レース中[）)]/, "（$1）");
  }

  function formatHolmesIndexDisplay(r) {
    if (!r) return "-";
    if (typeof r.holmes_index_display === "string" && r.holmes_index_display.trim()) {
      return r.holmes_index_display.trim();
    }
    const latest = r.holmes_index == null || r.holmes_index === "" ? "-" : String(r.holmes_index);
    const morning = r.morning_holmes_index;
    if (morning == null || morning === "") return latest;
    const d = r.holmes_index_delta;
    let dtxt = "　Δ±0";
    if (typeof d === "number" && Number.isFinite(d)) {
      dtxt = d > 0 ? `　Δ+${d}` : d < 0 ? `　Δ${d}` : "　Δ±0";
    } else if (String(morning) !== latest) {
      dtxt = "";
    }
    return `${latest}（朝一 ${morning}${dtxt}）`;
  }

  function renderTop5() {
    const ol = $("top5List");
    ol.innerHTML = "";
    const items = (state.data && state.data.top5) || [];
    if (!items.length) {
      ol.innerHTML = "<li>候補なし（予想済みレースを待ってください）</li>";
      return;
    }
    for (const it of items) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#raceDetailCard";
      a.textContent = top5LineText(it);
      const idxDisp = formatHolmesIndexDisplay(it);
      if (idxDisp && idxDisp !== "-") a.title = `ホームズ指数 ${idxDisp}`;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        selectRace(it.race_id, it.place);
      });
      li.appendChild(a);
      ol.appendChild(li);
    }
    renderTop5Others(items);
  }

  /** 上位欄の1行。探偵名の（）注釈はこの欄では出さない（2026-10-25 ユーザー指示）。
   *  line は「東京 5R / ホプキンス（新馬戦特化） / ホームズ指数 86（1位/23レース中）」の形で、
   *  2つ目の区切りが探偵名。順位は行の番号と同じなので「指数86」だけにする（2026-10-26）。 */
  function top5LineText(it) {
    if (!it.line) return `${it.place} ${it.R}R`;
    const parts = String(it.line).split(" / ");
    if (parts.length >= 2) parts[1] = parts[1].replace(/\s*[（(][^）)]*[）)]\s*$/, "");
    return parts
      .map((x) => x.replace(/^ホームズ指数\s*(\d+(?:\.\d+)?)\s*[（(]\d+位\/\d+レース中[）)]$/, "指数$1"))
      .join(" / ");
  }

  /** Top5 の外（6位以下）でホームズ指数が HOLMES_BORDER_TOP 以上のレースを
   *  「その他：京都3R・72　／　東京9R・71」の1行で出す（2026-10-24 ユーザー決定で解禁）。 */
  function renderTop5Others(top5Items) {
    const p = $("top5Others");
    if (!p) return;
    p.innerHTML = "";
    const inTop5 = new Set((top5Items || []).map((it) => String(it.race_id)));
    const rows = allRaces()
      .filter((r) => {
        const v = holmesIndexValue(r);
        const rank = Number(r.holmes_index_rank);
        return v != null && v >= HOLMES_BORDER_TOP && Number.isFinite(rank) && rank >= 6
          && !inTop5.has(String(r.race_id));
      })
      .sort((a, b) => Number(a.holmes_index_rank) - Number(b.holmes_index_rank));
    p.hidden = !rows.length;
    if (!rows.length) return;
    p.appendChild(document.createTextNode("その他："));
    rows.forEach((r, i) => {
      if (i) p.appendChild(document.createTextNode("　／　"));
      const rn = String(r.R || "").replace(/[Rr]$/, "") || "-";
      const a = document.createElement("a");
      a.href = "#raceDetailCard";
      a.textContent = `${r.place || ""}${rn}R・${holmesIndexValue(r)}`;
      a.title = `ホームズ指数 ${holmesIndexValue(r)}（${r.holmes_index_rank}位）`;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        selectRace(r.race_id, r.place);
      });
      p.appendChild(a);
    });
  }

  function allRaces() {
    const out = [];
    for (const v of venues()) {
      const place = v && v.place;
      for (const r of v.races || []) {
        // 発走表グリッドは place 必須。レース側に無いときは会場名で補う
        out.push(r.place ? r : { ...r, place });
      }
    }
    return out;
  }

  function normalizeStartTime(st) {
    const m = String(st || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
  }

  function raceStartDate(race, scheduleDate) {
    const hm = normalizeStartTime(race && race.start_time);
    const day = String(scheduleDate || (state.data && state.data.schedule_date) || "").trim();
    if (!hm || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const d = new Date(`${day}T${hm}:00+09:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** 最終更新時刻以降で、最も近い未発走レース */
  function nearestPrepostRace(raceList) {
    const list = Array.isArray(raceList) ? raceList : allRaces();
    const updatedRaw = state.data && state.data.updated_at;
    let ref = updatedRaw ? new Date(updatedRaw) : new Date();
    if (Number.isNaN(ref.getTime())) ref = new Date();
    // updated_at がタイムゾーン無しのとき JST として扱う
    if (updatedRaw && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(String(updatedRaw))) {
      const m = String(updatedRaw).match(
        /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)/
      );
      if (m) {
        const t = new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}+09:00`);
        if (!Number.isNaN(t.getTime())) ref = t;
      }
    }
    const day = state.data && state.data.schedule_date;
    let best = null;
    let bestDiff = Infinity;
    for (const r of list) {
      const t = raceStartDate(r, day);
      if (!t) continue;
      const diff = t.getTime() - ref.getTime();
      if (diff > 0 && diff < bestDiff) {
        bestDiff = diff;
        best = r;
      }
    }
    return best;
  }

  function fillVenueTabs(container) {
    if (!container) return;
    container.innerHTML = "";
    const list = venues();
    if (!list.length) {
      container.innerHTML = "<span class='hint'>会場データがありません</span>";
      return;
    }
    if (!state.place || !list.some((v) => v.place === state.place)) {
      state.place = list[0].place;
    }
    const nearest = nearestPrepostRace();
    const nearestPlace = nearest && nearest.place;
    // 発走表モードでは会場タブはマトリクス用のため残す（ジャンプ本体は全場スコアボード）
    container.hidden = false;
    for (const v of list) {
      const b = document.createElement("button");
      b.type = "button";
      let cls = "tab" + (v.place === state.place ? " active" : "");
      if (nearestPlace && v.place === nearestPlace) cls += " is-nearest-prepost";
      b.className = cls;
      b.textContent = v.place;
      b.setAttribute("aria-pressed", v.place === state.place ? "true" : "false");
      b.addEventListener("click", () => {
        state.place = v.place;
        renderTabs();
        renderMatrix();
        renderJumps();
      });
      container.appendChild(b);
    }
  }

  function renderTabs() {
    fillVenueTabs($("venueTabs"));
    fillVenueTabs($("venueTabsSidebar"));
  }

  function currentVenue() {
    return venues().find((v) => v.place === state.place) || null;
  }

  function matrixSuiLabel(raw) {
    const s = String(raw || "").trim();
    if (!s || s === "-") return "-";
    const map = {
      ワ: "ワトソン",
      アイ: "アイリーン",
      モ: "モーリアティ",
      モリ: "モーリアティ",
      ハ: "ハンター",
      ホプ: "ホプキンス",
      "ハ/ホプ": "ハンター",
      ベ: "ベイカー",
      ウ: "ウィギンズ",
    };
    return map[s] || s;
  }

  function thirdDetectiveLabel(row) {
    const mapPresence = (raw) => {
      const s = String(raw || "").trim();
      if (!s || s === "-") return "";
      if (s === "モーリアティ" || s === "モリ" || s.includes("モーリ")) return "モーリアティ";
      if (s === "ホプキンス" || s === "ホプ" || s.includes("ホプキンス") || s.includes("新馬")) return "ホプキンス";
      if (s === "ハンター" || s === "ハ" || s.includes("ハンター") || s.includes("夏")) return "ハンター";
      if (s === "ベイカー" || s === "ベ" || s.includes("ベイカー")) return "ベイカー";
      if (s === "ウィギンズ" || s === "ウ" || s.includes("ウィギンズ")) return "ウィギンズ";
      // 旧スナップショットの買/様子ラベルはモーリアティ列由来とみなす
      if (s.includes("買") || s.includes("様子") || s.includes("見送")) return "モーリアティ";
      return "";
    };

    const cur = row && row["第3探偵"];
    const fromCur = mapPresence(cur);
    if (fromCur) return fromCur;

    const candidates = [
      row && row["モ"],
      row && (row["ハ/ホプ"] || row["ハ"] || row["ホプ"]),
      row && row["ベ"],
      row && row["ウ"],
      row && row.cells && (row.cells["モ"] || row.cells["モーリアティ"]),
      row && row.cells && (row.cells["ハ/ホプ"] || row.cells["ハンター"] || row.cells["ホプキンス"]),
      row && row.cells && (row.cells["ベ"] || row.cells["ベイカー"]),
      row && row.cells && (row.cells["ウ"] || row.cells["ウィギンズ"]),
    ];
    for (const c of candidates) {
      const n = mapPresence(c);
      if (n) return n;
    }
    return cur || "-";
  }

  function matrixCell(row, fullKey, shortKey) {
    const v = row && (row[fullKey] ?? row[shortKey]);
    return v == null || v === "" ? "-" : v;
  }

  function renderMatrix() {
    const wrap = $("matrixWrap");
    const v = currentVenue();
    if (!v || !(v.matrix || []).length) {
      wrap.innerHTML = "<p class='hint'>マトリクスなし</p>";
      return;
    }
    const cols = ["race", "dev", "sui", "holmes_index", "ワトソン", "アイリーン", "第3探偵"];
    const labels = {
      race: "Race",
      dev: "偏差",
      sui: "ホームズ推奨",
      holmes_index: "ホームズ指数（当日順位）",
      ワトソン: "ワトソン",
      アイリーン: "アイリーン",
      第3探偵: "第3探偵",
    };
    let table = "<div class='matrix-desktop'><div class='table-wrap'><table class='matrix'><thead><tr>";
    for (const c of cols) table += `<th>${labels[c] || c}</th>`;
    table += "</tr></thead><tbody>";
    let cards = "<div class='matrix-mobile'>";
    for (const row of v.matrix) {
      const sel = String(row.race_id) === String(state.raceId) ? " selected" : "";
      const third = thirdDetectiveLabel(row);
      const watson = matrixCell(row, "ワトソン", "ワ");
      const irene = matrixCell(row, "アイリーン", "アイ");
      const sui = matrixSuiLabel(row.sui);
      table += `<tr class="${sel}" data-rid="${row.race_id}">`;
      for (const c of cols) {
        let val = "-";
        if (c === "第3探偵") val = third;
        else if (c === "ワトソン") val = watson;
        else if (c === "アイリーン") val = irene;
        else if (c === "sui") val = sui;
        else if (c === "holmes_index") val = matrixHolmesText(row);
        else val = row[c] ?? "-";
        table += `<td>${escapeHtml(val)}</td>`;
      }
      table += "</tr>";
      cards += `
        <button type="button" class="matrix-card${sel}" data-rid="${escapeAttr(row.race_id)}">
          <p class="matrix-card-title">${escapeHtml(row.race || "-")}</p>
          <div class="matrix-card-grid">
            <div><span>偏差</span><strong>${escapeHtml(row.dev ?? "-")}</strong></div>
            <div><span>ホームズ推奨</span><strong>${escapeHtml(sui)}</strong></div>
            <div class="matrix-card-full"><span>ホームズ指数（当日順位）</span><strong>${escapeHtml(matrixHolmesText(row))}</strong></div>
            <div><span>ワトソン</span><strong>${escapeHtml(watson)}</strong></div>
            <div><span>アイリーン</span><strong>${escapeHtml(irene)}</strong></div>
            <div class="matrix-card-full"><span>第3探偵</span><strong>${escapeHtml(third)}</strong></div>
          </div>
        </button>`;
    }
    table += "</tbody></table></div></div>";
    cards += "</div>";
    wrap.innerHTML = table + cards;
    wrap.querySelectorAll("[data-rid]").forEach((el) => {
      el.addEventListener("click", () => selectRace(el.getAttribute("data-rid"), state.place, { scroll: false }));
    });
  }

  /** 障害競走か。コース＝障害 / 参考予想の注記 / レース名の「障害」「ジャンプ」で見る。 */
  function isObstacleRace(r) {
    if (!r || typeof r !== "object") return false;
    if (r.reference_only && /障害/.test(String(r.reference_only_reason || ""))) return true;
    if (/^障|障害/.test(String(r.course || r.surface || "").trim())) return true;
    return /障害|ジャンプ/.test(String(r.name || r.race_name || ""));
  }

  // この値未満のレースは「非推奨」。順位が上位でも順位色を付けない（2026-10-24 の新しい計算から）。
  // HOLMES_LOW_THRESHOLD 以上 HOLMES_BORDER_TOP 未満は「境界域」で、色は変えず要約に説明を添える。
  // 線は race_edge_board.py の HOLMES_LOW_LINE / HOLMES_BORDER_LINE と同じ値にすること。
  // 2026-10-31〜 60 → 65（案①: 65未満=非推奨・65〜69=境界域）。物差し直しで指数が約5上がったため。
  const HOLMES_LOW_THRESHOLD = 65;
  const HOLMES_BORDER_TOP = 70;
  const HOLMES_BORDER_NOTE = "境界域：やや信頼しにくい";
  const HOLMES_LOW_NOTE = "非推奨";
  function holmesIndexValue(r) {
    // 算出前は仮の値なので非推奨・境界域を付けない
    if (!r || isObstacleRace(r) || r.holmes_rank_text === "算出前") return null;
    const s = String(r.holmes_index == null ? "" : r.holmes_index).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }
  function isHolmesLow(r) {
    const v = holmesIndexValue(r);
    return v != null && v < HOLMES_LOW_THRESHOLD;
  }
  function isHolmesBorder(r) {
    const v = holmesIndexValue(r);
    return v != null && v >= HOLMES_LOW_THRESHOLD && v < HOLMES_BORDER_TOP;
  }

  function jumpClass(rank) {
    const r = Number(rank);
    if (r === 1) return "jump rank-top";
    if (r >= 2 && r <= 5) return "jump rank-hi";
    if (r >= 6 && r <= 10) return "jump rank-mid";
    return "jump";
  }

  function syncJumpLayoutControls() {
    const mode = state.jumpLayout === "timeline" ? "timeline" : "venue";
    document.querySelectorAll("[data-jump-layout]").forEach((btn) => {
      const active = btn.getAttribute("data-jump-layout") === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setJumpLayout(mode) {
    state.jumpLayout = mode === "timeline" ? "timeline" : "venue";
    try {
      localStorage.setItem(JUMP_LAYOUT_KEY, state.jumpLayout);
    } catch (_) {
      /* ignore */
    }
    syncJumpLayoutControls();
    renderJumps();
  }

  /* 直前予想が済んだかの表示（2026-10-18）。
     サーバーが各レースに update_kind（最後の更新の種類）を付ける（auto-x holmes_morning.update_kind）:
       pre_race＝直前予想（発走約10分前） / graded_1h＝重賞1時間前 / weather＝8時の天候・馬場の再予想 / morning＝朝一斉のまま
     ジャンプボタンの下線は 2026-10-19 に廃止（ユーザー決定）。ボタンには直前予想済みをツールチップと読み上げだけで残す。
     レース要約の先頭には状態ごとの帯を出し、朝一斉から変わった◎○を添える（morning_marks があるときだけ）。 */
  const PRE_RACE_LEAD_MIN = 10;
  const MARK_LOGIC_NAMES = {
    ワ: "ワトソン",
    アイ: "アイリーン",
    モ: "モーリアティ",
    "ハ/ホプ": "ハンター/ホプキンス",
    ベ: "ベイカー",
    ウ: "ウィギンズ",
  };

  function isPreRaceDone(r) {
    return !!r && r.update_kind === "pre_race";
  }

  /** "◎5○1▲8△6,7" → { "◎": "5", "○": "1" }（◎○だけ） */
  function honmeiTaikou(summary) {
    const s = String(summary || "");
    const pick = (sym) => {
      const m = s.match(new RegExp(`${sym}([0-9,]+)`));
      return m ? m[1] : "";
    };
    return { "◎": pick("◎"), "○": pick("○") };
  }

  function markNumsText(nums) {
    const list = String(nums || "").split(",").filter(Boolean);
    return list.length ? list.map((n) => circledNumber(n)).join("") : "なし";
  }

  /** 朝一斉から変わった◎○の一覧。朝の印が無ければ null（「変更なし」と区別する） */
  function changedHonmeiTaikou(r) {
    const morning = r && r.morning_marks;
    if (!morning || typeof morning !== "object") return null;
    const now = r.marks || {};
    const out = [];
    for (const key of Object.keys(now)) {
      const a = honmeiTaikou(morning[key]);
      const b = honmeiTaikou(now[key]);
      for (const sym of ["◎", "○"]) {
        if (a[sym] === b[sym] || (!a[sym] && !b[sym])) continue;
        out.push(`${MARK_LOGIC_NAMES[key] || key}${sym} ${markNumsText(a[sym])}→${markNumsText(b[sym])}`);
      }
    }
    return out;
  }

  function hhmmOf(predictedAt) {
    const label = formatPredictedAtLabel(predictedAt);
    const m = String(label).match(/(\d{2}:\d{2})$/);
    return m ? m[1] : "";
  }

  function minutesBeforeStart(r, minutes) {
    const t = raceStartDate(r, state.data && state.data.schedule_date);
    if (!t) return "";
    const d = new Date(t.getTime() - minutes * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function raceStarted(r) {
    const t = raceStartDate(r, state.data && state.data.schedule_date);
    return !!t && t.getTime() <= Date.now();
  }

  function preRaceBandHtml(r) {
    if (!r || !r.predicted || !r.update_kind) return "";
    const upd = hhmmOf(r.predicted_at);
    const changes = changedHonmeiTaikou(r);
    const changeText =
      changes === null ? "" : changes.length ? `朝一斉から変わった印：${changes.join(" ／ ")}` : "朝一斉から印の変更はありません";
    const nextPre = minutesBeforeStart(r, PRE_RACE_LEAD_MIN);
    let kind = r.update_kind;
    let title = "";
    let sub = "";
    if (kind === "pre_race") {
      title = "直前予想済み";
      sub = changeText;
    } else if (kind === "graded_1h" || kind === "weather") {
      title = kind === "graded_1h" ? "重賞1時間前予想済み" : "天候・馬場の変更で再予想";
      const lead = kind === "weather" && r.update_note ? `${r.update_note} に変わったため予想し直しました。` : "";
      const tail = raceStarted(r) ? "" : nextPre ? `直前予想は${nextPre}ごろに入ります` : "";
      sub = [lead + changeText, tail].filter(Boolean).join("。");
    } else if (raceStarted(r)) {
      kind = "missed";
      title = "直前予想は入りませんでした";
      sub = `朝一斉の予想${upd ? `（${upd}）` : ""}が最終です`;
    } else {
      kind = "morning";
      title = "朝一斉の予想のまま";
      sub = `直前予想は発走の約${PRE_RACE_LEAD_MIN}分前${nextPre ? `（${nextPre}ごろ）` : ""}に入ります。印が変わることがあります`;
    }
    // 発走時刻はレース要約の条件の行に出すので帯には書かない（ユーザー決定 2026-10-18 案C）
    const meta = kind === "missed" ? "発走済み" : upd ? `${upd}予想更新` : "";
    return (
      `<div class="prerace-band prerace-band--${kind}" role="status">` +
      `<span class="prerace-band-icon" aria-hidden="true"></span>` +
      `<div class="prerace-band-text"><p class="prerace-band-title">${escapeHtml(title)}` +
      (meta ? ` <span class="prerace-band-meta">${escapeHtml(meta)}</span>` : "") +
      `</p>` +
      (sub ? `<p class="prerace-band-sub">${escapeHtml(sub)}</p>` : "") +
      `</div></div>`
    );
  }

  function makeJumpButton(r, { nearestId } = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-rid", String(r.race_id || ""));
    b.setAttribute("data-place", String(r.place || ""));
    const selected = String(r.race_id) === String(state.raceId);
    const nearest = nearestId != null && String(r.race_id) === String(nearestId);
    let cls = jumpClass(r.holmes_index_rank);
    if (isObstacleRace(r)) cls += " is-obstacle";
    else if (isHolmesLow(r)) cls += " is-holmes-low";
    if (selected) cls += " is-selected";
    if (nearest) cls += " is-nearest-prepost";
    b.className = cls;
    const rn = String(r.R || "").replace(/[Rr]$/, "") || "-";
    b.textContent = `${rn}R`;
    b.setAttribute("aria-pressed", selected ? "true" : "false");
    const tip0 = r.holmes_rank_text && r.holmes_rank_text !== "算出前"
      ? `${r.place} ${rn}R ${normalizeStartTime(r.start_time)}（${r.holmes_rank_text}）`
      : `${r.place} ${rn}R ${normalizeStartTime(r.start_time)}`.trim();
    const tip = isHolmesLow(r)
      ? `${tip0} ・ホームズ指数${HOLMES_LOW_THRESHOLD}未満（非推奨）`
      : isHolmesBorder(r) ? `${tip0} ・${HOLMES_BORDER_NOTE}` : tip0;
    b.title = isPreRaceDone(r) ? `${tip} ・直前予想済み` : tip;
    if (isPreRaceDone(r)) b.setAttribute("aria-label", `${rn}R 直前予想済み`);
    b.addEventListener("click", () => selectRace(r.race_id, r.place, { scroll: false }));
    return b;
  }

  /** 選択状態だけ更新（発走表スクロール位置を維持） */
  function syncJumpSelection() {
    const rid = String(state.raceId || "");
    const place = String(state.place || "");
    document.querySelectorAll(".jump[data-rid]").forEach((b) => {
      const selected = String(b.getAttribute("data-rid") || "") === rid;
      b.classList.toggle("is-selected", selected);
      b.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    document.querySelectorAll(".jump-scoreboard-place").forEach((th) => {
      th.classList.toggle("is-active-place", th.textContent === place);
    });
  }

  function captureJumpScrollPositions() {
    const out = new Map();
    for (const id of ["jumpButtons", "jumpButtonsSidebar"]) {
      const el = $(id);
      if (!el) continue;
      const sc = el.querySelector(".jump-timeline-scroll");
      if (sc) out.set(id, { top: sc.scrollTop, left: sc.scrollLeft });
    }
    return out;
  }

  function restoreJumpScrollPositions(saved) {
    if (!saved || !saved.size) return;
    for (const [id, pos] of saved) {
      const el = $(id);
      const sc = el && el.querySelector(".jump-timeline-scroll");
      if (!sc || !pos) continue;
      sc.scrollTop = pos.top;
      sc.scrollLeft = pos.left;
    }
  }

  function renderJumpsVenue(box, { sidebar }) {
    box.className = sidebar ? "jump-row sidebar-jump-row" : "jump-row";
    box.innerHTML = "";
    const v = currentVenue();
    if (!v) return;
    const nearest = nearestPrepostRace(v.races || []);
    const nearestId = nearest && nearest.race_id;
    for (const r of v.races || []) {
      box.appendChild(makeJumpButton(r, { nearestId }));
    }
  }

  function renderJumpsTimeline(box, { sidebar }) {
    box.className = sidebar ? "jump-timeline sidebar-jump-timeline" : "jump-timeline";
    box.innerHTML = "";
    const placeList = venues().map((v) => v.place).filter(Boolean);
    const races = allRaces();
    if (!placeList.length || !races.length) {
      box.innerHTML = "<p class='hint'>発走表データがありません</p>";
      return;
    }
    const times = [];
    const seen = new Set();
    for (const r of races) {
      const t = normalizeStartTime(r.start_time);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      times.push(t);
    }
    times.sort();
    if (!times.length) {
      box.innerHTML = "<p class='hint'>発走時刻がありません</p>";
      return;
    }

    const byKey = new Map();
    for (const r of races) {
      const t = normalizeStartTime(r.start_time);
      const place = r.place;
      if (!t || !place) continue;
      const key = `${t}||${place}`;
      // 同一時刻・同一場は R 昇順の先頭を採用
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, r);
        continue;
      }
      const rn = Number.parseInt(String(r.R || "").replace(/[Rr]$/, ""), 10);
      const pn = Number.parseInt(String(prev.R || "").replace(/[Rr]$/, ""), 10);
      if (Number.isFinite(rn) && (!Number.isFinite(pn) || rn < pn)) byKey.set(key, r);
    }

    const nearest = nearestPrepostRace(races);
    const nearestId = nearest && nearest.race_id;
    const nearestTime = nearest ? normalizeStartTime(nearest.start_time) : "";

    const scroll = document.createElement("div");
    scroll.className = "jump-timeline-scroll";
    const table = document.createElement("table");
    table.className = "jump-scoreboard";
    table.setAttribute("aria-label", "発走表順レースジャンプ");

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "jump-scoreboard-corner";
    corner.textContent = "発走";
    hr.appendChild(corner);
    for (const place of placeList) {
      const th = document.createElement("th");
      th.className = "jump-scoreboard-place" + (place === state.place ? " is-active-place" : "");
      th.textContent = place;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const t of times) {
      const tr = document.createElement("tr");
      if (nearestTime && t === nearestTime) tr.className = "is-nearest-row";
      const th = document.createElement("th");
      th.className = "jump-scoreboard-time";
      th.scope = "row";
      th.textContent = t;
      tr.appendChild(th);
      for (const place of placeList) {
        const td = document.createElement("td");
        const r = byKey.get(`${t}||${place}`);
        if (!r) {
          td.className = "jump-scoreboard-cell is-empty";
          const dot = document.createElement("span");
          dot.className = "jump-scoreboard-dot";
          dot.setAttribute("aria-hidden", "true");
          td.appendChild(dot);
        } else {
          td.className = "jump-scoreboard-cell";
          const inner = document.createElement("div");
          inner.className = "jump-scoreboard-cell-inner";
          inner.appendChild(makeJumpButton(r, { nearestId }));
          td.appendChild(inner);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    box.appendChild(scroll);
  }

  function renderJumps() {
    syncJumpLayoutControls();
    const savedScroll = captureJumpScrollPositions();
    const targets = [
      { el: $("jumpButtons"), sidebar: false },
      { el: $("jumpButtonsSidebar"), sidebar: true },
    ];
    const timeline = state.jumpLayout === "timeline";
    for (const { el, sidebar } of targets) {
      if (!el) continue;
      if (timeline) renderJumpsTimeline(el, { sidebar });
      else renderJumpsVenue(el, { sidebar });
    }
    // 再描画で .jump-timeline-scroll が作り直されても位置を戻す
    restoreJumpScrollPositions(savedScroll);
  }

  function initJumpLayoutControls() {
    document.querySelectorAll("[data-jump-layout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setJumpLayout(btn.getAttribute("data-jump-layout"));
      });
    });
    syncJumpLayoutControls();
  }

  function selectRace(raceId, place, opts = {}) {
    state.raceId = raceId;
    if (place) state.place = place;
    renderTabs();
    renderMatrix();
    // 発走表ボタン欄は全再描画せず選択だけ更新（スクロール位置ジャンプ防止）
    syncJumpSelection();
    renderDetail();
    renderShutuba();
    openAccordion("race");
    if (opts.scroll !== false) {
      $("raceDetailCard").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function castIconSrcForLogic(bestLogic, bestLogicLabel) {
    const label = String(bestLogicLabel || "");
    const bl = String(bestLogic || "").trim().toLowerCase();
    if (bl === "watson" || /ワトソン/.test(label)) return "assets/cast/watson.png";
    if (bl === "irene" || /アイリーン/.test(label)) return "assets/cast/irene.png";
    if (bl === "moriarty" || /モーリアティ/.test(label)) return "assets/cast/moriarty.png";
    if (/ホプキンス/.test(label)) return "assets/cast/hopkins.png";
    if (bl === "hunter" || /ハンター/.test(label)) return "assets/cast/hunter.png";
    if (bl === "baker" || /ベイカー/.test(label)) return "assets/cast/baker.png";
    if (bl === "wiggins" || /ウィギンズ/.test(label)) return "assets/cast/wiggins.png";
    return "";
  }

  function formatHolmesRecommendHtml(r) {
    const label = String((r && r.best_logic_label) || "-").trim() || "-";
    const icon = castIconSrcForLogic(r && r.best_logic, label);
    if (!icon || label === "-") {
      return `ホームズ推奨: ${escapeHtml(label)}`;
    }
    return (
      `ホームズ推奨: <span class="holmes-recommend">` +
      `<img class="logic-cast-icon holmes-recommend-icon" src="${escapeAttr(icon)}" alt="" width="34" height="34" decoding="async" onerror="this.remove()" />` +
      `<strong>${escapeHtml(label)}</strong></span>`
    );
  }

  function formatPredictedAtLabel(raw) {
    if (raw == null || raw === "") return "未更新";
    if (typeof raw === "number" && Number.isFinite(raw)) {
      const d = new Date(raw * (raw < 1e12 ? 1000 : 1));
      if (!Number.isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    const s = String(raw).trim();
    if (!s) return "未更新";
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]+)(\d{2}:\d{2})(?::\d{2})?/);
    if (m) return `${m[1]} ${m[2]}`;
    const m2 = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}:\d{2})/);
    if (m2) return `${m2[1]} ${m2[2]}`;
    return s;
  }

  /** 芝/ダート/障害 + 距離。例: ダート1000m（右）。（不明）はノイズなので付けない。 */
  function formatCourseDistanceLabel(race) {
    if (!race || typeof race !== "object") return "";
    const stripNoiseDiv = (label) =>
      String(label || "")
        .replace(/[（(]\s*(不明|未知|なし|unknown|n\/a|na|none|\?|？)\s*[）)]/gi, "")
        .trim();

    const ready = stripNoiseDiv(race.course_label);
    if (ready) return ready;

    const rawCourse = String(race.course || race.surface || "").trim();
    let surface = "";
    if (/障害|^障/.test(rawCourse)) surface = "障害";
    else if (/ダート|^ダ|dirt/i.test(rawCourse)) surface = "ダート";
    else if (/芝|turf/i.test(rawCourse)) surface = "芝";

    const distRaw = String(race.distance || "").trim() || rawCourse;
    const dm = distRaw.match(/(\d{3,4})\s*m?/i);
    const dist = dm ? dm[1] : "";

    let div = String(race.course_division || "").trim().replace(/^[（(【\[]|[）)】\]]$/g, "");
    if (/直線/.test(div)) div = "直線";
    else if (/右/.test(div)) div = "右";
    else if (/左/.test(div)) div = "左";
    else div = ""; // 不明などは付けない

    if (!surface && !dist) return "";
    let label = surface && dist ? `${surface}${dist}m` : surface || `${dist}m`;
    if ((div === "右" || div === "左" || div === "直線") && !label.includes(div)) {
      label = `${label}（${div}）`;
    }
    return label;
  }

  function renderDetail() {
    const box = $("raceDetail");
    const found = findRace(state.raceId);
    if (!found) {
      box.innerHTML = "<p class='hint'>マトリクスの行またはジャンプボタンでレースを選ぶと表示されます。</p>";
      renderResult();
      return;
    }
    const r = found.race;
    const marks = r.marks || {};
    const cells = r.cells || {};
    const predictedAtLabel = formatPredictedAtLabel(r.predicted_at);
    const courseLabel = formatCourseDistanceLabel(r);
    const coursePart = courseLabel
      ? ` ／ <span class="race-course">${escapeHtml(courseLabel)}</span>`
      : "";
    const fieldSizeNum = Number(r.field_size);
    const fieldSizePart =
      Number.isFinite(fieldSizeNum) && fieldSizeNum > 0
        ? ` ／ 出走 <span class="race-field-size">${escapeHtml(String(fieldSizeNum))}頭</span>`
        : "";
    const paceLabel = String(r.pace_label || "").trim();
    const paceLine = paceLabel
      ? `<p class="meta race-pace">予想ペース: <strong>${escapeHtml(paceLabel)}</strong></p>`
      : "";
    // 予想更新時間は帯（preRaceBandHtml）と重なるので、帯が出ないとき（予想前・update_kind の無い古い公開データ）だけ
    // 発走時刻の行の上に出す（ユーザー決定 2026-10-18）
    const bandHtml = preRaceBandHtml(r);
    const predictedAtLine = bandHtml
      ? ""
      : `<p class="meta race-predicted-at">予想更新時間: <strong>${escapeHtml(predictedAtLabel)}</strong></p>`;
    let html = `
      <h3>${escapeHtml(r.place)} ${escapeHtml(r.R)}R ${escapeHtml(r.name || "")}</h3>
      ${bandHtml}
      ${predictedAtLine}
      <p class="meta">発走 ${escapeHtml(r.start_time || "-")}${coursePart} ／ 天気:${escapeHtml(r.weather || "-")} 馬場:${escapeHtml(r.baba || "-")}${fieldSizePart}</p>
      ${paceLine}
      <p class="meta">期待値偏差: <strong>${escapeHtml(r.dev)}</strong>（ランク ${escapeHtml(r.rank || "-")}）</p>
      <p class="meta">ホームズ指数: <strong>${escapeHtml(formatHolmesIndexDisplay(r))}</strong>${isHolmesLow(r) ? `<span class="holmes-band-note">（${HOLMES_LOW_NOTE}）</span>` : isHolmesBorder(r) ? `<span class="holmes-band-note">（${HOLMES_BORDER_NOTE}）</span>` : ""}${r.holmes_morning_delta_text ? `<span class="holmes-delta">${escapeHtml(r.holmes_morning_delta_text)}</span>` : ""} ／ 当日レース内順位: <strong>${escapeHtml(r.holmes_rank_text || "算出前")}</strong></p>
      ${r.reference_only ? `<p class="meta race-reference-only">${escapeHtml(r.reference_only_reason || "学習・ホームズ指数の対象外（参考予想）")}</p>` : ""}
      <p class="meta">${formatHolmesRecommendHtml(r)}</p>
      <div class="marks">
    `;
    // 箱はワトソン・アイリーンと、そのレースを担当する第3探偵（モーリアティ／ハンター・ホプキンス／ベイカー／
    // ウィギンズ。設計上は排他。障害はグレゴリー）の1つだけ。担当していない探偵の空の箱は出さない（2026-10-26）。
    // 第3探偵の評価欄は探偵名そのもの（例 cells.ベ="ベイカー"）なので、見出しと重なるときは評価の行を省く
    const blank = (x) => !x || x === "-";
    const boxes = [["ワ", "ワトソン"], ["アイ", "アイリーン"]];
    for (const [k, label] of [["モ", "モーリアティ"], ["ハ/ホプ", "ハンター/ホプキンス"], ["ベ", "ベイカー"], ["ウ", "ウィギンズ"], ["グ", "グレゴリー"]]) {
      if (blank(cells[k]) && blank(marks[k])) continue;
      boxes.push([k, k === "ハ/ホプ" && /^(ハンター|ホプキンス)$/.test(cells[k] || "") ? cells[k] : label]);
      break;
    }
    for (const [k, label] of boxes) {
      if (blank(cells[k]) && blank(marks[k])) continue;
      const cell = blank(cells[k]) || cells[k] === label ? "" : `${escapeHtml(cells[k])}<br/>`;
      html += `<div class="mark-box"><strong>${escapeHtml(label)}</strong>${cell}<span>${escapeHtml(marks[k] || "-")}</span></div>`;
    }
    html += "</div><div class='pdf-links'>";
    if (r.pdf_url) html += `<a href="${escapeAttr(r.pdf_url)}" target="_blank" rel="noopener">予想詳細PDF</a>`;
    if (r.help_pdf_url) html += `<a href="${escapeAttr(r.help_pdf_url)}" target="_blank" rel="noopener">項目説明PDF</a>`;
    if (!r.pdf_url && !r.help_pdf_url) html += "<span class='hint'>PDFはまだ公開されていません</span>";
    html += "</div>";
    html += raceResultBriefHtml(r);
    box.innerHTML = html;
    renderResult();
  }

  // 脚質は競馬新聞と同じ漢字1文字で出す（2026-09-27）。色は付けない。
  // データ（推定脚質）は元の語のまま。表示のときだけ置き換え、元の語は title に残す。
  const RUNNING_STYLE_SHORT = {
    "逃げ": ["逃", "rs-nige"],
    "先行": ["先", "rs-senko"],
    "差し": ["差", "rs-sashi"],
    "追込": ["追", "rs-oikomi"],
    "追い込み": ["追", "rs-oikomi"],
    "マクリ": ["捲", "rs-makuri"],
  };

  function runningStyleCellHtml(v) {
    const raw = String(v ?? "").trim();
    const hit = RUNNING_STYLE_SHORT[raw];
    const [txt, cls] = hit || ["－", "rs-none"];
    const title = raw ? `推定脚質: ${raw}` : "推定脚質: 不明";
    return `<span class="rs ${cls}" title="${escapeAttr(title)}">${escapeHtml(txt)}</span>`;
  }

  function markHonmeiClass(col) {
    if (col === "ワトソン") return "mark-honmei mark-w";
    if (col === "アイリーン") return "mark-honmei mark-i";
    if (col === "モーリアティ") return "mark-honmei mark-m";
    if (col === "ベイカー") return "mark-honmei mark-b";
    if (col === "ウィギンズ") return "mark-honmei mark-wg";
    return "mark-honmei mark-h";
  }

  function shutubaRowsForDisplay(rows) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    if (state.shutubaSort === "umaban") {
      return list.sort((a, b) => {
        const na = Number.parseInt(String(a && a["馬番"] != null ? a["馬番"] : ""), 10);
        const nb = Number.parseInt(String(b && b["馬番"] != null ? b["馬番"] : ""), 10);
        const va = Number.isFinite(na) ? na : 999;
        const vb = Number.isFinite(nb) ? nb : 999;
        return va - vb;
      });
    }
    if (state.shutubaSort === "ninki") {
      return list.sort((a, b) => {
        const na = Number.parseInt(String(a && a["人気"] != null ? a["人気"] : ""), 10);
        const nb = Number.parseInt(String(b && b["人気"] != null ? b["人気"] : ""), 10);
        // 取消等で人気が無い馬は末尾へ（馬番ソートと同じ考え方）
        const va = Number.isFinite(na) ? na : 999;
        const vb = Number.isFinite(nb) ? nb : 999;
        return va - vb;
      });
    }
    return list;
  }

  function renderShutuba() {
    const box = $("shutubaDetail");
    if (!box) return;
    syncShutubaSortControls();
    const found = findRace(state.raceId);
    // 表の上に「東京11R 秋華賞」のように競馬場・レース番号・レース名を出す
    const title = $("shutubaRaceTitle");
    if (title) {
      const label = found
        ? [
            `${found.race.place || found.venue.place || ""}${found.race.R != null ? `${found.race.R}R` : ""}`,
            String(found.race.name || "").trim(),
          ]
            .filter(Boolean)
            .join(" ")
        : "";
      title.textContent = label;
      title.hidden = !label;
    }
    if (!found) {
      box.innerHTML = "<p class='hint'>レースを選ぶと出馬表が表示されます。</p>";
      return;
    }
    const shutuba = found.race.shutuba;
    if (!shutuba || !Array.isArray(shutuba.rows) || !shutuba.rows.length) {
      box.innerHTML =
        "<p class='hint'>このレースの出馬表はまだ公開されていません（本体アプリ再公開後に表示されます）。</p>";
      return;
    }
    const cols = Array.isArray(shutuba.columns) ? shutuba.columns : [];
    const markCols = new Set(Array.isArray(shutuba.mark_columns) ? shutuba.mark_columns : []);
    const badgeLegend = Array.isArray(shutuba.badge_legend) ? shutuba.badge_legend : [];
    let html = '<div class="table-wrap"><table class="shutuba"><thead><tr>';
    for (const c of cols) {
      html += `<th>${escapeHtml(c)}</th>`;
    }
    html += "</tr></thead><tbody>";
    for (const row of shutubaRowsForDisplay(shutuba.rows)) {
      const st = row._style || {};
      const honmei = st.honmei || {};
      html += `<tr${st.cancel ? ' class="is-cancel"' : ""}>`;
      for (const c of cols) {
        const classes = [];
        let styleAttr = "";
        if (c === "枠番" && st.frame_bg) {
          classes.push("frame-cell");
          styleAttr = ` style="background:${escapeAttr(st.frame_bg)};color:${escapeAttr(st.frame_fg || "#000")}"`;
        }
        if (st.cancel && (c === "馬名" || c === "単勝")) classes.push("cancel-text");
        if (markCols.has(c) && honmei[c]) classes.push(markHonmeiClass(c));
        if (c === "脚質") classes.push("rs-cell");
        const cls = classes.length ? ` class="${classes.join(" ")}"` : "";
        const badges = c === "馬名" ? horseBadgesHtml(row.badges) : "";
        const body =
          c === "脚質"
            ? runningStyleCellHtml(row[c])
            : c === "馬番"
              ? prevRunTriggerHtml(found.race.race_id, row)
              : escapeHtml(row[c] ?? "");
        html += `<td${cls}${styleAttr}>${body}${badges}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    if (badgeLegend.length) {
      const title = escapeHtml(shutuba.badge_legend_title || "【馬名略号】");
      const items = badgeLegend
        .map((b) => `${horseBadgesHtml([b])} ${escapeHtml(b && b.description ? b.description : "")}`)
        .join(" / ");
      html += `<p class="hint horse-badge-legend"><strong>${title}</strong>${items}</p>`;
    }
    // 枠番・馬名・騎手・斤量・性齢・馬体重を JRA 公式の値に差し替えたレース（auto-x jra_display_facts.py）
    if (shutuba.facts_source) {
      html += `<p class="hint shutuba-facts-source">枠番・馬名・騎手・斤量・性齢・馬体重の出典：${escapeHtml(shutuba.facts_source)}</p>`;
    }
    if (shutuba.rows.some((row) => prevRunFor(found.race.race_id, row["馬番"]))) {
      html +=
        '<p class="hint prev-run-hint">馬番にマウスを重ねる（スマホはタップする）と前走・前々走が出ます。前走・前々走の出典：JRA（小窓の下段の一言はこのサイトで計算）。</p>';
    }
    if (!shutuba.predicted) {
      html += '<p class="hint">予想前の出馬表です（印列は予想後に表示されます）。</p>';
    }
    box.innerHTML = html;
    syncShutubaStickyOffset(box);
    syncPrevRunPopAfterRender(box);
  }

  /** 馬名欄の略号（D / B / NB）。判定も色もサーバー側 horse_name_badges が出所。
   *  色は公開JSONが持つ値をそのまま使うので、PDF と必ず同じになる。 */
  function horseBadgesHtml(badges) {
    if (!Array.isArray(badges) || !badges.length) return "";
    return badges
      .map((b) => {
        const label = String((b && b.label) || "").trim();
        if (!label) return "";
        const color = String((b && b.color) || "");
        // 想定外の値を style に流さない
        const style = /^#[0-9a-fA-F]{3,8}$/.test(color) ? ` style="color:${color}"` : "";
        return `<span class="horse-badge"${style}>${escapeHtml(label)}</span>`;
      })
      .join("");
  }

  // 枠番・馬番の左固定を有効化し、2列目の left を1列目の実測幅に合わせる。
  // 端末やフォント倍率で桁幅が変わるため、CSS で決め打ちにすると隙間や重なりが出る。
  // 見出しが 枠番 / 馬番 のときだけ有効化する（列が欠けた表で馬名を固定しないため）。
  function syncShutubaStickyOffset(scope) {
    const root = scope || document;
    root.querySelectorAll("table.shutuba").forEach((tbl) => {
      const ths = tbl.querySelectorAll("thead th");
      const ok =
        ths.length >= 2 &&
        ths[0].textContent.trim() === "枠番" &&
        ths[1].textContent.trim() === "馬番";
      tbl.classList.toggle("sticky-num", ok);
      if (!ok) {
        tbl.style.removeProperty("--shutuba-col1-w");
        tbl.classList.remove("is-overflowing");
        return;
      }
      const w = ths[0].getBoundingClientRect().width;
      if (w > 0) tbl.style.setProperty("--shutuba-col1-w", `${w}px`);
      // 実際に横へはみ出しているときだけ固定列の境界を太くする。
      // 収まっている幅で太い線を出すと表が重く見えるため。
      const wrap = tbl.closest(".table-wrap");
      const overflowing = !!wrap && wrap.scrollWidth > wrap.clientWidth + 1;
      tbl.classList.toggle("is-overflowing", overflowing);
    });
  }

  // 画面回転やリサイズで1列目の幅が変わるため測り直す
  window.addEventListener("resize", () => syncShutubaStickyOffset());

  function initShutubaSortControls() {
    document.querySelectorAll("[data-shutuba-sort]").forEach((btn) => {
      btn.addEventListener("click", () => setShutubaSort(btn.getAttribute("data-shutuba-sort")));
    });
    syncShutubaSortControls();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function formatUpdatedAtLabel(raw, scheduleDate) {
    const s = String(raw || "").trim();
    if (!s) return "";
    // ISO / "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DDTHH:MM:SS(+TZ)"
    const m = s.match(
      /^(\d{4}-\d{2}-\d{2})(?:[T\s]+)(\d{2}:\d{2}(?::\d{2})?)?/
    );
    // 開催日を先に出し、更新日時は開催日と同じ日なら時刻だけ（分まで）。日付の二重表示をやめた（2026-10-26）
    const lines = [`開催日 ${scheduleDate || "-"}`];
    if (m) {
      const hm = m[2] ? m[2].slice(0, 5) : "";
      lines.push(m[1] === String(scheduleDate || "") && hm ? `⏰最終更新 ${hm}` : `⏰最終更新 ${m[1]}${hm ? ` ${hm}` : ""}`);
    } else {
      lines.push(`最終更新 ${s}`);
    }
    return lines.join("\n");
  }

  function isDayClosedSnapshot(data) {
    if (!data || typeof data !== "object") return false;
    if (data.cleared === true) return true;
    const venues = Array.isArray(data.venues) ? data.venues : [];
    const n = Number(data.race_count || 0);
    return n === 0 && venues.length === 0;
  }

  function setDayClosedOverlay(on) {
    const overlay = $("dayClosedOverlay");
    document.body.classList.toggle("is-day-closed", !!on);
    if (!overlay) return;
    overlay.hidden = !on;
    overlay.setAttribute("aria-hidden", on ? "false" : "true");
  }

  /**
   * 動作確認用サイト専用の告知バナー。スナップショットの demo_banner_mode
   * （"demo"/"test"）が付いているときだけ表示する。本番のスナップショットには
   * この項目自体が乗らないため、本サイトでは常に非表示のまま。
   */
  function renderDemoBanner(data) {
    const el = $("demoBanner");
    if (!el) return;
    const mode = data && typeof data.demo_banner_mode === "string" ? data.demo_banner_mode.trim() : "";
    if (mode !== "demo" && mode !== "test") {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const label = mode === "demo" ? "デモ画面" : "テスト画面";
    el.textContent = "";
    const span = document.createElement("span");
    span.textContent =
      `これは 競馬AIミステリー予想 の${label}です。` +
      "本サイトではJRA開催日に競馬予想を配信しております→";
    const a = document.createElement("a");
    a.href = "https://t-orz.github.io/keiba-mystery-viewer/";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "https://t-orz.github.io/keiba-mystery-viewer/";
    el.appendChild(span);
    el.appendChild(a);
    el.hidden = false;
  }

  function renderUpdateTiming(data) {
    const el = $("updateTiming") || document.querySelector(".update-timing");
    if (!el) return;
    // 優先: config.js の PRE_RACE_TRIGGER_MODE（現行運用帯）→ スナップショット → 既定15
    const cfgMode = String(cfg.PRE_RACE_TRIGGER_MODE || "").trim().toLowerCase();
    const snapMode = data && data.pre_race_trigger_mode != null
      ? String(data.pre_race_trigger_mode).trim().toLowerCase()
      : "";
    const mode = cfgMode || snapMode || "15";
    const is15 = mode === "15" || mode === "early" || mode === "15m" || mode === "15min";
    const preLine = is15
      ? "・発走10分前前後（全レース）"
      : "・発走6〜8分前（全レース）";
    // スナップショット全文は、config 未指定かつ mode 一致時のみ採用（古い6_8文面の上書きを防ぐ）
    const full = data && data.update_timing_text;
    if (
      !cfgMode &&
      typeof full === "string" &&
      full.trim() &&
      snapMode &&
      ((is15 && /15/.test(full)) || (!is15 && /6/.test(full)))
    ) {
      el.textContent = full.trim();
      return;
    }
    el.textContent =
      "【主な更新タイミング】\n" +
      "・開催日早朝6時頃（全レース一斉）\n" +
      "・開催日朝8時頃（天候馬場変更レース）\n" +
      "・発走1時間前頃（重賞のみ）\n" +
      preLine +
      "\n※更新されない場合は通信障害など運用上のトラブルが発生しております。ご容赦ください";
  }

  // 【探偵印成績（前週・今開催）】は対象週・今開催と表形式PDFへのボタンだけを出す（2026-09-26）。
  // 印ごとの成績・注記（サンプル数／平均人気など）は PDF に集約した。ブロック内に戻さないこと。
  // 2026-10-13: PDF の2ページ目以降に開催ごとの累計（今開催の探偵印成績）を足し、見出しも改めた。
  function renderMarkWeeklyStats(data) {
    const el = $("markWeeklyStats") || document.querySelector(".sidebar-mark-weekly-body");
    if (!el) return;
    const payload = data && data.mark_weekly_stats;
    const emptyMsg =
      (payload && typeof payload.empty_message === "string" && payload.empty_message.trim()) ||
      "データがありません";
    if (!payload || !payload.has_data) {
      el.textContent = emptyMsg;
      return;
    }
    // 対象週は必ず出す。見出しは「探偵印成績（前週・今開催）」固定なので、集計が止まっても
    // 表示だけでは古いと分からない（実際に3週間気づけなかった）。
    const period =
      payload.week_start && payload.week_end
        ? `対象週: ${payload.week_start} 〜 ${payload.week_end}`
        : "";
    // 今開催: PDF の2ページ目以降に載っている開催（開催初日から対象週の末日までの累計）
    const meetings = (Array.isArray(payload.meetings) ? payload.meetings : [])
      .filter((m) => m && m.title)
      .map((m) => `${m.title} ${m.nichime || ""}`.trim());
    const meetingLine = meetings.length ? `今開催: ${meetings.join("／")}` : "";
    const pdfUrl = String(payload.pdf_url || "").trim();
    if (!/^https:\/\//.test(pdfUrl)) {
      el.textContent = [period, meetingLine, "PDFを準備中です"].filter(Boolean).join("\n");
      return;
    }
    el.innerHTML =
      (period ? `<span class="mark-weekly-period">${escapeHtml(period)}</span>` : "") +
      (meetingLine ? `<span class="mark-weekly-period">${escapeHtml(meetingLine)}</span>` : "") +
      `<a class="btn mark-weekly-pdf-btn" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">成績をPDFで見る</a>`;
  }

  // 【天候・馬場・直線風向 m/s】の部品は track_cond.js（追跡ページと共用、2026-10-25 切り出し）
  const TrackCond = window.TrackCond;
  const WIND_REFRESH_MS = TrackCond.WIND_REFRESH_MS;
  const jstTodayYmd = TrackCond.jstTodayYmd;

  function renderTrackConditions(data) {
    TrackCond.render(data);
  }

  function loadWind(data, opts = {}) {
    return TrackCond.loadWind(data, {
      ...opts,
      onLoaded: (d) => {
        if (state.data === d) TrackCond.render(d);
      },
    });
  }

  function applyData(data, { flash = false } = {}) {
    const prevUpdated = state.data && state.data.updated_at;
    state.data = data;
    const el = $("updatedAt");
    const closed = isDayClosedSnapshot(data);
    setDayClosedOverlay(closed);
    renderDemoBanner(data);
    const stamped = formatUpdatedAtLabel(data.updated_at, data.schedule_date);
    const text = closed
      ? `本日の予想公開は終了しました\n開催日 ${data.schedule_date || "-"}`
      : stamped || "更新時刻不明";
    el.textContent = text;
    if (flash && prevUpdated && data.updated_at && prevUpdated !== data.updated_at) {
      el.classList.add("just-updated");
      window.setTimeout(() => el.classList.remove("just-updated"), 2500);
    }
    renderUpdateTiming(data);
    loadIncident(data);
    renderTrackConditions(data);
    loadWind(data);
    renderMarkWeeklyStats(data);
    refreshPrevPdfBlock();
    renderTop5();
    renderTabs();
    renderMatrix();
    renderJumps();
    syncBrandJump();
    renderNextRaceBox();
    if (state.raceId) {
      renderDetail();
      renderShutuba();
    }
  }

  async function loadSnapshot({ silent = false } = {}) {
    const url = cfg.SNAPSHOT_URL;
    if (!url || String(url).includes("YOUR_PROJECT")) {
      $("updatedAt").innerHTML = "<span class='error'>config.js の SNAPSHOT_URL を設定してください</span>";
      return;
    }
    try {
      const resp = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      applyData(data, { flash: silent });
      loadResults();
      loadPrevRuns();
    } catch (e) {
      if (!silent) {
        $("updatedAt").innerHTML = `<span class="error">スナップショット取得失敗: ${escapeHtml(e.message || e)}</span>`;
      }
    }
  }

  /* ===== ホームズ指数速報（締切が最も近いレース。PC表示の左の欄、追跡ボタンの真上） =====
     2026-10-26 ユーザーの手書き図。発売締切（発走2分前）がまだ来ていない非障害レースのうち一番近いもの。
     締切を過ぎたら次のレースへ。残りは秒数で、手元の時計で1秒ごとに進める。押すとそのレースの予想へ。
     締切 NEXT_RACE_FILL_SEC 秒前から残り時間の欄を左から1秒ずつ警戒色の赤で塗る（手書き図は120秒、10-26 ユーザー指示で90秒）。
     試験版の正方形の mini.html はこれに一本化して削除した（計算はここだけ）。 */
  const SALES_CLOSE_BEFORE_MS = 2 * 60 * 1000;
  const NEXT_RACE_FILL_SEC = 90;
  function nextCloseRace(now) {
    const day = state.data && state.data.schedule_date;
    let best = null;
    let bestT = Infinity;
    for (const r of allRaces()) {
      if (isObstacleRace(r)) continue;
      const st = raceStartDate(r, day);
      if (!st) continue;
      const close = st.getTime() - SALES_CLOSE_BEFORE_MS;
      if (close > now && close < bestT) {
        bestT = close;
        best = r;
      }
    }
    return best && { r: best, close: bestT };
  }

  let nextRaceHtml = "";
  function renderNextRaceBox() {
    const el = $("nextRace");
    const wrap = $("nextRaceWrap");
    if (!el || !wrap) return;
    const data = state.data;
    const p = data && !isDayClosedSnapshot(data) ? nextCloseRace(Date.now()) : null;
    if (!p) {
      wrap.hidden = true;
      el.removeAttribute("data-rid");
      nextRaceHtml = "";
      return;
    }
    const r = p.r;
    const v = holmesIndexValue(r);
    const pending = !r.predicted || v == null;
    const rank = Number(r.holmes_index_rank);
    const m = String(r.holmes_rank_text || "").match(/(\d+)\s*レース中/);
    const total = m ? Number(m[1]) : allRaces().filter((x) => !isObstacleRace(x)).length;
    const dv = Number(r.holmes_morning_delta);
    const hasDelta = !pending && r.holmes_morning_delta != null && r.holmes_morning_delta !== "" && Number.isFinite(dv);
    const delta = hasDelta ? `(${dv > 0 ? `+${dv}` : dv < 0 ? dv : "±0"})` : "";
    const sec = Math.max(0, Math.floor((p.close - Date.now()) / 1000));
    const rn = String(r.R || "").replace(/[Rr]$/, "");
    let cls = "next-race";
    if (!pending && isHolmesLow(r)) cls += " is-low";
    else if (!pending && rank === 1) cls += " rank-top";
    else if (!pending && rank >= 2 && rank <= 5) cls += " rank-hi";
    else if (!pending && rank >= 6 && rank <= 10) cls += " rank-mid";
    const html =
      `<span class="nr-main"><span><span class="nr-idx">${pending ? "-" : escapeHtml(v)}</span>` +
      `<span class="nr-delta">${escapeHtml(delta)}</span></span>` +
      `<span class="nr-rank">${pending || !rank ? "-" : rank}<small> / ${total}</small></span></span>` +
      `<span class="nr-place">${escapeHtml(r.place || "")}</span>` +
      `<span class="nr-race">${escapeHtml(rn)}</span>` +
      `<span class="nr-secs${sec < 60 ? " soon" : ""}"><small>締切まで</small>${sec}</span>`;
    el.className = cls;
    wrap.hidden = false;
    const fill = Math.min(1, Math.max(0, (NEXT_RACE_FILL_SEC - sec) / NEXT_RACE_FILL_SEC));
    el.style.setProperty("--nr-fill", `${(fill * 100).toFixed(2)}%`);
    el.dataset.rid = r.race_id;
    el.dataset.place = r.place || "";
    const label = `${r.place || ""}${rn}R ${r.name || ""} 発走${normalizeStartTime(r.start_time)}（締切まで${sec}秒）の予想へ`;
    el.title = label;
    el.setAttribute("aria-label", label);
    if (html !== nextRaceHtml) {
      el.innerHTML = html;
      nextRaceHtml = html;
    }
  }

  function initNextRaceBox() {
    const el = $("nextRace");
    if (!el) return;
    el.addEventListener("click", () => {
      if (el.dataset.rid) selectRace(el.dataset.rid, el.dataset.place);
    });
    window.setInterval(renderNextRaceBox, 1000);
  }

  /* ===== サイトバナー → 発走が最も近いレース ================================
     サイドバーのロゴを押すと、右側の予想表示を「最終更新時刻以降で最も近い
     未発走レース」（レースジャンプで赤枠が付くレース）へ切り替える。
     対象が無い日（非開催・全レース発走済み・公開終了）は、ただの画像に戻す。 */
  function brandJumpTarget() {
    const r = nearestPrepostRace();
    return r && r.race_id ? r : null;
  }

  function jumpToNearestPrepost() {
    const r = brandJumpTarget();
    if (!r) return;
    selectRace(r.race_id, r.place);
  }

  /** 押せる状態かを毎更新で見直す（発走が進むと対象レースも動く） */
  function syncBrandJump() {
    const el = $("brandName");
    if (!el) return;
    const r = brandJumpTarget();
    if (!r) {
      el.classList.remove("is-jumpable");
      el.removeAttribute("role");
      el.removeAttribute("tabindex");
      el.removeAttribute("title");
      el.removeAttribute("aria-label");
      return;
    }
    const rn = String(r.R || "").replace(/[Rr]$/, "");
    const label =
      `発走が最も近いレースの予想へ（${r.place || ""} ${rn}R ${normalizeStartTime(r.start_time)}）`.replace(
        /\s+/g,
        " "
      );
    el.classList.add("is-jumpable");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.title = label;
    el.setAttribute("aria-label", label);
  }

  function initBrandJump() {
    const el = $("brandName");
    if (!el) return;
    el.addEventListener("click", () => jumpToNearestPrepost());
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      jumpToNearestPrepost();
    });
  }

  /* ===== 【前日予想データPDF】 ==============================================
     連続した開催日の2日目以降に、同じ連続開催の前日（3日目なら前々日まで）の
     印付き出馬表 PDF を開けるようにする。

     - 日付付きスナップショット snapshots/<YYYY-MM-DD>.json は公開のたびに更新され、
       開催日終了処理でも消さずに残る。ここから place / R / start_time / pdf_url を借りる。
     - 本体は 240KB 前後あるので、存在確認は HEAD で行い、中身はアコーディオンを
       開いたときに初めて取りに行く。
     - 前日のスナップショットが無い日（＝連続開催の初日）で遡りを打ち切るので、
       開催週をまたいで前週の開催を拾うことはない。
     - PDF 自体は Supabase 側で 8 日経つと消えるため、古い日はリンク切れになりうる。
     - サイトクローズ後（latest.json が cleared）は、閉じた開催日そのものも並べる。
       週の開催最終日の PDF を、次の開催日の朝一斉で latest.json が差し替わるまで開けるようにするため。 */
  const PREV_PDF_MAX_DAYS = 3;
  const PREV_PDF_DAY_LABELS = ["前日", "前々日", "3日前"];
  const PREV_PDF_CLOSED_DAY_LABELS = ["直近の開催日", "その前日", "その前々日"];
  const prevPdfState = { days: [], closed: false, probedFor: "", loadedFor: "", loading: false };

  /** cfg.SNAPSHOT_URL（= .../snapshots/latest.json）と同じ場所の日付付き URL */
  function datedSnapshotUrl(day) {
    const base = String(cfg.SNAPSHOT_URL || "").split("?")[0];
    if (!base || !/latest\.json$/.test(base)) return "";
    return base.replace(/latest\.json$/, `${day}.json`);
  }

  function withCacheBust(url) {
    return url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  }

  /* ===== 障害のお知らせ ======================================================
     表示データに影響する重大な障害があった日は、サーバーが incidents/<開催日>.json を置く
     （public_incident_notice.py）。当日の表示中だけ「最終更新日時」の下に出し、
     ファイルが無い日・過去日の表示・取得失敗時は隠したまま。 */
  const INCIDENT_MIN_INTERVAL_MS = 60 * 1000;
  const incidentState = { day: "", fetchedAt: 0, loading: false };

  function incidentUrl(day) {
    const base = String(cfg.SNAPSHOT_URL || "").split("?")[0];
    if (!base || !/snapshots\/latest\.json$/.test(base)) return "";
    return base.replace(/snapshots\/latest\.json$/, `incidents/${day}.json`);
  }

  function renderIncident(items) {
    const box = $("incidentNotice");
    if (!box) return;
    const list = Array.isArray(items) ? items.filter((it) => it && (it.title || it.body)) : [];
    if (!list.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.innerHTML =
      '<h2 class="incident-notice-title">【障害のお知らせ】</h2>' +
      list
        .map(
          (it) =>
            '<div class="incident-notice-item">' +
            (it.title ? `<p class="incident-notice-head">${escapeHtml(it.title)}</p>` : "") +
            (it.body ? `<p class="incident-notice-body">${escapeHtml(it.body)}</p>` : "") +
            "</div>"
        )
        .join("");
    box.hidden = false;
  }

  async function loadIncident(data) {
    const day = String((data && data.schedule_date) || "").trim();
    if (!day || day !== jstTodayYmd() || isDayClosedSnapshot(data)) {
      renderIncident([]);
      return;
    }
    const now = Date.now();
    if (incidentState.loading) return;
    if (incidentState.day === day && now - incidentState.fetchedAt < INCIDENT_MIN_INTERVAL_MS) return;
    const url = incidentUrl(day);
    if (!url) return;
    incidentState.loading = true;
    try {
      const resp = await fetch(withCacheBust(url), { cache: "no-store" });
      // ファイルが無い（平常時）は 400/404 が返る
      const body = resp.ok ? await resp.json() : null;
      renderIncident(body && body.schedule_date === day ? body.items : []);
      incidentState.day = day;
      incidentState.fetchedAt = now;
    } catch (e) {
      /* 取れないときは出さないだけ */
    } finally {
      incidentState.loading = false;
    }
  }

  /* ===== 確定結果（1〜5着） ==================================================
     発走後に結果が確定したレースの 1〜5着を、サーバーが results/<開催日>.json に
     予想とは別のファイルで置く（主に JRA 公式、取れなかった分だけ netkeiba）。
     ここではそれを読んでレース要約の下に添えるだけで、予想の印や指数は書き換えない。
     結果は数分おきにしか増えないので、予想のポーリングより間隔を空けて取りに行く。
     snapshots/ 配下はサイトクローズで消されるため、置き場所は results/ にしてある。 */
  const RESULTS_MIN_INTERVAL_MS = 120000;
  const resultsState = { day: "", races: {}, fetchedAt: 0, loading: false };

  /** cfg.SNAPSHOT_URL（= .../snapshots/latest.json）と同じバケットの results/<day>.json */
  function resultsUrl(day) {
    const base = String(cfg.SNAPSHOT_URL || "").split("?")[0];
    if (!base || !/snapshots\/latest\.json$/.test(base)) return "";
    return base.replace(/snapshots\/latest\.json$/, `results/${day}.json`);
  }

  async function loadResults({ force = false } = {}) {
    const day = String((state.data && state.data.schedule_date) || "").trim();
    if (!day || resultsState.loading || isDayClosedSnapshot(state.data)) return;
    const now = Date.now();
    if (!force && resultsState.day === day && now - resultsState.fetchedAt < RESULTS_MIN_INTERVAL_MS) return;
    const url = resultsUrl(day);
    if (!url) return;
    if (resultsState.day !== day) {
      resultsState.day = day;
      resultsState.races = {};
    }
    resultsState.loading = true;
    try {
      const resp = await fetch(withCacheBust(url), { cache: "no-store" });
      // 最初のレースが確定するまではファイルが無い（4xx）。そのときは何も出さない
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.schedule_date === day && data.races && typeof data.races === "object") {
          const changed = JSON.stringify(data.races) !== JSON.stringify(resultsState.races);
          resultsState.races = data.races;
          if (changed && state.raceId) renderDetail();
        }
      }
      resultsState.fetchedAt = now;
    } catch (_) {
      /* 次の周期でやり直す */
    } finally {
      resultsState.loading = false;
    }
  }

  /* 馬名に重ねる前走・前々走（2026-10-18）。
     サーバーが JRA 公式の詳細出馬表から prev_runs/<開催日>.json を作る（public_prev_runs.py）。
     事実は前走・前々走の最小限だけ。こちらで計算した一言を添え、出典（JRA）は出馬表の下の案内に必ず出す
     （JRA-VAN・netkeiba 由来のデータは規約上ここには出さない）。
     PC は馬番にマウスを重ねると、スマホは馬番をタップすると小窓を開く（ユーザー選択 2026-10-18。
     馬番の列は横スクロールしても左に固定なので、どの列を見ていても開ける）。ファイルが無ければ馬番はそのまま。 */
  const PREV_RUNS_MIN_INTERVAL_MS = 10 * 60 * 1000;
  const prevRunsState = { day: "", races: {}, fetchedAt: 0, loading: false };

  function prevRunsUrl(day) {
    const base = String(cfg.SNAPSHOT_URL || "").split("?")[0];
    if (!base || !/snapshots\/latest\.json$/.test(base)) return "";
    return base.replace(/snapshots\/latest\.json$/, `prev_runs/${day}.json`);
  }

  async function loadPrevRuns() {
    const day = String((state.data && state.data.schedule_date) || "").trim();
    if (!day || prevRunsState.loading || isDayClosedSnapshot(state.data)) return;
    const now = Date.now();
    if (prevRunsState.day === day && now - prevRunsState.fetchedAt < PREV_RUNS_MIN_INTERVAL_MS) return;
    const url = prevRunsUrl(day);
    if (!url) return;
    if (prevRunsState.day !== day) {
      prevRunsState.day = day;
      prevRunsState.races = {};
    }
    prevRunsState.loading = true;
    try {
      const resp = await fetch(withCacheBust(url), { cache: "no-store" });
      // 朝一斉の公開から数分はファイルが無い（4xx）。そのときは馬名をそのまま出す
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.schedule_date === day && data.races && typeof data.races === "object") {
          const changed = JSON.stringify(data.races) !== JSON.stringify(prevRunsState.races);
          prevRunsState.races = data.races;
          if (changed && state.raceId) renderShutuba();
        }
      }
      prevRunsState.fetchedAt = now;
    } catch (_) {
      /* 次の周期でやり直す */
    } finally {
      prevRunsState.loading = false;
    }
  }

  function prevRunFor(raceId, umaban) {
    const day = String((state.data && state.data.schedule_date) || "");
    if (prevRunsState.day !== day) return null;
    const race = prevRunsState.races[String(raceId || "")];
    return (race && race[String(umaban ?? "").trim()]) || null;
  }

  function prevRunTriggerHtml(raceId, row) {
    const num = escapeHtml(row["馬番"] ?? "");
    if (!prevRunFor(raceId, row["馬番"])) return num;
    // 小窓の見出しは馬名。公開側が足す接尾辞（[初走] など）は外す
    const name = String(row["馬名"] ?? "").replace(/\s*\[[^\]]*\]|\s*🔥/g, "").trim();
    return (
      `<button type="button" class="prev-run-trigger" data-race="${escapeAttr(String(raceId))}"` +
      ` data-umaban="${escapeAttr(String(row["馬番"]).trim())}" data-name="${escapeAttr(name)}"` +
      ` aria-label="${escapeAttr(`${num}番 ${name} の前走・前々走`)}" aria-haspopup="dialog" aria-expanded="false">${num}</button>`
    );
  }

  function prevRunLineHtml(r, today) {
    const [y, m, d] = String(r.date || "").split("-").map((x) => Number.parseInt(x, 10));
    const date = y && m && d ? (String(today || "").startsWith(String(y)) ? `${m}/${d}` : `${y}/${m}/${d}`) : "";
    const race = [r.race, r.cls ? `(${r.cls})` : ""].join("");
    const course = r.distance ? `${r.surface || ""}${r.distance}` : "";
    const head = [date, r.place, race, course, r.cond, r.field ? `${r.field}頭` : ""].filter(Boolean).join(" ");
    const rank = String(r.rank || "");
    let result = /^\d+$/.test(rank) ? `${rank}着` : rank;
    if (r.pop) result += `（${r.pop}番人気）`;
    if (/^\d+$/.test(rank) && r.margin !== undefined && r.margin !== "") {
      result += rank === "1" ? ` 2着に${r.margin}秒差` : ` 1着と${r.margin}秒差`;
    }
    // 馬体重（10-18 追加）。計量の無い走（海外など）は出さない
    if (Number.isFinite(Number(r.weight)) && Number(r.weight) > 0) result += `・${Number(r.weight)}kg`;
    return (
      `<li><span class="prev-run-label">${escapeHtml(r.label || "")}</span><span>${escapeHtml(head)}</span>` +
      `<span class="prev-run-result">${escapeHtml(result)}</span></li>`
    );
  }

  function prevRunPopHtml(name, pr) {
    const today = String((state.data && state.data.schedule_date) || "");
    const runs = Array.isArray(pr.runs) ? pr.runs : [];
    const notes = Array.isArray(pr.notes) ? pr.notes.filter(Boolean) : [];
    let html = `<p class="prev-run-head">${escapeHtml(name)}</p>`;
    if (runs.length) html += `<ul class="prev-run-list">${runs.map((r) => prevRunLineHtml(r, today)).join("")}</ul>`;
    if (notes.length) html += `<p class="prev-run-notes">${notes.map(escapeHtml).join("・")}</p>`;
    return html;
  }

  let prevRunPopEl = null;
  let prevRunAnchor = null;
  const prevRunCanHover = () =>
    !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);

  function hidePrevRunPop() {
    if (prevRunPopEl) prevRunPopEl.hidden = true;
    if (prevRunAnchor) prevRunAnchor.setAttribute("aria-expanded", "false");
    prevRunAnchor = null;
  }

  function showPrevRunPop(btn) {
    const pr = prevRunFor(btn.dataset.race, btn.dataset.umaban);
    if (!pr) return hidePrevRunPop();
    if (!prevRunPopEl) {
      prevRunPopEl = document.createElement("div");
      prevRunPopEl.className = "prev-run-pop";
      prevRunPopEl.setAttribute("role", "dialog");
      prevRunPopEl.setAttribute("aria-label", "前走・前々走");
      prevRunPopEl.hidden = true;
      document.body.appendChild(prevRunPopEl);
    }
    if (prevRunAnchor && prevRunAnchor !== btn) prevRunAnchor.setAttribute("aria-expanded", "false");
    const vw = document.documentElement.clientWidth;
    const gutter = 8;
    // 100vw はスクロールバーを含むので、実際の表示幅から決める（はみ出すと横スクロールが出る）
    prevRunPopEl.style.maxWidth = `${Math.min(384, vw - gutter * 2)}px`;
    prevRunPopEl.innerHTML = prevRunPopHtml(btn.dataset.name || btn.textContent, pr);
    prevRunPopEl.hidden = false;
    const rect = btn.getBoundingClientRect();
    const pw = prevRunPopEl.offsetWidth;
    const ph = prevRunPopEl.offsetHeight;
    let left = Math.min(rect.left, vw - pw - gutter);
    left = Math.max(gutter, left);
    let top = rect.bottom + 4;
    // 下に入りきらず上に入るなら馬名の上に出す
    if (top + ph > window.innerHeight - gutter && rect.top - ph - 4 > gutter) top = rect.top - ph - 4;
    prevRunPopEl.style.left = `${left + window.scrollX}px`;
    prevRunPopEl.style.top = `${top + window.scrollY}px`;
    prevRunAnchor = btn;
    btn.setAttribute("aria-expanded", "true");
  }

  /** 出馬表はポーリングで描き直されるので、開いている小窓は同じ馬の新しいボタンに付け替える */
  function syncPrevRunPopAfterRender(box) {
    if (!prevRunAnchor || !prevRunPopEl || prevRunPopEl.hidden) return;
    const { race, umaban } = prevRunAnchor.dataset;
    const next = Array.from(box.querySelectorAll(".prev-run-trigger")).find(
      (b) => b.dataset.race === race && b.dataset.umaban === umaban
    );
    if (next) showPrevRunPop(next);
    else hidePrevRunPop();
  }

  document.addEventListener("mouseover", (e) => {
    if (!prevRunCanHover() || !e.target.closest) return;
    const btn = e.target.closest(".prev-run-trigger");
    if (btn && btn !== prevRunAnchor) showPrevRunPop(btn);
  });
  document.addEventListener("mouseout", (e) => {
    if (!prevRunCanHover() || !prevRunAnchor) return;
    const to = e.relatedTarget;
    if (to && (prevRunAnchor.contains(to) || (prevRunPopEl && prevRunPopEl.contains(to)))) return;
    const from = e.target;
    if (prevRunAnchor.contains(from) || (prevRunPopEl && prevRunPopEl.contains(from))) hidePrevRunPop();
  });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest ? e.target.closest(".prev-run-trigger") : null;
    if (btn) {
      if (prevRunAnchor === btn && !prevRunCanHover()) hidePrevRunPop();
      else showPrevRunPop(btn);
      return;
    }
    if (prevRunPopEl && !prevRunPopEl.contains(e.target)) hidePrevRunPop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePrevRunPop();
  });
  window.addEventListener("resize", hidePrevRunPop);

  /** 選択中レースの確定結果。まだ無ければ null */
  function raceResultFor(r) {
    const day = String((state.data && state.data.schedule_date) || "");
    if (!r || resultsState.day !== day) return null;
    const res = resultsState.races[r.race_id];
    return res && Array.isArray(res.top) && res.top.length ? res : null;
  }

  /** 馬番を丸囲み数字にする（①〜⑳。JRA は最大18頭）。範囲外はそのままの数字 */
  function circledNumber(n) {
    const v = Number.parseInt(String(n), 10);
    return Number.isFinite(v) && v >= 1 && v <= 20 ? String.fromCharCode(0x2460 + v - 1) : String(n);
  }

  /** レース要約に添える1行（着順と馬番だけ。馬番は丸囲み数字）。詳しくは「確定結果」ブロックへ */
  function raceResultBriefHtml(r) {
    const res = raceResultFor(r);
    if (!res) return "";
    const parts = res.top.map(
      (t) => `<span class="rb-item">${escapeHtml(String(t.rank))}着 <strong>${escapeHtml(circledNumber(t.umaban))}</strong></span>`
    );
    return `<p class="meta race-result-brief">確定着順: ${parts.join(" ")}</p>`;
  }

  /** 「確定結果」ブロック（既定は閉じている）。着差・人気・探偵の印・払戻金まで出す */
  function renderResult() {
    const box = $("raceResult");
    if (!box) return;
    // 確定するまでは見出しごと隠す（開いても「まだ確定していません」だけだったため。2026-10-26）
    const card = $("raceResultCard");
    const found = findRace(state.raceId);
    if (!found) {
      if (card) card.hidden = true;
      box.innerHTML = "<p class='hint'>レースを選ぶと、確定したレースの結果が表示されます。</p>";
      return;
    }
    const r = found.race;
    const html = raceResultHtml(r);
    if (card) card.hidden = !html;
    box.innerHTML =
      html ||
      `<p class="hint">${escapeHtml(r.place || "")} ${escapeHtml(String(r.R || ""))}R の結果はまだ確定していません（確定から20分ほどで表示されます）。</p>`;
  }

  function raceResultHtml(r) {
    const res = raceResultFor(r);
    if (!res) return "";
    const top = res.top;
    const sh = r.shutuba || {};
    const cols = Array.isArray(sh.mark_columns) ? sh.mark_columns : [];
    const byUma = {};
    for (const row of Array.isArray(sh.rows) ? sh.rows : []) {
      byUma[String(row && row["馬番"] != null ? row["馬番"] : "").trim()] = row;
    }
    let html = `<h4>${escapeHtml(r.place || "")} ${escapeHtml(String(r.R || ""))}R ${escapeHtml(r.name || "")}`;
    if (res.source) html += `<span class="race-result-src">（${escapeHtml(res.source)}）</span>`;
    html += `</h4><table class="race-result-table"><thead><tr><th>着</th><th>枠</th><th>馬番</th><th>馬名</th><th class="rr-jockey">騎手</th><th class="rr-margin">着差</th><th>人気</th><th>探偵の印</th></tr></thead><tbody>`;
    for (const t of top) {
      const row = byUma[String(t.umaban)] || {};
      const marks = [];
      for (const c of cols) {
        const m = String(row[c] != null ? row[c] : "").trim();
        if (!m || m === "-") continue;
        const cls = m === "◎" ? ` class="${markHonmeiClass(c)}"` : "";
        marks.push(`<span${cls}>${escapeHtml(m + c)}</span>`);
      }
      html += `<tr><td class="rr-rank">${escapeHtml(String(t.rank))}</td>`;
      // 枠番は出馬表の行から引き、色も出馬表と同じ枠色にする
      const st = row._style || {};
      const waku = String(row["枠番"] != null ? row["枠番"] : "").trim();
      const wakuStyle = waku && st.frame_bg
        ? ` style="background:${escapeAttr(st.frame_bg)};color:${escapeAttr(st.frame_fg || "#000")}"`
        : "";
      html += `<td class="rr-num rr-waku"${wakuStyle}>${escapeHtml(waku || "-")}</td>`;
      html += `<td class="rr-num">${escapeHtml(String(t.umaban))}</td>`;
      // 騎手・着差は広い画面では専用の列、スマホ幅では馬名の下に出す（列が増えると馬名が細切れになるため）
      // 騎手は確定結果の値（乗り替わり後）を優先し、無い古い結果は出馬表の騎手で補う
      const margin = escapeHtml(t.margin || "");
      const jockey = escapeHtml(t.jockey || row["騎手"] || "");
      html += `<td class="rr-name">${escapeHtml(t.name || row["馬名"] || "")}`;
      const inline = [jockey, margin].filter(Boolean).join(" ");
      if (inline) html += `<span class="rr-margin-inline">${inline}</span>`;
      html += `</td><td class="rr-jockey">${jockey}</td><td class="rr-margin">${margin}</td>`;
      html += `<td class="rr-num">${t.ninki != null ? escapeHtml(String(t.ninki)) : "-"}</td>`;
      html += `<td class="rr-marks">${marks.join(" ") || "-"}</td></tr>`;
    }
    html += "</tbody></table>";
    html += payoutTableHtml(res.payouts);
    return html;
  }

  /** 払戻金（単勝〜3連単）。テレビ中継と同じく公式の券種順で左の列から右の列へ流す。
      行数がほぼ半分になる券種の切れ目で2つの表に分け、スマホ幅では縦に並べる */
  function payoutTableHtml(payouts) {
    const list = Array.isArray(payouts) ? payouts.filter((p) => p && Array.isArray(p.items) && p.items.length) : [];
    if (!list.length) return "";
    const total = list.reduce((n, p) => n + p.items.length, 0);
    let acc = 0;
    let cut = list.length;
    let bestDiff = Infinity;
    list.forEach((p, i) => {
      acc += p.items.length;
      const diff = Math.abs(total - 2 * acc);
      if (diff < bestDiff) {
        bestDiff = diff;
        cut = i + 1;
      }
    });
    const right = list.slice(cut);
    if (!right.length) return payoutColumnHtml(list);
    return `<div class="race-payout-split">${payoutColumnHtml(list.slice(0, cut))}${payoutColumnHtml(right)}</div>`;
  }

  /** 払戻金の表1つぶん。複勝・ワイドは1券種に複数行あるので券種のセルを縦に結合する */
  function payoutColumnHtml(list) {
    let html = `<table class="race-payout-table"><thead><tr><th>券種</th><th>組番</th><th>払戻金</th><th>人気</th></tr></thead><tbody>`;
    for (const p of list) {
      p.items.forEach((it, i) => {
        html += "<tr>";
        if (i === 0) html += `<th scope="row" rowspan="${p.items.length}">${escapeHtml(p.type || "")}</th>`;
        const yen = Number(it.yen);
        html += `<td class="rp-combo">${escapeHtml(String(it.combo || ""))}</td>`;
        html += `<td class="rp-yen">${Number.isFinite(yen) ? escapeHtml(yen.toLocaleString("ja-JP")) + "円" : "-"}</td>`;
        html += `<td class="rp-ninki">${it.ninki != null ? escapeHtml(String(it.ninki)) + "番人気" : "-"}</td>`;
        html += "</tr>";
      });
    }
    html += "</tbody></table>";
    return html;
  }

  /** "YYYY-MM-DD" を delta 日ずらす（閲覧端末のタイムゾーンに依存させない） */
  function shiftDay(day, delta) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || "").trim());
    if (!m) return "";
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() + Number(delta));
    return d.toISOString().slice(0, 10);
  }

  /** 日本時間の今日。端末の時計が海外でも開催日とずれないようにする。 */
  function todayInJst() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch (_) {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  }

  function prevPdfBaseDay() {
    const day = String((state.data && state.data.schedule_date) || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayInJst();
  }

  function formatPrevPdfDayLabel(day, idx) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
    const labels = prevPdfState.closed ? PREV_PDF_CLOSED_DAY_LABELS : PREV_PDF_DAY_LABELS;
    const name = labels[idx] || `${idx + 1}日前`;
    if (!m) return `${day} ${name}`;
    const wd = "日月火水木金土".charAt(
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
    );
    return `${Number(m[2])}/${Number(m[3])}（${wd}）の予想 ［${name}］`;
  }

  /** 遡れる前日の一覧。途切れた時点で打ち切る＝連続開催のぶんだけ返る。
      includeBase のときは baseDay 自身から調べる（クローズ後の開催日）。 */
  async function probePrevPdfDays(baseDay, { includeBase = false } = {}) {
    const days = [];
    let day = includeBase ? shiftDay(baseDay, 1) : baseDay;
    for (let i = 0; i < PREV_PDF_MAX_DAYS; i += 1) {
      day = shiftDay(day, -1);
      const url = day ? datedSnapshotUrl(day) : "";
      if (!url) break;
      let ok = false;
      try {
        const resp = await fetch(withCacheBust(url), { method: "HEAD", cache: "no-store" });
        ok = resp.ok;
      } catch (_) {
        ok = false;
      }
      if (!ok) break;
      days.push(day);
    }
    return days;
  }

  /** 発走表順の表の1セル。PDF があればリンク、無ければ押せない見た目にする。 */
  function makePrevPdfLink(r) {
    const rn = String(r.R || "").replace(/[Rr]$/, "") || "-";
    let cls = jumpClass(r.holmes_index_rank);
    if (isObstacleRace(r)) cls += " is-obstacle";
    const head = `${r.place || ""} ${rn}R ${normalizeStartTime(r.start_time)}`.trim();
    const name = String(r.name || "").trim();
    const tip = name ? `${head} ${name}` : head;
    const pdf = String(r.pdf_url || "").trim();
    if (!pdf) {
      const span = document.createElement("span");
      span.className = `${cls} prev-pdf-link is-nopdf`;
      span.textContent = `${rn}R`;
      span.title = `${tip}（PDFはありません）`;
      return span;
    }
    const a = document.createElement("a");
    a.className = `${cls} prev-pdf-link`;
    a.href = pdf;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = `${rn}R`;
    a.title = `${tip} の予想詳細PDF`;
    return a;
  }

  /** レースジャンプ「発走表」と同じ会場列 × 発走時刻行の表を、その日の JSON から作る */
  function buildPrevPdfTable(snap) {
    const venueList = (snap && Array.isArray(snap.venues) && snap.venues) || [];
    const placeList = venueList.map((v) => v.place).filter(Boolean);
    const races = [];
    for (const v of venueList) {
      for (const r of v.races || []) races.push(r.place ? r : { ...r, place: v.place });
    }
    if (!placeList.length || !races.length) {
      const p = document.createElement("p");
      p.className = "sidebar-prev-pdf-hint";
      p.textContent = "この日の発走表データがありません";
      return p;
    }

    const times = [];
    const seen = new Set();
    for (const r of races) {
      const t = normalizeStartTime(r.start_time);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      times.push(t);
    }
    times.sort();
    if (!times.length) {
      const p = document.createElement("p");
      p.className = "sidebar-prev-pdf-hint";
      p.textContent = "この日の発走時刻がありません";
      return p;
    }

    const byKey = new Map();
    for (const r of races) {
      const t = normalizeStartTime(r.start_time);
      const place = r.place;
      if (!t || !place) continue;
      const key = `${t}||${place}`;
      // 同一時刻・同一場は R 昇順の先頭を採用（レースジャンプと同じ扱い）
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, r);
        continue;
      }
      const rn = Number.parseInt(String(r.R || "").replace(/[Rr]$/, ""), 10);
      const pn = Number.parseInt(String(prev.R || "").replace(/[Rr]$/, ""), 10);
      if (Number.isFinite(rn) && (!Number.isFinite(pn) || rn < pn)) byKey.set(key, r);
    }

    const box = document.createElement("div");
    box.className = "jump-timeline sidebar-jump-timeline";
    const scroll = document.createElement("div");
    scroll.className = "jump-timeline-scroll";
    const table = document.createElement("table");
    table.className = "jump-scoreboard";
    table.setAttribute("aria-label", "前日予想データPDF（発走表順）");

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "jump-scoreboard-corner";
    corner.textContent = "発走";
    hr.appendChild(corner);
    for (const place of placeList) {
      const th = document.createElement("th");
      th.className = "jump-scoreboard-place";
      th.textContent = place;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const t of times) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.className = "jump-scoreboard-time";
      th.scope = "row";
      th.textContent = t;
      tr.appendChild(th);
      for (const place of placeList) {
        const td = document.createElement("td");
        const r = byKey.get(`${t}||${place}`);
        if (!r) {
          td.className = "jump-scoreboard-cell is-empty";
          const dot = document.createElement("span");
          dot.className = "jump-scoreboard-dot";
          dot.setAttribute("aria-hidden", "true");
          td.appendChild(dot);
        } else {
          td.className = "jump-scoreboard-cell";
          const inner = document.createElement("div");
          inner.className = "jump-scoreboard-cell-inner";
          inner.appendChild(makePrevPdfLink(r));
          td.appendChild(inner);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    box.appendChild(scroll);
    return box;
  }

  function buildPrevPdfDaySection(day, idx, snap) {
    const sec = document.createElement("section");
    sec.className = "prev-pdf-day";
    const h = document.createElement("h3");
    h.className = "prev-pdf-day-title";
    h.textContent = formatPrevPdfDayLabel(day, idx);
    sec.appendChild(h);
    sec.appendChild(buildPrevPdfTable(snap));
    return sec;
  }

  /** アコーディオンを開いたときだけ本体（日別スナップショット）を取りに行く */
  async function renderPrevPdf() {
    const body = $("prevPdfBody");
    if (!body) return;
    const days = prevPdfState.days;
    const wantKey = days.join(",");
    if (prevPdfState.loading) return;
    if (prevPdfState.loadedFor && prevPdfState.loadedFor === wantKey) return;
    if (!days.length) {
      body.innerHTML = "<p class='sidebar-prev-pdf-hint'>前日の予想データはありません</p>";
      prevPdfState.loadedFor = wantKey;
      return;
    }
    prevPdfState.loading = true;
    body.innerHTML = "<p class='sidebar-prev-pdf-hint'>前日の予想データを読み込み中…</p>";
    try {
      const loaded = [];
      for (const day of days) {
        const url = datedSnapshotUrl(day);
        if (!url) continue;
        const resp = await fetch(withCacheBust(url), { cache: "no-store" });
        if (!resp.ok) continue;
        loaded.push({ day, snap: await resp.json() });
      }
      body.innerHTML = "";
      if (!loaded.length) {
        body.innerHTML = "<p class='sidebar-prev-pdf-hint'>前日の予想データはありません</p>";
      } else {
        const lead = document.createElement("p");
        lead.className = "sidebar-prev-pdf-hint";
        lead.textContent = "※レースを押すと、その日の印付き出馬表PDFが開きます";
        body.appendChild(lead);
        loaded.forEach((item, i) => {
          body.appendChild(buildPrevPdfDaySection(item.day, i, item.snap));
        });
      }
      prevPdfState.loadedFor = wantKey;
    } catch (e) {
      body.innerHTML =
        "<p class='sidebar-prev-pdf-hint'>前日の予想データを取得できませんでした: " +
        escapeHtml(e.message || e) +
        "</p>";
    } finally {
      prevPdfState.loading = false;
    }
  }

  /** 連続開催の2日目以降とクローズ後だけブロックを出す（前日が無ければ隠したまま） */
  async function refreshPrevPdfBlock() {
    const block = $("prevPdfBlock");
    if (!block) return;
    const baseDay = prevPdfBaseDay();
    const closed = isDayClosedSnapshot(state.data);
    const key = `${baseDay}|${closed ? "closed" : "open"}`;
    if (!baseDay || prevPdfState.probedFor === key) return;
    prevPdfState.probedFor = key;
    const days = await probePrevPdfDays(baseDay, { includeBase: closed });
    prevPdfState.closed = closed;
    prevPdfState.days = days;
    prevPdfState.loadedFor = "";
    block.hidden = !days.length;
    if (!days.length) {
      block.open = false;
      return;
    }
    if (block.open) renderPrevPdf();
  }

  function initPrevPdfBlock() {
    const block = $("prevPdfBlock");
    if (!block) return;
    block.addEventListener("toggle", () => {
      if (block.open) renderPrevPdf();
    });
  }

  const ACC_STORAGE_KEY = "pv_acc_state_v1";
  const ACC_MQ = window.matchMedia("(max-width: 720px)");

  function isMobileAcc() {
    return ACC_MQ.matches;
  }

  function isPcCollapsible(section) {
    return !!(section && section.classList.contains("acc-pc"));
  }

  function isMobileOnlyAcc(section) {
    return !!(section && section.classList.contains("acc-mobile-only"));
  }

  function canToggleAcc(section) {
    if (isMobileOnlyAcc(section)) return isMobileAcc();
    return isMobileAcc() || isPcCollapsible(section);
  }

  function readAccPrefs() {
    try {
      return JSON.parse(sessionStorage.getItem(ACC_STORAGE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function writeAccPrefs(prefs) {
    try {
      sessionStorage.setItem(ACC_STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function setAccordionOpen(section, open, persist) {
    if (!section) return;
    section.classList.toggle("is-open", open);
    section.classList.toggle("is-closed", !open);
    const btn = section.querySelector(":scope > .acc-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (persist && canToggleAcc(section)) {
      const key = section.getAttribute("data-acc");
      if (!key) return;
      const prefs = readAccPrefs();
      prefs[key] = open;
      writeAccPrefs(prefs);
    }
  }

  function openAccordion(key) {
    if (!isMobileAcc()) return;
    const section = document.querySelector(`.acc[data-acc="${key}"]`);
    setAccordionOpen(section, true, true);
  }

  function applyAccordionDefaults() {
    const toolbar = $("accToolbar");
    const prefs = readAccPrefs();
    document.querySelectorAll(".acc[data-acc]").forEach((section) => {
      const key = section.getAttribute("data-acc");
      let open;
      if (!isMobileAcc() && !isPcCollapsible(section)) {
        open = true;
      } else if (Object.prototype.hasOwnProperty.call(prefs, key)) {
        open = !!prefs[key];
      } else {
        open = section.getAttribute("data-default") !== "closed";
      }
      setAccordionOpen(section, open, false);
    });
    if (toolbar) toolbar.hidden = !isMobileAcc();
  }

  function initAccordion() {
    document.querySelectorAll(".acc[data-acc]").forEach((section) => {
      const btn = section.querySelector(":scope > .acc-toggle");
      if (!btn) return;
      btn.addEventListener("click", () => {
        if (!canToggleAcc(section)) return;
        const next = !section.classList.contains("is-open");
        setAccordionOpen(section, next, true);
      });
    });
    const openAll = $("accOpenAll");
    const closeSecondary = $("accCloseSecondary");
    if (openAll) {
      openAll.addEventListener("click", () => {
        document.querySelectorAll(".acc[data-acc]").forEach((section) => {
          setAccordionOpen(section, true, true);
        });
      });
    }
    if (closeSecondary) {
      closeSecondary.addEventListener("click", () => {
        document.querySelectorAll('.acc[data-default="closed"]').forEach((section) => {
          setAccordionOpen(section, false, true);
        });
        document.querySelectorAll('.acc[data-default="open"]').forEach((section) => {
          setAccordionOpen(section, true, true);
        });
      });
    }
    applyAccordionDefaults();
    const onChange = () => applyAccordionDefaults();
    if (ACC_MQ.addEventListener) ACC_MQ.addEventListener("change", onChange);
    else if (ACC_MQ.addListener) ACC_MQ.addListener(onChange);
  }

  setCtas();
  applyCastIconMode();
  initAccordion();
  initShutubaSortControls();
  initJumpLayoutControls();
  initPrevPdfBlock();
  initBrandJump();
  initNextRaceBox();
  loadSnapshot();
  const poll = Number(cfg.POLL_INTERVAL_MS) || 30000;
  if (poll > 0) {
    window.setInterval(() => loadSnapshot({ silent: true }), poll);
    window.setInterval(() => loadWind(state.data), WIND_REFRESH_MS);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadSnapshot({ silent: true });
  });
  // 追跡ページは別ウインドウで開く（2026-10-24 ユーザー指示。target だけだと多くのブラウザで別タブになる）。
  // 同じ名前の窓が開いていればそこに読み直して前に出す。ポップアップが止められた・スマホ等では従来どおり別タブ
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest("a.tracker-btn") : null;
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const w = window.open(a.href, "holmesTracker", "popup=yes,width=1180,height=900");
    if (w) {
      e.preventDefault();
      try { w.focus(); } catch (err) { /* noop */ }
    }
  });
})();
