(function() {
    const STORAGE_KEY = "FLOLITE_PRO_ADVANCED_DISPATCHER_V7";

    function getInitialState() {
        return {
            p0: [], p1: [], p2: [],
            activeTrackers: {}, 
            completedList: [],
            isEngineRunning: false,
            zoneLocks: {},
            pageC1: 1,
            pageC2: 1,
            pageC3: 1,
            pageC4: 1
        };
    }

    function loadState() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : getInitialState();
        } catch(e) {
            return getInitialState();
        }
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        renderUI();
    }

    let appState = loadState();
    let selectedReassignData = { oldCasper: "", tlId: "" };

    // Helper: Dynamic Extraction of Proxy User ID
    function extractDynamicProxyUser(assignedToCasper) {
        if (assignedToCasper && assignedToCasper.trim().length > 0) {
            return assignedToCasper.trim();
        }
        const sessionUser = localStorage.getItem("userId") || localStorage.getItem("casperId") || sessionStorage.getItem("user");
        if (sessionUser) return sessionUser.replace(/"/g, '').trim();

        return "system.user";
    }

    // Helper: Dynamic Extraction of CSRF Token from DOM / Cookie / JS Window Object
    function extractDynamicCsrfToken() {
        // 1. Check DOM Meta Tag
        const metaTag = document.querySelector('meta[name="csrf-token"]') || document.querySelector('meta[name="_csrf"]');
        if (metaTag && metaTag.content) return metaTag.content;

        // 2. Check Global Window Object (Common in Single Page Apps)
        if (window.csrfToken) return window.csrfToken;
        if (window.__CSRF_TOKEN__) return window.__CSRF_TOKEN__;

        // 3. Extract from Cookie
        const match = document.cookie.match(new RegExp('(^| )' + 'CSRF-TOKEN' + '=([^;]+)')) ||
                      document.cookie.match(new RegExp('(^| )' + 'XSRF-TOKEN' + '=([^;]+)'));
        if (match) return decodeURIComponent(match[2]);

        return "";
    }

    // Helper: Deduplicate Pending List by TL ID
    function deduplicateList(list) {
        const map = new Map();
        list.forEach(item => {
            const id = item["TL ID"] || item.tlId;
            if (id) {
                map.set(id.trim(), item);
            }
        });
        return Array.from(map.values());
    }

    // Helper: Unique Casper Lock Handler
    function assignUniqueTracker(casperId, newTrackerObj) {
        if (newTrackerObj.tlId && newTrackerObj.tlId !== "NONE") {
            const targetTl = newTrackerObj.tlId.trim();
            Object.keys(appState.activeTrackers).forEach(existingCasper => {
                if (existingCasper !== casperId && appState.activeTrackers[existingCasper].tlId === targetTl) {
                    delete appState.activeTrackers[existingCasper];
                }
            });
        }
        appState.activeTrackers[casperId] = newTrackerObj;
    }

    // ---------------------------------------------------------
    // 1. UI LAYOUT & MODAL CONTAINERS
    // ---------------------------------------------------------
    const existing = document.getElementById("flo-lite-app-root");
    if (existing) existing.remove();

    const rootContainer = document.createElement("div");
    rootContainer.id = "flo-lite-app-root";
    rootContainer.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999999;
        background: #f4f6f9; color: #212529; font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex; flex-direction: column; overflow: hidden;
    `;

    rootContainer.innerHTML = `
        <!-- TOP BRAND NAVBAR -->
        <div style="background: linear-gradient(90deg, #0b5ed7 0%, #0d6efd 100%); padding: 12px 24px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 3px 10px rgba(13, 110, 253, 0.2);">
            <div style="display: flex; align-items: center; gap: 16px;">
                <div style="background: #ffffff; color: #0d6efd; width: 38px; height: 38px; border-radius: 8px; font-weight: 900; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">⚡</div>
                <div>
                    <div style="font-size: 17px; font-weight: 800; letter-spacing: 0.3px; display: flex; align-items: center; gap: 8px;">
                        Flipkart Seller Merge Autoassign <span style="background: rgba(255,255,255,0.2); padding: 2px 10px; border-radius: 4px; font-size: 13px; font-weight: 700; border: 1px solid rgba(255,255,255,0.3);">boAt Enterprise</span>
                    </div>
                    <div style="font-size: 12px; opacity: 0.9; font-weight: 500;">Flo-Lite Outbound Dispatcher Engine v1.0</div>
                </div>
                <div style="margin-left: 12px; display: flex; align-items: center; gap: 8px;">
                    <span id="engineBadge" style="padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; background: #dc3545; color: #fff; letter-spacing: 0.5px;">STOPPED</span>
                    <span id="trackIntervalBadge" style="padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.18); color: #fff; border: 1px solid rgba(255,255,255,0.3);">Gap: Idle</span>
                </div>
            </div>

            <div style="display: flex; gap: 10px;">
                <button id="downloadDataBtn" style="background: #ffffff; color: #198754; border: none; padding: 9px 16px; border-radius: 6px; font-weight: 800; font-size: 13px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">📥 Download Data</button>
                <button id="openZoneLockModalBtn" style="background: #ffffff; color: #6f42c1; border: none; padding: 9px 16px; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🔒 Pick Zone Lock</button>
                <button id="toggleEngineBtn" style="background: #198754; color: #ffffff; border: none; padding: 9px 18px; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">▶️ Start Engine</button>
                <button id="resetAppBtn" style="background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.3); padding: 9px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">🗑️ Reset</button>
                <button id="closeUiBtn" style="background: #dc3545; color: #fff; border: none; padding: 9px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">❌ Close</button>
            </div>
        </div>

        <!-- MAIN BODY -->
        <div style="display: flex; flex: 1; overflow: hidden;">
            <!-- LEFT SIDEBAR -->
            <div style="width: 290px; background: #ffffff; border-right: 1px solid #e3e8ee; display: flex; flex-direction: column; padding: 14px; gap: 14px; box-shadow: 2px 0 5px rgba(0,0,0,0.01);">
                <div style="background: #ffffff; border-radius: 8px; border: 1px solid #0d6efd; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="background: #0d6efd; color: #ffffff; padding: 10px 12px; font-weight: 800; font-size: 13px; letter-spacing: 0.3px;">📁 CSV PRIORITY BUCKETS</div>
                    <div style="padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                        <button class="up-btn" data-bucket="p0" style="background: #fff5f5; color: #dc3545; border: 1px dashed #f5c2c7; padding: 10px 12px; border-radius: 6px; font-weight: 800; font-size: 13px; cursor: pointer; text-align: left; display: flex; justify-content: space-between; align-items: center;">
                            <span>🚨 Upload P0 Priority</span>
                            <span id="p0CountBadge" style="background: #dc3545; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 11px;">0</span>
                        </button>
                        <button class="up-btn" data-bucket="p1" style="background: #fff9e6; color: #b48200; border: 1px dashed #ffe69c; padding: 10px 12px; border-radius: 6px; font-weight: 800; font-size: 13px; cursor: pointer; text-align: left; display: flex; justify-content: space-between; align-items: center;">
                            <span>⚡ Upload P1 Priority</span>
                            <span id="p1CountBadge" style="background: #ffc107; color: #212529; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight:800;">0</span>
                        </button>
                        <button class="up-btn" data-bucket="p2" style="background: #e7f1ff; color: #0d6efd; border: 1px dashed #9ec5fe; padding: 10px 12px; border-radius: 6px; font-weight: 800; font-size: 13px; cursor: pointer; text-align: left; display: flex; justify-content: space-between; align-items: center;">
                            <span>📦 Upload P2 Priority</span>
                            <span id="p2CountBadge" style="background: #0d6efd; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 11px;">0</span>
                        </button>
                        <input type="file" id="bucketFileInput" accept=".csv" style="display: none;" />
                    </div>
                </div>

                <div style="background: #ffffff; border-radius: 8px; border: 1px solid #0d6efd; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="background: #0d6efd; color: #ffffff; padding: 10px 12px; font-weight: 800; font-size: 13px; letter-spacing: 0.3px;">🛠️ QUICK DISPATCH INJECTOR</div>
                    <div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: #495057; display: block; margin-bottom: 2px;">Picklist TL ID:</label>
                            <input type="text" id="injTl" placeholder="e.g. PL1688850170" style="width: 100%; background: #fff; border: 1px solid #ced4da; padding: 7px 9px; border-radius: 4px; font-size: 12px; box-sizing: border-box; outline: none;" />
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: #495057; display: block; margin-bottom: 2px;">Casper Picker ID:</label>
                            <input type="text" id="injCasper" placeholder="e.g. ca.3119223" style="width: 100%; background: #fff; border: 1px solid #ced4da; padding: 7px 9px; border-radius: 4px; font-size: 12px; box-sizing: border-box; outline: none;" />
                        </div>
                        <div>
                            <label style="font-size: 11px; font-weight: 700; color: #495057; display: block; margin-bottom: 2px;">Pick Zone Name:</label>
                            <input type="text" id="injZone" placeholder="e.g. FLOOR-1" style="width: 100%; background: #fff; border: 1px solid #ced4da; padding: 7px 9px; border-radius: 4px; font-size: 12px; box-sizing: border-box; outline: none;" />
                        </div>
                        <button id="injectBtn" style="background: #198754; color: #fff; border: none; padding: 10px; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 13px; margin-top: 4px;">🚀 Inject Assignment</button>
                    </div>
                </div>
            </div>

            <!-- RIGHT CONTAINER GRID DASHBOARD -->
            <div style="flex: 1; padding: 14px; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 14px; overflow: hidden; background: #f4f6f9;">
                
                <!-- CONTAINER 3: LOADED CSV DATA POOL -->
                <div style="background: #ffffff; border-radius: 8px; border: 1px solid #0d6efd; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                    <div style="background: #0d6efd; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                        <span>📂 Loaded CSV Data Pool</span>
                        <span id="c1Count" style="background: rgba(255,255,255,0.25); color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 800;">0</span>
                    </div>
                    <div style="overflow-y: auto; flex: 1; padding: 8px;" id="c1Table"></div>
                    <div id="c1Pagination" style="background:#f8fafc; padding:6px 12px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:11px;"></div>
                </div>

                <!-- CONTAINER 4: ACTIVE PICKERS & LIVE TRACKING -->
                <div style="background: #ffffff; border-radius: 8px; border: 1px solid #0d6efd; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                    <div style="background: #0d6efd; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                        <span>⚡ Active Pickers & Live Tracking</span>
                        <span id="c2Count" style="background: rgba(255,255,255,0.25); color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 800;">0</span>
                    </div>
                    <div style="overflow-y: auto; flex: 1; padding: 8px;" id="c2Table"></div>
                    <div id="c2Pagination" style="background:#f8fafc; padding:6px 12px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:11px;"></div>
                </div>

                <!-- CONTAINER 5: PENDING QUEUE & INLINE EDIT ALERTS -->
                <div style="background: #ffffff; border-radius: 8px; border: 1px solid #0d6efd; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                    <div style="background: #0d6efd; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                        <span>⏳ Pending Queue & Inline Edit Alerts</span>
                        <span id="c3Count" style="background: rgba(255,255,255,0.25); color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 800;">0</span>
                    </div>
                    <div style="overflow-y: auto; flex: 1; padding: 8px;" id="c3Table"></div>
                    <div id="c3Pagination" style="background:#f8fafc; padding:6px 12px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:11px;"></div>
                </div>

                <!-- CONTAINER 6: COMPLETED LIST -->
                <div style="background: #ffffff; border-radius: 8px; border: 1px solid #0d6efd; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
                    <div style="background: #0d6efd; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                        <span>✅ Completed Picklists ("Pick Summary")</span>
                        <span id="c4Count" style="background: rgba(255,255,255,0.25); color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 800;">0</span>
                    </div>
                    <div style="overflow-y: auto; flex: 1; padding: 8px;" id="c4Table"></div>
                    <div id="c4Pagination" style="background:#f8fafc; padding:6px 12px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:11px;"></div>
                </div>

            </div>
        </div>

        <!-- ZONE LOCK MODAL -->
        <div id="zoneLockModal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 1000000; justify-content: center; align-items: center; backdrop-filter: blur(2px);">
            <div style="background: #ffffff; padding: 24px; border-radius: 12px; width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); border: 1px solid #e3e8ee;">
                <h3 style="margin-top: 0; font-size: 16px; color: #0d6efd; font-weight: 800; display: flex; align-items: center; gap: 8px;">🔒 Configure Zone Lock</h3>
                <div style="margin-bottom: 14px;">
                    <label style="font-size: 12px; font-weight: 700; color: #495057;">Select Pick Zone:</label>
                    <select id="modalZoneSelect" style="width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px solid #ced4da; font-size: 13px; outline: none;"></select>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="font-size: 12px; font-weight: 700; color: #495057;">Enter Casper ID to Lock:</label>
                    <input type="text" id="modalCasperInput" placeholder="e.g. ca.4053845" style="width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px solid #ced4da; font-size: 13px; box-sizing: border-box; outline: none;" />
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="closeZoneModalBtn" style="background: #6c757d; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px;">Cancel</button>
                    <button id="confirmZoneLockBtn" style="background: #0d6efd; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 12px;">Confirm Lock</button>
                </div>
            </div>
        </div>

        <!-- REASSIGN MODAL CONTAINER -->
        <div id="customReassignModal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 1000001; justify-content: center; align-items: center; backdrop-filter: blur(3px);">
            <div style="background: #ffffff; border-radius: 12px; width: 440px; overflow: hidden; box-shadow: 0 12px 30px rgba(0,0,0,0.2); border: 1px solid #0d6efd;">
                <div style="background: #0d6efd; color: #fff; padding: 14px 20px; font-weight: 800; font-size: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <span>🔄 Reassign Picklist TL</span>
                    <span id="closeReassignModalBtn" style="cursor: pointer; font-size: 16px;">❌</span>
                </div>
                <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
                    <div>
                        <label style="font-size: 11px; font-weight: 700; color: #6c757d; display: block; margin-bottom: 3px;">Picklist TL ID:</label>
                        <input type="text" id="reassignModalTlId" readonly style="width: 100%; background: #e9ecef; border: 1px solid #ced4da; padding: 8px; border-radius: 6px; font-size: 13px; font-weight: 800; color: #0d6efd; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: 700; color: #6c757d; display: block; margin-bottom: 3px;">Current Casper ID:</label>
                        <input type="text" id="reassignModalOldCasper" readonly style="width: 100%; background: #e9ecef; border: 1px solid #ced4da; padding: 8px; border-radius: 6px; font-size: 13px; font-weight: 700; color: #495057; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 800; color: #212529; display: block; margin-bottom: 4px;">Enter New Casper ID:</label>
                        <input type="text" id="reassignModalNewCasper" placeholder="e.g. ca.3119223" style="width: 100%; background: #fff; border: 2px solid #0d6efd; padding: 9px; border-radius: 6px; font-size: 13px; font-weight: 700; box-sizing: border-box; outline: none;" />
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
                        <button id="cancelReassignModalBtn" style="background: #6c757d; color: #fff; border: none; padding: 9px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 12px;">Cancel</button>
                        <button id="confirmReassignModalBtn" style="background: #198754; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 12px; box-shadow: 0 2px 6px rgba(25,135,84,0.3);">🚀 Reassign Now</button>
                    </div>
                </div>
            </div>
        </div>

        <div style="background: #ffffff; padding: 8px 24px; font-size: 12px; color: #495057; border-top: 1px solid #e3e8ee; display: flex; justify-content: space-between;" id="logBar">
            <span>System Status: Ready.</span>
        </div>
    `;

    document.body.appendChild(rootContainer);

    // ---------------------------------------------------------
    // 2. API ASSIGN EXECUTION (DYNAMIC CSRF-TOKEN & DYNAMIC X-PROXY-USER)
    // ---------------------------------------------------------
    async function executeApiAssign(picklistId, assignedTo) {
        const assignApi = "http://10.24.1.71/flo-lite-routes-api/outbound-picking-proxy/api/v3.0/picklists/assign";
        const nowTimestamp = Date.now().toString();

        // Extracted Proxy User & Dynamic CSRF Token Logic
        const dynamicProxyUser = extractDynamicProxyUser(assignedTo);
        const dynamicCsrfToken = extractDynamicCsrfToken();

        const payload = {
            assignedTo: assignedTo.trim(),
            picklistIds: [picklistId.trim()]
        };

        const reqHeaders = {
            "accept": "*/*",
            "content-type": "application/json",
            "x-client-id": "WH",
            "x-event-time": nowTimestamp,
            "x-facility-id": "gur_san_wh_nl_01nl",
            "x-proxy-user": dynamicProxyUser,
            "x-tenant-id": "FKI",
            "x-trace-id": nowTimestamp,
            "x-user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 EKCL/website/1"
        };

        // Inject dynamic CSRF Token only if extracted successfully
        if (dynamicCsrfToken) {
            reqHeaders["csrf-token"] = dynamicCsrfToken;
        }

        try {
            const res = await window.fetch(assignApi, {
                method: "POST",
                headers: reqHeaders,
                referrer: "http://10.24.1.71/flo-lite/gur_san_wh_nl_01nl/v2/desktop/ncob/transfer-list",
                referrerPolicy: "strict-origin-when-cross-origin",
                body: JSON.stringify(payload),
                mode: "cors",
                credentials: "include"
            });

            return res.ok || res.status === 200 || res.status === 204;
        } catch(e) {
            return false;
        }
    }

    // Export CSV Data
    document.getElementById("downloadDataBtn").addEventListener("click", () => {
        const allPending = [...appState.p0, ...appState.p1, ...appState.p2];
        const trackerList = Object.keys(appState.activeTrackers).map(k => ({ casperId: k, ...appState.activeTrackers[k] }));

        let csvContent = "data:text/csv;charset=utf-8,";
        
        csvContent += "=== PENDING QUEUE ===\n";
        if (allPending.length > 0) {
            const headers = Object.keys(allPending[0]);
            csvContent += headers.join(",") + "\n";
            allPending.forEach(row => {
                csvContent += headers.map(h => `"${row[h] || ''}"`).join(",") + "\n";
            });
        }

        csvContent += "\n=== ACTIVE TRACKERS ===\n";
        csvContent += "CasperID,TL_ID,Pickzone,Status,Name\n";
        trackerList.forEach(t => {
            csvContent += `"${t.casperId}","${t.tlId}","${t.pickzone}","${t.status}","${t.name}"\n`;
        });

        csvContent += "\n=== COMPLETED LIST ===\n";
        if (appState.completedList.length > 0) {
            const headers = Object.keys(appState.completedList[0]);
            csvContent += headers.join(",") + "\n";
            appState.completedList.forEach(row => {
                csvContent += headers.map(h => `"${row[h] || ''}"`).join(",") + "\n";
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `FloLite_Report_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        log("📥 System Data Exported Successfully!");
    });

    // ---------------------------------------------------------
    // 3. BACKGROUND WORKER ENGINE
    // ---------------------------------------------------------
    async function startTrackerThread() {
        if (!appState.isEngineRunning) return;

        const activeTrackersList = Object.keys(appState.activeTrackers).filter(
            k => appState.activeTrackers[k].status === "TRACKING"
        );

        const activeCount = activeTrackersList.length;

        for (let casperId of activeTrackersList) {
            const tracker = appState.activeTrackers[casperId];
            const targetUrl = `http://10.24.1.71/flo-lite/gur_san_wh_nl_01nl/inbox/ncob/picking/${tracker.tlId}`;
            try {
                const res = await window.fetch(targetUrl, { credentials: "include" });
                const htmlText = await res.text();
                
                if (htmlText.includes("Pick Summary")) {
                    log(`🎉 "Pick Summary" verified for ${tracker.tlId}! Casper ${casperId} is now IDLE.`);
                    appState.completedList.push({
                        ...tracker,
                        casperId,
                        completedAt: new Date().toLocaleTimeString()
                    });
                    tracker.status = "IDLE";
                    saveState();
                }
            } catch(e) {}
        }

        if (appState.isEngineRunning) {
            let delayMs = activeCount <= 1 ? 30000 : 10000;
            const intervalBadge = document.getElementById("trackIntervalBadge");
            if (intervalBadge) {
                intervalBadge.innerText = `Track Gap: ${delayMs / 1000}s (${activeCount} Active)`;
            }
            setTimeout(startTrackerThread, delayMs);
        }
    }

    async function startAssignerThread() {
        if (!appState.isEngineRunning) return;

        let combinedPending = [...appState.p0, ...appState.p1, ...appState.p2];

        for (let casperId in appState.activeTrackers) {
            const tracker = appState.activeTrackers[casperId];

            if (tracker.status === "IDLE" || tracker.status === "UNASSIGNED") {
                if (combinedPending.length === 0) continue;

                let selectedIdx = -1;
                const lockedZone = appState.zoneLocks[casperId];

                if (lockedZone) {
                    selectedIdx = combinedPending.findIndex(item => item.Pickzone === lockedZone || item.pickzone === lockedZone);
                } else {
                    selectedIdx = combinedPending.findIndex(item => item.Pickzone === tracker.pickzone || item.pickzone === tracker.pickzone);
                    if (selectedIdx === -1) {
                        let maxQty = -1;
                        combinedPending.forEach((item, idx) => {
                            const q = parseInt(item.Qty || item.qty) || 1;
                            if (q > maxQty) { maxQty = q; selectedIdx = idx; }
                        });
                    }
                }

                if (selectedIdx !== -1) {
                    const targetTl = combinedPending[selectedIdx];
                    const tlId = targetTl["TL ID"] || targetTl.tlId;

                    log(`⚡ Executing Assignment: TL ${tlId} -> Casper ${casperId}`);
                    const isSuccess = await executeApiAssign(tlId, casperId);

                    if (isSuccess) {
                        assignUniqueTracker(casperId, {
                            tlId: tlId,
                            qty: targetTl.Qty || targetTl.qty || 1,
                            pickzone: targetTl.Pickzone || targetTl.pickzone || "GENERAL",
                            status: "TRACKING",
                            name: targetTl.Name || targetTl.name || "Picker"
                        });
                        removePendingItem(tlId);
                        saveState();
                        break;
                    } else {
                        targetTl.hasError = true;
                        targetTl.errorMsg = "Check Casper ID";
                        saveState();
                    }
                }
            }
        }

        if (appState.isEngineRunning) {
            setTimeout(startAssignerThread, 2000);
        }
    }

    function removePendingItem(tlId) {
        const filterFn = item => (item["TL ID"] || item.tlId) !== tlId;
        appState.p0 = appState.p0.filter(filterFn);
        appState.p1 = appState.p1.filter(filterFn);
        appState.p2 = appState.p2.filter(filterFn);
    }

    // ---------------------------------------------------------
    // 4. EVENT HANDLERS & MODAL CONTROLS
    // ---------------------------------------------------------
    let currentUploadBucket = "p0";
    const fileInput = document.getElementById("bucketFileInput");

    document.querySelectorAll(".up-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            currentUploadBucket = e.currentTarget.getAttribute("data-bucket");
            fileInput.click();
        });
    });

    fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const text = await file.text();
        const lines = text.replace(/\r/g, '').trim().split("\n");
        if (lines.length < 2) return;

        const headers = lines[0].split(",").map(h => h.trim());
        const parsedRows = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cells = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ''));
            const rowObj = { bucket: currentUploadBucket.toUpperCase() };
            
            headers.forEach((h, idx) => { rowObj[h] = cells[idx] || ""; });

            const casperId = rowObj["Casper ID"] || rowObj["casperId"];
            const tlId = rowObj["TL ID"] || rowObj["tlId"] || "NONE";

            if (casperId) {
                assignUniqueTracker(casperId, {
                    tlId: tlId,
                    qty: rowObj["Qty"] || rowObj["qty"] || 1,
                    pickzone: rowObj["Pickzone"] || rowObj["pickzone"] || "GENERAL",
                    status: "IDLE",
                    name: rowObj["Name"] || rowObj["name"] || "Picker"
                });
            }

            parsedRows.push(rowObj);
        }

        appState[currentUploadBucket] = deduplicateList([...appState[currentUploadBucket], ...parsedRows]);
        log(`Uploaded CSV Data in ${currentUploadBucket.toUpperCase()}`);
        saveState();
        fileInput.value = "";
    });

    // Reassign Modal Handlers
    function closeReassignModal() {
        document.getElementById("customReassignModal").style.display = "none";
        document.getElementById("reassignModalNewCasper").value = "";
    }

    document.getElementById("closeReassignModalBtn").addEventListener("click", closeReassignModal);
    document.getElementById("cancelReassignModalBtn").addEventListener("click", closeReassignModal);

    document.getElementById("confirmReassignModalBtn").addEventListener("click", async () => {
        const { oldCasper, tlId } = selectedReassignData;
        const newCasper = document.getElementById("reassignModalNewCasper").value.trim();

        if (!newCasper) { alert("Please enter New Casper ID!"); return; }

        log(`🔄 Reassigning TL ${tlId} -> ${newCasper}...`);
        const isSuccess = await executeApiAssign(tlId, newCasper);

        if (isSuccess) {
            const currentTracker = appState.activeTrackers[oldCasper] || {};
            delete appState.activeTrackers[oldCasper];

            assignUniqueTracker(newCasper, {
                tlId: tlId,
                qty: currentTracker.qty || 1,
                pickzone: currentTracker.pickzone || "GENERAL",
                status: "TRACKING",
                name: currentTracker.name || "Reassigned Picker"
            });

            saveState();
            closeReassignModal();
            log(`✅ Successfully Reassigned TL ${tlId} to ${newCasper}!`);
        } else {
            alert(`❌ API Failed for Casper ${newCasper}! Please check Casper ID.`);
        }
    });

    // Global Click Listener
    document.addEventListener("click", async (e) => {
        if (e.target.classList.contains("manual-reassign-btn")) {
            const oldCasper = e.target.getAttribute("data-casper");
            const tlId = e.target.getAttribute("data-tl");

            if (!tlId || tlId === "NONE") {
                alert("No active TL assigned to this picker to reassign!");
                return;
            }

            selectedReassignData = { oldCasper, tlId };
            document.getElementById("reassignModalTlId").value = tlId;
            document.getElementById("reassignModalOldCasper").value = oldCasper;
            document.getElementById("reassignModalNewCasper").value = oldCasper;
            document.getElementById("customReassignModal").style.display = "flex";
        }

        if (e.target.classList.contains("retry-assign-btn")) {
            const tlId = e.target.getAttribute("data-tl");
            const inputEl = document.querySelector(`.edit-casper-input[data-tl="${tlId}"]`);
            const newCasper = inputEl.value.trim();

            if (!newCasper) { alert("Enter Casper ID!"); return; }

            const isSuccess = await executeApiAssign(tlId, newCasper);

            if (isSuccess) {
                assignUniqueTracker(newCasper, { tlId: tlId, qty: 1, pickzone: "GENERAL", status: "TRACKING", name: "Re-assigned" });
                removePendingItem(tlId);
                saveState();
                log(`✅ Inline Re-assignment successful for ${tlId}!`);
            } else {
                alert("API Failed! Verify Casper ID again.");
            }
        }

        // Pagination Handler
        if (e.target.classList.contains("page-btn")) {
            const target = e.target.getAttribute("data-target");
            const action = e.target.getAttribute("data-action");
            if (action === "next") appState[target]++;
            else if (action === "prev" && appState[target] > 1) appState[target]--;
            renderUI();
        }
    });

    // Zone Lock Modal
    document.getElementById("openZoneLockModalBtn").addEventListener("click", () => {
        const allPending = [...appState.p0, ...appState.p1, ...appState.p2];
        const uniqueZones = new Set();
        allPending.forEach(i => { const z = i.Pickzone || i.pickzone; if (z) uniqueZones.add(z); });

        const select = document.getElementById("modalZoneSelect");
        select.innerHTML = uniqueZones.size === 0 ? `<option>No Zones Found</option>` : "";
        uniqueZones.forEach(z => { select.innerHTML += `<option value="${z}">${z}</option>`; });
        document.getElementById("zoneLockModal").style.display = "flex";
    });

    document.getElementById("closeZoneModalBtn").addEventListener("click", () => {
        document.getElementById("zoneLockModal").style.display = "none";
    });

    document.getElementById("confirmZoneLockBtn").addEventListener("click", () => {
        const zone = document.getElementById("modalZoneSelect").value;
        const casper = document.getElementById("modalCasperInput").value.trim();

        if (!zone || !casper) { alert("Zone & Casper ID required!"); return; }

        appState.zoneLocks[casper] = zone;
        if (!appState.activeTrackers[casper]) {
            assignUniqueTracker(casper, { tlId: "NONE", qty: 0, pickzone: zone, status: "IDLE", name: "Zone Locked Picker" });
        }
        saveState();
        document.getElementById("zoneLockModal").style.display = "none";
        log(`🔒 Zone Lock Set: Casper ${casper} -> Zone ${zone}`);
    });

    // Injector
    document.getElementById("injectBtn").addEventListener("click", async () => {
        const tlId = document.getElementById("injTl").value.trim();
        const casperId = document.getElementById("injCasper").value.trim();
        const zone = document.getElementById("injZone").value.trim() || "GENERAL";

        if (!tlId || !casperId) return alert("TL ID & Casper ID required!");

        const ok = await executeApiAssign(tlId, casperId);
        if (ok) {
            assignUniqueTracker(casperId, { tlId, qty: 1, pickzone: zone, status: "TRACKING", name: "Injected" });
            saveState();
            log(`🚀 Injected TL ${tlId} -> Casper ${casperId}`);
        } else {
            alert("Injection Assign API Failed!");
        }
    });

    // ---------------------------------------------------------
    // 5. RENDER UI WITH ALL CONTAINERS PAGINATED
    // ---------------------------------------------------------
    function renderUI() {
        const badge = document.getElementById("engineBadge");
        const toggleBtn = document.getElementById("toggleEngineBtn");
        
        if (appState.isEngineRunning) {
            badge.innerText = "RUNNING"; badge.style.background = "#198754";
            toggleBtn.innerText = "⏸️ Pause Engine"; toggleBtn.style.background = "#ffc107"; toggleBtn.style.color = "#212529";
        } else {
            badge.innerText = "STOPPED"; badge.style.background = "#dc3545";
            toggleBtn.innerText = "▶️ Start Engine"; toggleBtn.style.background = "#198754"; toggleBtn.style.color = "#ffffff";
        }

        document.getElementById("p0CountBadge").innerText = appState.p0.length;
        document.getElementById("p1CountBadge").innerText = appState.p1.length;
        document.getElementById("p2CountBadge").innerText = appState.p2.length;

        const allPending = [...appState.p0, ...appState.p1, ...appState.p2];

        // Container 1
        document.getElementById("c1Count").innerText = allPending.length;
        renderPaginatedTable("c1Table", "c1Pagination", allPending, appState.pageC1, "pageC1", createDynamicHeaderTable);

        // Container 2 (Active Trackers Paginated)
        const trackerList = Object.keys(appState.activeTrackers).map(k => ({ casperId: k, ...appState.activeTrackers[k] }));
        document.getElementById("c2Count").innerText = trackerList.length;
        renderPaginatedTable("c2Table", "c2Pagination", trackerList, appState.pageC2, "pageC2", createActiveTrackerTable);

        // Container 3
        document.getElementById("c3Count").innerText = allPending.length;
        renderPaginatedTable("c3Table", "c3Pagination", allPending, appState.pageC3, "pageC3", createPendingErrorTable);

        // Container 4
        document.getElementById("c4Count").innerText = appState.completedList.length;
        renderPaginatedTable("c4Table", "c4Pagination", appState.completedList, appState.pageC4, "pageC4", createDynamicHeaderTable);
    }

    function renderPaginatedTable(tableElemId, pagElemId, dataArr, currentPage, stateKey, tableGeneratorFn) {
        const pageSize = 10;
        const totalPages = Math.ceil(dataArr.length / pageSize) || 1;
        const safePage = Math.min(Math.max(1, currentPage), totalPages);
        appState[stateKey] = safePage;

        const startIndex = (safePage - 1) * pageSize;
        const pageData = dataArr.slice(startIndex, startIndex + pageSize);

        document.getElementById(tableElemId).innerHTML = tableGeneratorFn(pageData);

        const pagContainer = document.getElementById(pagElemId);
        if (pagContainer) {
            pagContainer.innerHTML = `
                <span style="font-weight:700; color:#64748b;">Showing ${dataArr.length === 0 ? 0 : startIndex + 1}-${Math.min(startIndex + pageSize, dataArr.length)} of ${dataArr.length}</span>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="page-btn" data-target="${stateKey}" data-action="prev" ${safePage <= 1 ? 'disabled' : ''} style="padding:3px 8px; font-size:11px; font-weight:700; cursor:pointer;">&lt; Prev</button>
                    <span style="font-weight:800; color:#0d6efd;">Page ${safePage} / ${totalPages}</span>
                    <button class="page-btn" data-target="${stateKey}" data-action="next" ${safePage >= totalPages ? 'disabled' : ''} style="padding:3px 8px; font-size:11px; font-weight:700; cursor:pointer;">Next &gt;</button>
                </div>
            `;
        }
    }

    function createDynamicHeaderTable(arr) {
        if (!arr || arr.length === 0) return `<div style="font-size:12px; color:#a0aec0; padding:14px; text-align:center;">No items present.</div>`;
        const headers = Object.keys(arr[0]).filter(k => k !== "hasError" && k !== "errorMsg");
        
        let html = `<table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#f8fafc; color:#475569; text-align:left;">`;
        headers.forEach(h => html += `<th style="padding:7px 10px; border-bottom:1px solid #e2e8f0; font-weight:800;">${h}</th>`);
        html += `</tr></thead><tbody>`;

        arr.forEach(row => {
            html += `<tr style="border-bottom:1px solid #f1f5f9;">`;
            headers.forEach(h => html += `<td style="padding:7px 10px; color:#334155; font-weight:500;">${row[h] || ''}</td>`);
            html += `</tr>`;
        });
        return html + `</tbody></table>`;
    }

    function createActiveTrackerTable(trackers) {
        if (!trackers || trackers.length === 0) return `<div style="font-size:12px; color:#a0aec0; padding:14px; text-align:center;">No active pickers.</div>`;
        let html = `<table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#f8fafc; color:#475569; text-align:left;">
            <th>CASPER ID</th><th>ACTIVE TL</th><th>ZONE</th><th>LOCK</th><th>STATUS</th><th style="text-align:center;">REASSIGN</th>
        </tr></thead><tbody>`;

        trackers.forEach(t => {
            const lockedZone = appState.zoneLocks[t.casperId];
            html += `<tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:7px 10px; font-weight:800; color:#1e293b;">${t.casperId}</td>
                <td style="padding:7px 10px; color:#0d6efd; font-weight:700;">${t.tlId}</td>
                <td style="padding:7px 10px;">${t.pickzone}</td>
                <td style="padding:7px 10px; font-weight:800;">${lockedZone ? '<span style="color:#6f42c1;">🔒 ' + lockedZone + '</span>' : '<span style="color:#94a3b8;">🔓 OFF</span>'}</td>
                <td style="padding:7px 10px;"><span style="background:${t.status==='TRACKING'?'#fff7ed':'#f0fdf4'}; color:${t.status==='TRACKING'?'#c2410c':'#15803d'}; padding:3px 10px; border-radius:12px; font-weight:800; font-size:11px;">${t.status}</span></td>
                <td style="padding:7px 10px; text-align:center;">
                    <button class="manual-reassign-btn" data-casper="${t.casperId}" data-tl="${t.tlId}" style="background:#0d6efd; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-weight:800; cursor:pointer; font-size:12px;" title="Click to Open Reassign Container Modal">🔄</button>
                </td>
            </tr>`;
        });
        return html + `</tbody></table>`;
    }

    function createPendingErrorTable(arr) {
        if (!arr || arr.length === 0) return `<div style="font-size:12px; color:#a0aec0; padding:14px; text-align:center;">Pending Queue Empty.</div>`;
        
        let html = `<table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr style="background:#f8fafc; color:#475569; text-align:left;">
            <th style="padding:7px 10px;">BUCKET</th><th style="padding:7px 10px;">TL ID</th><th style="padding:7px 10px;">ZONE</th><th style="padding:7px 10px;">CASPER ID</th><th style="padding:7px 10px;">STATUS / ACTION</th>
        </tr></thead><tbody>`;

        arr.forEach(row => {
            const tl = row["TL ID"] || row.tlId;
            const casper = row["Casper ID"] || row.casperId;
            const zone = row["Pickzone"] || row.pickzone;

            html += `<tr style="border-bottom:1px solid #e2e8f0; ${row.hasError ? 'background:#fff5f5;' : ''}">
                <td style="padding:7px 10px;"><span style="background:#e2e8f0; padding:2px 8px; border-radius:4px; font-weight:800; font-size:11px;">${row.bucket || 'P0'}</span></td>
                <td style="padding:7px 10px; font-weight:700; color:#0d6efd;">${tl}</td>
                <td style="padding:7px 10px;">${zone}</td>
                <td style="padding:7px 10px;">${casper}</td>
                <td style="padding:7px 10px;">`;
            
            if (row.hasError) {
                html += `<div style="display:flex; align-items:center; gap:6px;">
                    <span style="color:#dc3545; font-weight:800; font-size:11px;">❌ Check Casper ID</span>
                    <input type="text" class="edit-casper-input" data-tl="${tl}" value="${casper}" style="width:85px; font-size:11px; padding:4px; border:1px solid #dc3545; border-radius:4px; outline:none;" />
                    <button class="retry-assign-btn" data-tl="${tl}" style="background:#198754; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:800; cursor:pointer;">Retry</button>
                </div>`;
            } else {
                html += `<span style="color:#64748b; font-weight:600;">Waiting In Queue</span>`;
            }

            html += `</td></tr>`;
        });
        return html + `</tbody></table>`;
    }

    function log(msg) {
        document.getElementById("logBar").innerHTML = `<span><b>[${new Date().toLocaleTimeString()}]</b> ${msg}</span><span style="font-weight:800; color:#0d6efd;">ishvarikumar.vc@flipkart.com</span>`;
    }

    // Engine Toggle
    document.getElementById("toggleEngineBtn").addEventListener("click", () => {
        appState.isEngineRunning = !appState.isEngineRunning;
        saveState();
        if (appState.isEngineRunning) { startAssignerThread(); startTrackerThread(); }
    });

    document.getElementById("resetAppBtn").addEventListener("click", () => {
        if (confirm("Reset application data?")) {
            localStorage.removeItem(STORAGE_KEY);
            appState = getInitialState();
            renderUI();
        }
    });

    document.getElementById("closeUiBtn").addEventListener("click", () => rootContainer.remove());

    renderUI();
    if (appState.isEngineRunning) { startAssignerThread(); startTrackerThread(); }
})();

