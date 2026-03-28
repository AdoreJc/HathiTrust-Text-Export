// ==UserScript==
// @name         HathiTrust Text Export UI + seq/num
// @namespace    AdoreJc
// @version      1.0
// @description  Export selected HathiTrust Text-only pages to TXT with seq/num mode
// @supportURL   https://github.com/AdoreJc/HathiTrust-Text-Export/issues
// @license      MIT
// @match        https://babel.hathitrust.org/cgi/ssd*
// @grant        GM_download
// ==/UserScript==

(function () {
    'use strict';

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function cleanTextFromNode(node) {
        return node.textContent
            .replace(/\r/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function getSeqFromUrlOrDoc(doc, currentUrl) {
        const url = new URL(currentUrl, location.origin);

        const seqFromQuery = url.searchParams.get('seq');
        if (seqFromQuery && /^\d+$/.test(seqFromQuery)) {
            return parseInt(seqFromQuery, 10);
        }

        const hashMatch = url.hash.match(/seq(\d+)/i);
        if (hashMatch) {
            return parseInt(hashMatch[1], 10);
        }

        const h2 = doc.querySelector('#mdpContentContainer h2[id^="seq"]');
        if (h2 && h2.id) {
            const m = h2.id.match(/^seq(\d+)$/i);
            if (m) return parseInt(m[1], 10);
        }

        return null;
    }

    function getNumFromTitle(title) {
        const m = title.match(/Page\s+(\d+)/i);
        return m ? parseInt(m[1], 10) : null;
    }

    function parsePageFromDocument(doc, currentUrl) {
        const container = doc.querySelector('#mdpContentContainer');
        if (!container) {
            throw new Error('Cannot find #mdpContentContainer');
        }

        const h2 = container.querySelector('h2');
        if (!h2) {
            throw new Error('Cannot find page title h2');
        }

        const title = h2.textContent.trim();
        const num = getNumFromTitle(title);
        const seq = getSeqFromUrlOrDoc(doc, currentUrl);

        const mdpPage = container.querySelector('#mdpPage');
        if (!mdpPage) {
            throw new Error('Cannot find #mdpPage');
        }

        const paragraphs = [...mdpPage.querySelectorAll('p')];
        const bodyParts = [];

        for (const p of paragraphs) {
            const raw = p.textContent.replace(/\s+/g, ' ').trim();
            if (!raw) continue;
            if (/Previous Page|Next Page|Return to top/i.test(raw)) continue;

            const cleaned = cleanTextFromNode(p);
            if (cleaned) bodyParts.push(cleaned);
        }

        const bodyText = bodyParts.join('\n\n').trim();

        let nextUrl = null;
        const nextLink = [...doc.querySelectorAll('a')].find(a =>
            /Next Page/i.test(a.textContent)
        );
        if (nextLink && nextLink.getAttribute('href')) {
            nextUrl = new URL(nextLink.getAttribute('href'), currentUrl).href;
        }

        return { seq, num, title, bodyText, nextUrl };
    }

    function getCurrentValue(pageInfo, mode) {
        return mode === 'seq' ? pageInfo.seq : pageInfo.num;
    }

    async function fetchDocument(url) {
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${url}`);
        }

        const html = await res.text();
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function getSafeBookTitle() {
        const h1 = document.querySelector('#mdpPageHeader h1');
        const raw = h1 ? h1.textContent.trim() : 'HathiTrust_Text_Export';
        return raw
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 120);
    }

    function downloadText(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);

        GM_download({
            url: blobUrl,
            name: filename,
            saveAs: true,
            onload: () => {
                setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
            },
            onerror: (e) => {
                console.error('Download failed', e);
                alert('Download failed. Check the console for details.');
            }
        });
    }

    async function runExport(startValue, endValue, mode, btn, statusEl) {
        const results = [];
        const visited = new Set();

        let doc = document;
        let currentUrl = location.href;

        while (true) {
            if (visited.has(currentUrl)) {
                console.warn('Duplicate page detected, stopping:', currentUrl);
                break;
            }
            visited.add(currentUrl);

            const pageInfo = parsePageFromDocument(doc, currentUrl);
            const currentValue = getCurrentValue(pageInfo, mode);

            const progressText = currentValue == null
                ? `Exporting... ${mode.toUpperCase()} N/A`
                : `Exporting... ${mode} ${currentValue}`;

            btn.textContent = progressText;
            if (statusEl) {
                statusEl.textContent = `Processing: ${pageInfo.title} | seq=${pageInfo.seq ?? 'N/A'} | num=${pageInfo.num ?? 'N/A'}`;
            }

            console.log(`Parsed: ${pageInfo.title} | num=${pageInfo.num} | seq=${pageInfo.seq}`);

            if (currentValue === null || currentValue === undefined) {
                if (mode === 'num') {
                    console.warn('Current page has no usable num, skipped:', pageInfo.title);
                }
            } else if (currentValue >= startValue && currentValue <= endValue) {
                results.push(`${pageInfo.title}\n\n${pageInfo.bodyText}`);
            }

            if (currentValue !== null && currentValue !== undefined && currentValue >= endValue) {
                break;
            }

            if (!pageInfo.nextUrl) {
                console.warn('Next Page not found, stopping early');
                break;
            }

            await sleep(1500);
            doc = await fetchDocument(pageInfo.nextUrl);
            currentUrl = pageInfo.nextUrl;
        }

        if (!results.length) {
            alert('No content was captured.');
            return;
        }

        const outputName = `${getSafeBookTitle()}_${mode}_${startValue}_${endValue}.txt`;
        const finalText = results.join('\n\n' + '='.repeat(80) + '\n\n');
        downloadText(outputName, finalText);

        btn.textContent = 'Export TXT';
        if (statusEl) {
            statusEl.textContent = `Done. Exported ${results.length} page(s).`;
        }
        alert(`Done: mode=${mode}, exported ${results.length} page(s).`);
    }

    function addUI() {
        if (document.getElementById('ht-export-panel')) return;

        let currentSeq = '';
        let currentNum = '';

        try {
            const info = parsePageFromDocument(document, location.href);
            currentSeq = info.seq ?? '';
            currentNum = info.num ?? '';
        } catch (e) {
            console.warn('Failed to read current page info', e);
        }

        const defaultMode = currentNum !== '' ? 'num' : 'seq';
        const defaultValue = defaultMode === 'num' ? currentNum : currentSeq;

        const panel = document.createElement('div');
        panel.id = 'ht-export-panel';

        Object.assign(panel.style, {
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            zIndex: '999999',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '10px',
            padding: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            minWidth: '280px'
        });

        panel.innerHTML = `
            <div style="font-weight:bold; margin-bottom:8px;">HathiTrust TXT Export</div>
            <div style="margin-bottom:4px;">Current num: ${currentNum === '' ? 'N/A' : currentNum}</div>
            <div style="margin-bottom:8px;">Current seq: ${currentSeq === '' ? 'N/A' : currentSeq}</div>

            <label style="display:block; margin-bottom:8px;">
                Mode:
                <select id="ht-mode" style="width:100%; margin-top:4px; box-sizing:border-box;">
                    <option value="num" ${defaultMode === 'num' ? 'selected' : ''}>num (book page)</option>
                    <option value="seq" ${defaultMode === 'seq' ? 'selected' : ''}>seq (scan sequence)</option>
                </select>
            </label>

            <label style="display:block; margin-bottom:6px;">
                Start:
                <input id="ht-start-page" type="number" value="${defaultValue}" style="width:100%; margin-top:4px; box-sizing:border-box;">
            </label>

            <label style="display:block; margin-bottom:10px;">
                End:
                <input id="ht-end-page" type="number" value="${defaultValue}" style="width:100%; margin-top:4px; box-sizing:border-box;">
            </label>

            <button id="ht-export-btn" style="
                width:100%;
                padding:8px 10px;
                background:#2563eb;
                color:#fff;
                border:none;
                border-radius:8px;
                cursor:pointer;
            ">Export TXT</button>

            <div id="ht-export-status" style="
                margin-top:8px;
                font-size:12px;
                color:#444;
                line-height:1.4;
                word-break:break-word;
            ">Ready.</div>
        `;

        document.body.appendChild(panel);

        const btn = document.getElementById('ht-export-btn');
        const modeSelect = document.getElementById('ht-mode');
        const startInput = document.getElementById('ht-start-page');
        const endInput = document.getElementById('ht-end-page');
        const statusEl = document.getElementById('ht-export-status');

        modeSelect.addEventListener('change', () => {
            const mode = modeSelect.value;
            const val = mode === 'num' ? currentNum : currentSeq;
            startInput.value = val;
            endInput.value = val;
        });

        btn.addEventListener('click', async () => {
            const mode = modeSelect.value;
            const startValue = parseInt(startInput.value, 10);
            const endValue = parseInt(endInput.value, 10);

            if (!Number.isInteger(startValue) || !Number.isInteger(endValue)) {
                alert('Please enter valid numbers.');
                return;
            }

            if (startValue > endValue) {
                alert('Start cannot be greater than End.');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Starting...';
            statusEl.textContent = 'Preparing export...';

            try {
                await runExport(startValue, endValue, mode, btn, statusEl);
            } catch (err) {
                console.error(err);
                alert('Export failed: ' + err.message);
                statusEl.textContent = 'Export failed: ' + err.message;
            } finally {
                btn.disabled = false;
                btn.textContent = 'Export TXT';
            }
        });
    }

    window.addEventListener('load', addUI);
})();
