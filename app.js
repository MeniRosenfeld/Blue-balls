// Agahnim blue-ball enumerator

function enumerateSequences({ hitsToWin, cyclePattern, pY, maxRandomCap }) {
    // Parse cycle pattern (case-insensitive). Supported tokens: Y (guaranteed yellow), B (guaranteed blue), ? (random), L (visual lightning only).
    const H = hitsToWin;
    const pattern = (cyclePattern || '').toUpperCase();
    if (!/^[YB?L]*$/i.test(pattern)) {
        throw new Error('Invalid cycle pattern. Use only Y, B, ?, L');
    }
    const tokens = pattern.split('');
    const Ncap = Number.isFinite(maxRandomCap) ? Math.max(0, Math.floor(maxRandomCap)) : Infinity;

    const resultsByBlue = new Map(); // blueCount -> { sequences: string[], prob: number }

    function addResult(k, seq, prob) {
        if (!resultsByBlue.has(k)) resultsByBlue.set(k, { sequences: [], prob: 0 });
        const g = resultsByBlue.get(k);
        g.sequences.push(seq);
        g.prob += prob;
    }

    function dfs(state) {
        let { hits, blues, seq, prob, usedRandom } = state;

        if (hits >= H) { addResult(blues, seq, prob); return; }

        // If neither Y nor ? exist in pattern, hits can never increase
        const hasY = tokens.includes('Y');
        const hasQ = tokens.includes('?');
        if (!hasY && !hasQ) return;

        function walk(pos, hitsNow, bluesNow, seqNow, probNow, usedNow) {
            if (hitsNow >= H) { addResult(bluesNow, seqNow, probNow); return; }
            const t = tokens[pos];
            const nextPos = tokens.length === 0 ? 0 : (pos + 1) % tokens.length;
            if (t === 'Y') {
                walk(nextPos, hitsNow + 1, bluesNow, seqNow + 'Y', probNow, usedNow);
            } else if (t === 'B') {
                walk(nextPos, hitsNow, bluesNow + 1, seqNow + 'B', probNow, usedNow);
            } else if (t === '?') {
                if (usedNow >= Ncap) return;
                walk(nextPos, hitsNow + 1, bluesNow, seqNow + 'y', probNow * pY, usedNow + 1);
                walk(nextPos, hitsNow, bluesNow + 1, seqNow + 'b', probNow * (1 - pY), usedNow + 1);
            } else if (t === 'L') {
                // Visual only
                walk(nextPos, hitsNow, bluesNow, seqNow + 'L', probNow, usedNow);
            } else {
                walk(nextPos, hitsNow, bluesNow, seqNow, probNow, usedNow);
            }
        }

        walk(0, hits, blues, seq, prob, usedRandom);
    }

    dfs({ hits: 0, blues: 0, seq: '', prob: 1, usedRandom: 0 });

    const groups = Array.from(resultsByBlue.entries())
        .map(([blue, { sequences, prob }]) => ({ blue: Number(blue), sequences, prob }))
        .sort((a, b) => a.blue - b.blue);
    for (const g of groups) g.sequences.sort();
    return groups;
}

function formatProbability(prob) {
    if (prob === 0) return '0';
    const asFraction = toFraction(prob);
    const percent = (prob * 100).toFixed(3).replace(/\.0+$/, '');
    return `${asFraction} (${percent}%)`;
}

// Simple fraction finder for probabilities with denominator power-of-two in typical defaults
function toFraction(x, tol = 1e-10) {
    // Continued fraction
    let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
    do {
        const a = Math.floor(b);
        const h2 = a * h1 + h0;
        const k2 = a * k1 + k0;
        const approx = h2 / k2;
        if (Math.abs(approx - x) < tol) return `${h2}/${k2}`;
        h0 = h1; h1 = h2; k0 = k1; k1 = k2; b = 1 / (b - a);
    } while (isFinite(b));
    return x.toFixed(6);
}

function buildDisplaySequenceHTML(raw) {
    let html = '';
    for (const ch of raw) {
        if (ch === 'Y') {
            html += '<span class="token token-yellow token-yellow-guaranteed" title="Guaranteed yellow ball"></span>';
        } else if (ch === 'y') {
            html += '<span class="token token-yellow" title="Random yellow ball"></span>';
        } else if (ch === 'b') {
            html += '<span class="token token-blue" title="Blue balls"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
        } else if (ch === 'B') {
            html += '<span class="token token-blue token-blue-guaranteed" title="Guaranteed blue balls"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
        } else if (ch === 'L') {
            html += '<span class="token token-lightning" title="Lightning">\
<svg class="bolt-icon" viewBox="0 0 12 16" aria-hidden="true" focusable="false">\
<path d="M7 0 L2.5 8 H6 L4.5 16 L11 7 H7.5 L10 0 Z"></path>\
</svg>\
</span>';
        } else {
            html += ch;
        }
    }
    return html;
}

function render(groups) {
    const resultsEl = document.getElementById('results');
    const summaryEl = document.getElementById('summary');
    const statsEl = document.getElementById('stats');
    const iconMode = document.getElementById('iconToggle') && document.getElementById('iconToggle').checked !== false;

    const totalProb = groups.reduce((s, g) => s + g.prob, 0);
    const ncap = Number(document.getElementById('maxRandomCap').value);
    const maxBlueShown = groups.length ? groups[groups.length - 1].blue : 0;

    // Theoretical maximum blue balls (ignoring random-cap):
    // If G == 0 → unbounded (∞). If G > 0 → the fight must finish at or before cycle C = ceil(H/G).
    // To maximize blues, make all random flips blue and finish via guarantees at the start of cycle C,
    // so no random flips occur in cycle C. Therefore, max blues = (C - 1) * R.
    (function updateMaxTheoretical() {
        const H = Number(document.getElementById('hitsToWin').value);
        const patt = String(document.getElementById('cyclePattern').value || '').toUpperCase();
        const core = patt; // whole string is the repeating cycle; L is visual only
        if (!core.length) { summaryEl.textContent = `Groups: ${groups.length}, Random flips cap: ${ncap}, Max blue shown: ${maxBlueShown}, Max theoretical blue: 0, Total probability: ${formatProbability(totalProb)}`; return; }

        let cumY = [0], cumBlueCap = [0];
        for (let i = 0; i < core.length; i++) {
            const ch = core[i];
            cumY[i + 1] = cumY[i] + (ch === 'Y' ? 1 : 0);
            cumBlueCap[i + 1] = cumBlueCap[i] + ((ch === '?' || ch === 'B') ? 1 : 0);
        }
        const Gper = cumY[core.length];
        const BcapPer = cumBlueCap[core.length];

        if (Gper === 0) {
            summaryEl.textContent = `Max theoretical blue: ∞, Max blue shown: ${maxBlueShown}, Total probability: ${formatProbability(totalProb)}`;
            return;
        }

        let C = Math.ceil(H / Gper);
        let maxBlue = 0;
        while (true) {
            const baseY = (C - 1) * Gper;
            const needY = H - baseY;
            if (needY <= 0) { maxBlue = (C - 1) * BcapPer; break; }
            let j = 0;
            while (j <= core.length && cumY[j] < needY) j++;
            if (j <= core.length) { maxBlue = (C - 1) * BcapPer + cumBlueCap[j]; break; }
            C++;
        }

        summaryEl.textContent = `Max theoretical blue: ${maxBlue}, Max blue shown: ${maxBlueShown}, Total probability: ${formatProbability(totalProb)}`;
    })();

    // Compute distribution stats over currently shown groups
    const pmf = groups.map(g => ({ k: g.blue, p: g.prob }));
    const totalP = pmf.reduce((s, x) => s + x.p, 0) || 1;
    const mean = pmf.reduce((s, x) => s + x.k * x.p, 0) / totalP;
    const variance = pmf.reduce((s, x) => s + Math.pow(x.k - mean, 2) * x.p, 0) / totalP;
    const stddev = Math.sqrt(Math.max(0, variance));
    // Median: smallest m such that CDF >= 0.5; if CDF equals 0.5 at m, also report next value
    let cdf = 0, medianLow = null, medianHigh = null;
    for (const x of pmf.sort((a, b) => a.k - b.k)) {
        const prev = cdf;
        cdf += x.p / totalP;
        if (medianLow === null && cdf >= 0.5) {
            if (prev < 0.5 && cdf > 0.5) {
                medianLow = x.k; medianHigh = null;
            } else if (cdf === 0.5) {
                medianLow = x.k;
                const next = pmf.find(y => y.k > x.k);
                medianHigh = next ? next.k : x.k;
            }
        }
    }
    if (medianLow === null && pmf.length) medianLow = pmf[pmf.length - 1].k;
    // Modes: all k with highest probability
    let modeP = -1;
    for (const x of pmf) { if (x.p > modeP) { modeP = x.p; } }
    const eps = 1e-12;
    const modes = pmf.filter(x => Math.abs(x.p - modeP) < eps).map(x => x.k).sort((a, b) => a - b);

    const medianText = (medianHigh === null ? String(medianLow) : `${medianLow}, ${medianHigh}`);
    const modesText = modes.join(', ');
    statsEl.innerHTML = `
        <div class=\"stat\">Average: <strong>${mean.toFixed(3)}</strong></div>
        <div class=\"stat\">Std dev: <strong>${stddev.toFixed(3)}</strong></div>
        <div class=\"stat\">Median: <strong>${medianText}</strong></div>
        <div class=\"stat\">Mode: <strong>${modesText}</strong></div>
    `;

    resultsEl.innerHTML = '';

    const maxRowWidth = resultsEl.clientWidth || (window.innerWidth - 40);
    const rows = [];
    let currentRow = [];
    let currentWidth = 0;

    function measureWidthForGroup(g) {
        const longestSeq = g.sequences.reduce((m, s) => Math.max(m, s.length), 0);
        const tokenWidth = 18 + 6;
        const base = iconMode ? (longestSeq * tokenWidth + 120) : (longestSeq * 8 + 160);
        return Math.max(260, Math.min(base, 1000));
    }

    const widths = groups.map(g => measureWidthForGroup(g));
    const gap = 14;
    for (let i = 0; i < groups.length; i++) {
        const w = widths[i];
        if (currentWidth > 0 && currentWidth + gap + w > maxRowWidth) {
            rows.push({ items: currentRow });
            currentRow = [groups[i]];
            currentWidth = w;
        } else {
            currentRow.push(groups[i]);
            currentWidth += (currentWidth === 0 ? w : (gap + w));
        }
    }
    if (currentRow.length) rows.push({ items: currentRow });

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const rowEl = document.createElement('div');
        rowEl.className = 'row';
        let cols = row.items.length;

        // If this is the last row, pad columns to the capacity that could fit (leave empty slots)
        if (rowIndex === rows.length - 1 && cols > 0) {
            // Estimate additional capacity using the average measured width of items in this row
            const widthsInRow = row.items.map(g => measureWidthForGroup(g));
            const avgWidth = widthsInRow.reduce((a, b) => a + b, 0) / widthsInRow.length;
            let simulatedWidth = widthsInRow.reduce((a, b, i) => a + (i === 0 ? b : b + gap), 0);
            while (simulatedWidth + gap + avgWidth <= maxRowWidth) {
                cols += 1;
                simulatedWidth += (gap + avgWidth);
            }
        }

        rowEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        resultsEl.appendChild(rowEl);

        for (const g of row.items) {
            const groupEl = document.createElement('div');
            groupEl.className = 'group';
            const header = document.createElement('div');
            header.className = 'group-header';
            const h = document.createElement('h3');
            h.textContent = `Blue balls = ${g.blue}`;
            const p = document.createElement('div');
            p.className = 'prob';
            p.textContent = formatProbability(g.prob);
            header.appendChild(h);
            header.appendChild(p);
            groupEl.appendChild(header);

            const firstSeq = g.sequences[0] || '';
            const randomOnly = firstSeq.replace(/[YBL]/g, '');
            const totalRandomFlips = randomOnly.length;
            const lastChar = firstSeq[firstSeq.length - 1] || '';
            const n = totalRandomFlips - (lastChar === 'y' ? 1 : 0);
            const k = g.blue;
            const combos = nCk(n, k);
            const yCountInFirst = (randomOnly.match(/y/g) || []).length;
            const kFromFirst = (randomOnly.match(/b/g) || []).length;
            const pOne = Math.pow(Number(document.getElementById('pY').value), yCountInFirst) * Math.pow(1 - Number(document.getElementById('pY').value), kFromFirst);
            const perComboEl = document.createElement('div');
            perComboEl.style.padding = '8px 12px';
            perComboEl.style.borderBottom = '1px solid #2a2e47';
            perComboEl.style.color = '#b8c0ff';
            perComboEl.innerHTML = `
            Combinations: C(${n}, ${k}) = <strong>${combos}</strong> <br/> Each: <strong>${formatProbability(pOne)}</strong>
        `;
            groupEl.appendChild(perComboEl);

            const list = document.createElement('div');
            list.className = 'list';
            for (const seq of g.sequences) {
                const item = document.createElement('div');
                if (iconMode) {
                    item.className = 'item tokens';
                    item.innerHTML = buildDisplaySequenceHTML(seq);
                } else {
                    item.className = 'item';
                    item.textContent = seq;
                }
                list.appendChild(item);
            }
            groupEl.appendChild(list);
            rowEl.appendChild(groupEl);
        }

        // Append invisible placeholders to fill the remaining slots in the last row
        if (rowIndex === rows.length - 1) {
            const missing = cols - row.items.length;
            for (let i = 0; i < missing; i++) {
                const placeholder = document.createElement('div');
                placeholder.className = 'group group--placeholder';
                rowEl.appendChild(placeholder);
            }
        }
    }
}

function getInputs() {
    return {
        hitsToWin: Number(document.getElementById('hitsToWin').value),
        cyclePattern: String(document.getElementById('cyclePattern').value || 'Y???L'),
        pY: Number(document.getElementById('pY').value),
        maxRandomCap: Number(document.getElementById('maxRandomCap').value),
    };
}

function computeAndRender() {
    const inputs = getInputs();
    const groups = enumerateSequences(inputs);
    render(groups);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('exampleBtn').addEventListener('click', () => {
        document.getElementById('hitsToWin').value = 6;
        document.getElementById('cyclePattern').value = 'Y???L';
        document.getElementById('pY').value = 0.5;
        document.getElementById('maxRandomCap').value = 16;
        computeAndRender();
    });
    const toggle = document.getElementById('iconToggle');
    if (toggle) toggle.addEventListener('change', computeAndRender);
    document.getElementById('cyclePattern').addEventListener('input', computeAndRender);
    document.getElementById('maxRandomCap').addEventListener('input', computeAndRender);
    document.getElementById('hitsToWin').addEventListener('input', computeAndRender);
    document.getElementById('pY').addEventListener('input', computeAndRender);
    computeAndRender();
});

function nCk(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let res = 1;
    for (let i = 1; i <= k; i++) {
        res = (res * (n - k + i)) / i;
    }
    return Math.round(res);
}
