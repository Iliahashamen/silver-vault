// Mine museum expansion — gold content lives in MINT_DATA (app.js).
const MINT_EXPANSION = {};
(function mergeMintExpansion() {
    for (const [id, langs] of Object.entries(MINT_EXPANSION)) {
        if (!MINT_DATA[id]) continue;
        for (const [lang, extra] of Object.entries(langs)) {
            const block = MINT_DATA[id][lang];
            if (!block) continue;
            if (extra.history?.length) block.history.push(...extra.history);
            if (extra.records?.length) block.records = extra.records;
        }
    }
})();
