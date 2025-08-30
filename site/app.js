// Agahnim blue-ball enumerator

function enumerateSequences({ hitsToWin, guaranteedPerCycle, randomPerCycle, pY }) {
    // Each cycle: 'Y' repeated guaranteedPerCycle, then randomPerCycle Bernoulli trials producing 'y' (success) or 'b' (blue)
    // Lightning 'L' is placed after every cycle end for readability; last cycle includes it in display but does not affect prob.

    const resultsByBlue = new Map(); // blueCount -> { sequences: string[], prob: number }

    function addResult(blueCount, sequence, probability) {
        if (!resultsByBlue.has(blueCount)) {
            resultsByBlue.set(blueCount, { sequences: [], prob: 0 });
        }
        const entry = resultsByBlue.get(blueCount);
        entry.sequences.push(sequence);
        entry.prob += probability;
    }

    // DFS over cycles until we reach hitsToWin reflectable hits
    function dfs(state) {
        const { hits, blues, seq, prob } = state;
        if (hits >= hitsToWin) {
            // Finished: do not append trailing 'L'
            addResult(blues, seq, prob);
            return;
        }

        // Begin a new cycle
        let cycleSeq = seq;
        let cycleHits = hits;
        let cycleProb = prob;

        // Deterministic guaranteed reflectables
        const guaranteedAdds = Math.min(guaranteedPerCycle, Math.max(0, hitsToWin - cycleHits));
        cycleHits += guaranteedAdds;
        cycleSeq += 'Y'.repeat(guaranteedAdds);
        // If we already finished within guaranteed
        if (cycleHits >= hitsToWin) {
            // Finished within guaranteed hits; no trailing 'L'
            addResult(blues, cycleSeq, cycleProb);
            return;
        }

        // Now branch over randomPerCycle Bernoulli trials in order (y/b)
        function branchRandomTrials(trialIndex, accHits, accBlues, accSeq, accProb) {
            if (accHits >= hitsToWin) {
                // Finished during random trials; no trailing 'L'
                addResult(accBlues, accSeq, accProb);
                return;
            }
            if (trialIndex >= randomPerCycle) {
                // End of cycle; add lightning separator and continue to next cycle
                dfs({ hits: accHits, blues: accBlues, seq: accSeq + 'L', prob: accProb });
                return;
            }

            // y: reflectable success
            branchRandomTrials(
                trialIndex + 1,
                accHits + 1,
                accBlues,
                accSeq + 'y',
                accProb * pY
            );

            // b: blue ball
            branchRandomTrials(
                trialIndex + 1,
                accHits,
                accBlues + 1,
                accSeq + 'b',
                accProb * (1 - pY)
            );
        }

        branchRandomTrials(0, cycleHits, blues, cycleSeq, cycleProb);
    }

    dfs({ hits: 0, blues: 0, seq: '', prob: 1 });

    // Convert to sorted array
    const groups = Array.from(resultsByBlue.entries())
        .map(([blue, { sequences, prob }]) => ({ blue: Number(blue), sequences, prob }))
        .sort((a, b) => a.blue - b.blue);

    // Sort sequences in each group for stable output
    for (const g of groups) {
        g.sequences.sort();
    }

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
    const iconMode = document.getElementById('iconToggle') && document.getElementById('iconToggle').checked !== false;

    const totalProb = groups.reduce((s, g) => s + g.prob, 0);
    const maxBlue = groups.length ? groups[groups.length - 1].blue : 0;
    summaryEl.textContent = `Groups: ${groups.length}, Max blue balls: ${maxBlue}, Total probability: ${formatProbability(totalProb)}`;

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
            const lastChar = firstSeq[firstSeq.length - 1] || '';
            const randomOnly = firstSeq.replace(/[YL]/g, '');
            const totalRandomFlips = randomOnly.length;
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
        guaranteedPerCycle: Number(document.getElementById('guaranteedPerCycle').value),
        randomPerCycle: Number(document.getElementById('randomPerCycle').value),
        pY: Number(document.getElementById('pY').value),
    };
}

function computeAndRender() {
    const inputs = getInputs();
    const groups = enumerateSequences(inputs);
    render(groups);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('computeBtn').addEventListener('click', computeAndRender);
    document.getElementById('exampleBtn').addEventListener('click', () => {
        document.getElementById('hitsToWin').value = 6;
        document.getElementById('guaranteedPerCycle').value = 1;
        document.getElementById('randomPerCycle').value = 3;
        document.getElementById('pY').value = 0.5;
        computeAndRender();
    });
    const toggle = document.getElementById('iconToggle');
    if (toggle) toggle.addEventListener('change', computeAndRender);
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
