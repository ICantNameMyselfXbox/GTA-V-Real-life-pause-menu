document.addEventListener('DOMContentLoaded', () => {
    console.log("+++ GTA V Pause Menu v1.3.5 Loaded +++");
    // --- Audio Setup ---
    const sounds = {
        changeOption: new Audio('sfx and music/changeoption.mp3'),
        switchTab: new Audio('sfx and music/switchtab.mp3'),
        tabLoaded: new Audio('sfx and music/tabloaded.mp3'),
        back: new Audio('sfx and music/back.mp3'),
        music: new Audio('sfx and music/pausemenumusic.mp3')
    };

    // Set volumes
    Object.values(sounds).forEach(sound => sound.volume = 0.5);
    sounds.music.loop = true;
    sounds.music.volume = 0.3;

    // Start music on first interaction (browser policy)
    document.body.addEventListener('click', () => {
        if (sounds.music.paused) {
            sounds.music.play().catch(e => console.log('Audio play failed:', e));
        }
    }, { once: true });

    // --- Tab Navigation ---
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    function switchTab(tabName) {
        // Play sound
        sounds.switchTab.currentTime = 0;
        sounds.switchTab.play().catch(() => { });

        // Update Nav
        navItems.forEach(item => {
            if (item.dataset.tab === tabName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update Content
        tabContents.forEach(content => {
            if (content.id === tabName) {
                content.classList.add('active');
                // Trigger map resize if map tab
                if (tabName === 'map' && map) {
                    setTimeout(() => map.resize(), 100);
                }
            } else {
                content.classList.remove('active');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            sounds.changeOption.currentTime = 0;
            sounds.changeOption.play().catch(() => { });
        });

        item.addEventListener('click', () => {
            const tabName = item.dataset.tab;
            switchTab(tabName);
        });
    });

    // --- Geolocation & Live Data ---
    const clockElement = document.getElementById('real-time-clock');

    // Update Clock
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        if (clockElement) clockElement.textContent = `${hours}:${minutes}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Map Initialization (MapLibre GL JS)
    const apiKey = 'xZ5mRqiLKIk5P0G37FF9';
    const mapId = '0196a9ff-ca5a-72a8-b5e3-71deec7a5e00';
    const styleUrl = `https://api.maptiler.com/maps/${mapId}/style.json?key=${apiKey}`;

    const map = new maplibregl.Map({
        container: 'map-container',
        style: styleUrl,
        center: [-0.09, 51.505], // Default London
        zoom: 13,
        attributionControl: false
    });

    map.on('load', () => {
        startFlightRadar();
        initStaticMapLayers();
        initStaticBlips();
    });

    // Add navigation controls (optional, keep minimal for GTA style)
    // map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Fetch User Location
    let multiplayerInitialized = false;
    let playerMarker = null;

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Update global userPos for PeerJS heartbeat
            userPos.lat = lat;
            userPos.lng = lng;

            if (!playerMarker) {
                // First time setup
                const playerMarkerEl = document.createElement('div');
                playerMarkerEl.className = 'player-blip';

                // Create the visible icon
                const icon = document.createElement('div');
                icon.className = 'blip-icon';
                playerMarkerEl.appendChild(icon);

                // Create Name Tag for self
                const nameTag = document.createElement('span');
                nameTag.className = 'blip-name-tag';
                nameTag.innerText = 'YOU';
                playerMarkerEl.appendChild(nameTag);

                // --- MOBILE TOUCH SUPPORT (Personal Blip) ---
                playerMarkerEl.addEventListener('click', (e) => {
                    e.preventDefault(); // Stop map drag
                    playerMarkerEl.classList.add('show-name');
                    if (playerMarkerEl.hideTimer) clearTimeout(playerMarkerEl.hideTimer);
                    playerMarkerEl.hideTimer = setTimeout(() => {
                        playerMarkerEl.classList.remove('show-name');
                    }, 3000);
                    e.stopPropagation();
                });

                playerMarker = new maplibregl.Marker({
                    element: playerMarkerEl,
                    anchor: 'center',
                    rotationAlignment: 'viewport',
                    pitchAlignment: 'viewport'
                })
                    .setLngLat([lng, lat])
                    .addTo(map);

                map.flyTo({ center: [lng, lat], zoom: 15, essential: true });

                // Initialize Multiplayer once
                if (!multiplayerInitialized) {
                    initMultiplayer(lat, lng);
                    multiplayerInitialized = true;
                }

                // Initial data fetches
                fetchWeather(lat, lng);
                fetchLocationName(lat, lng);
            } else {
                // Update existing marker
                playerMarker.setLngLat([lng, lat]);

                // Track real GPS distance traveled
                if (typeof turf !== 'undefined' && lastMapPos) {
                    const from = turf.point([lastMapPos.lng, lastMapPos.lat]);
                    const to = turf.point([lng, lat]);
                    const dist = turf.distance(from, to, { units: 'kilometers' });
                    if (dist > 0.005 && dist < 5) { // ignore tiny GPS jitter (<5m) and huge jumps
                        stats.distance += dist;
                        localStorage.setItem('gta_stats_dist', stats.distance);
                        updateStatsUI();
                    }
                }
            }
            // Always update lastMapPos with current GPS position
            lastMapPos = { lat, lng };

            // Update Coordinates Display
            const coordText = document.querySelector('.coordinates');
            if (coordText) {
                const ns = lat >= 0 ? 'N' : 'S';
                const ew = lng >= 0 ? 'E' : 'W';
                coordText.innerText = `${ns} ${Math.abs(lat).toFixed(4)}°  ${ew} ${Math.abs(lng).toFixed(4)}°`;
            }



        }, error => {
            console.error("Geolocation error:", error);
            const locName = document.querySelector('.location-name');
            if (locName) locName.innerText = "Location Unavailable";
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }

    // --- Network Awareness (Mobile Data / WiFi switching) ---
    window.addEventListener('online', () => {
        console.log("+++ Network back ONLINE. Reconnecting multiplayer... +++");
        const statusEl = document.querySelector('.connection-status');
        if (statusEl) statusEl.innerText = "NETWORK RESTORED - RECONNECTING...";

        // Reset flags to allow fresh init
        isMultiplayerTransitioning = false;
        multiplayerInitialized = false;

        // Re-trigger multiplayer logic with current position
        if (userPos.lat !== 0) {
            initMultiplayer(userPos.lat, userPos.lng);
            multiplayerInitialized = true;
        }
    });

    window.addEventListener('offline', () => {
        console.log("--- Network OFFLINE. Connections paused. ---");
        const statusEl = document.querySelector('.connection-status');
        if (statusEl) statusEl.innerText = "OFFLINE - CHECK CONNECTION";

        if (currentPeer) {
            currentPeer.destroy();
            currentPeer = null;
        }
    });

    async function fetchLocationName(lat, lng) {
        try {
            // zoom=14 gives street/neighbourhood level — much more accurate than zoom=10
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
            const data = await response.json();
            const a = data.address;
            // Pick the most specific populated place name available
            const city = a.neighbourhood || a.suburb || a.quarter || a.village ||
                a.town || a.city_district || a.city || a.county || "San Andreas";

            const locName = document.querySelector('.location-name');
            if (locName) locName.innerText = city.toUpperCase();
        } catch (error) {
            console.error("Failed to fetch city name:", error);
            const locName = document.querySelector('.location-name');
            if (locName) locName.innerText = "LOS SANTOS";
        }
    }

    let otherPlayers = {}; // { peerId: { marker, lat, lng } }
    let currentPeer = null;
    let myPeerId = null; // Store local ID to avoid self-blips
    let connections = []; // Track connections if we are the hub
    let flightMarkers = {};

    let storeMarkers = {};
    let userPos = { lat: 0, lng: 0 }; // Global tracking
    let radarServiceInitialised = false; // New safety flag
    let worldSyncInterval = null; // Track sync interval to avoid duplicates
    let isMultiplayerTransitioning = false; // Guard against refresh loops
    let heartbeatInterval = null; // BUG 5 FIX: track heartbeat so it can be cleared on reconnect
    let volSlider = null; // BUG 1 FIX: hoist volSlider to outer scope so saveSettings() can access it

    // --- SESSION PERSISTENCE (Fixes Ghost Blips) ---
    let mySessionId = sessionStorage.getItem('gta_session_id');
    if (!mySessionId) {
        mySessionId = 'PLAYER-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        sessionStorage.setItem('gta_session_id', mySessionId);
    }
    console.log("+++ Session ID Assigned:", mySessionId, "+++");

    // API Throttling
    let lastFetchTimes = {
        flights: 0,
        stores: 0
    };

    // --- STATS TRACKING ---
    let stats = {
        timeSpent: parseInt(localStorage.getItem('gta_stats_time') || '0'),
        distance: parseFloat(localStorage.getItem('gta_stats_dist') || '0')
    };
    let lastMapPos = null;

    // Timer (every minute)
    setInterval(() => {
        stats.timeSpent++;
        localStorage.setItem('gta_stats_time', stats.timeSpent);
        updateStatsUI();
    }, 60000);

    function updateStatsUI() {
        // Time
        const hours = Math.floor(stats.timeSpent / 60);
        const mins = stats.timeSpent % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        const timeEl = document.getElementById('stat-time');
        if (timeEl) timeEl.innerText = timeStr;

        // Distance
        const distEl = document.getElementById('stat-distance');
        if (distEl) distEl.innerText = `${stats.distance.toFixed(2)} km`;
    }

    // Track Distance on Move — uses real GPS position deltas, NOT map drag
    // (map.on('moveend') was removed here; distance is now updated in the geolocation watchPosition callback)

    // Initial UI update
    updateStatsUI();


    // --- FLIGHT RADAR LOGIC (GLOBAL) ---
    let flightCooldown = 60000; // Start at 60s between fetches
    let flightFetchTimer = null;

    function scheduleNextFlightFetch(delay) {
        if (flightFetchTimer) clearTimeout(flightFetchTimer);
        flightFetchTimer = setTimeout(() => {
            fetchFlights();
        }, delay);
    }

    function startFlightRadar() {
        if (radarServiceInitialised) return;
        radarServiceInitialised = true;


        console.log("+++ Flight Radar Service starting (60s cooldown) +++");
        fetchFlights(); // Initial fetch

        // Start Predictive Glide Loop (every 100ms)
        setInterval(predictFlights, 250); // Reduced from 100ms to ease CPU load

        // Map move: only refresh airports/stores, NOT flights
        let moveTimeout;
        map.on('moveend', () => {
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                const now = Date.now();
                if (now - lastFetchTimes.stores > 30000) fetchStores();
            }, 1000);
        });

        // Initial fetch
        fetchStores();
    }

    function initStaticMapLayers() {
        if (!map) return;

        // Add Airport Icons to the map itself as a layer
        map.loadImage('Blips/radar_airport.png', (error, image) => {
            if (error) {
                console.error("Failed to load airport icon:", error);
                return;
            }
            if (!map.hasImage('airport-icon')) map.addImage('airport-icon', image);

            map.addSource('airports', {
                type: 'geojson',
                data: 'https://raw.githubusercontent.com/grafana/grafana/main/public/gazetteer/airports.geojson'
            });

            map.addLayer({
                id: 'airports-layer',
                type: 'symbol',
                source: 'airports',
                layout: {
                    'icon-image': 'airport-icon',
                    'icon-size': 0.7,
                    'icon-allow-overlap': true,
                    'visibility': 'visible'
                },
                paint: {}
            });



            // Initial scale application if settings loaded
            const savedSettings = localStorage.getItem('gta_pause_settings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                if (parsed.blipScale) {
                    map.setLayoutProperty('airports-layer', 'icon-size', 0.7 * parsed.blipScale);
                }
            }

            // Toggle logic based on settings
            const toggle = document.getElementById('flight-radar-toggle');
            if (toggle) {
                map.setLayoutProperty('airports-layer', 'visibility', toggle.innerText.includes('On') ? 'visible' : 'none');
                toggle.addEventListener('click', () => {
                    // Read state AFTER click (text already updated by the click handler)
                    setTimeout(() => {
                        map.setLayoutProperty('airports-layer', 'visibility', toggle.innerText.includes('On') ? 'visible' : 'none');
                    }, 0);
                });
            }
        });
    }

    function initStaticBlips() {
        if (!map) return;

        const staticBlips = [
            { lat: 12.717345414467312, lng: -61.32379360419957, cls: 'cayo-blip', title: 'Cayo Perico' },
            { lat: 12.714661399942797, lng: -61.313049102971064, cls: 'sub-blip', title: 'Kosatka Submarine' }
        ];

        staticBlips.forEach(({ lat, lng, cls, title }) => {
            const el = document.createElement('div');
            el.className = cls;
            el.title = title;

            new maplibregl.Marker({
                element: el,
                anchor: 'center',
                rotationAlignment: 'viewport',
                pitchAlignment: 'viewport'
            })
                .setLngLat([lng, lat])
                .addTo(map);
        });
    }

    function predictFlights() {
        const deltaT = 0.25; // BUG 2 FIX: interval is 250ms, so deltaT must be 0.25s
        const degM = 111111; // Approx meters per degree

        for (let id in flightMarkers) {
            try {
                const f = flightMarkers[id];
                if (!f || !f.marker) continue;
                if (f.velocity && f.velocity > 0) {
                    // Approximate dead reckoning
                    const rad = (f.track - 90) * (Math.PI / 180); // Adjusting for polar coords
                    const dx = Math.cos(rad) * f.velocity * deltaT;
                    const dy = -Math.sin(rad) * f.velocity * deltaT; // Lat decreases as we go "South"

                    f.lat += dy / degM;
                    f.lng += dx / (degM * Math.cos(f.lat * Math.PI / 180));

                    f.marker.setLngLat([f.lng, f.lat]);
                }
            } catch (e) {
                // Marker was removed mid-loop, clean up safely
                delete flightMarkers[id];
            }
        }
    }

    async function fetchFlights() {
        const toggle = document.getElementById('flight-radar-toggle');
        if (toggle && !toggle.innerText.includes('On')) {
            clearFlightBlips();
            scheduleNextFlightFetch(flightCooldown);
            return;
        }

        if (!map || !map.getStyle()) {
            scheduleNextFlightFetch(flightCooldown);
            return;
        }

        try {
            const bounds = map.getBounds();
            if (!bounds || typeof bounds.getSouth !== 'function') {
                scheduleNextFlightFetch(flightCooldown);
                return;
            }

            const lamin = bounds.getSouth();
            const lomin = bounds.getWest();
            const lamax = bounds.getNorth();
            const lomax = bounds.getEast();

            if (lamin === undefined || lomin === undefined) {
                scheduleNextFlightFetch(flightCooldown);
                return;
            }

            const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

            lastFetchTimes.flights = Date.now();
            const response = await fetch(url);

            if (response.status === 429) {
                // Exponential backoff: double the cooldown, max 10 minutes
                flightCooldown = Math.min(flightCooldown * 2, 600000);
                console.warn(`[RADAR] Rate limited. Next fetch in ${flightCooldown / 1000}s.`);
                scheduleNextFlightFetch(flightCooldown);
                return;
            }

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            // Success — reset cooldown to base 60s
            flightCooldown = 60000;

            if (data && data.states) {
                console.log(`[RADAR] Found ${data.states.length} aircraft in view.`);
                updateFlightBlips(data.states);
            } else {
                console.log("[RADAR] No aircraft detected in this region right now.");
                clearFlightBlips();
            }
        } catch (error) {
            console.warn("[RADAR] Data fetch failed:", error);
        }

        // Schedule next fetch
        scheduleNextFlightFetch(flightCooldown);
    }

    function updateFlightBlips(states) {
        const seenIds = new Set();

        states.forEach(state => {
            const id = state[0];
            const lng = state[5];
            const lat = state[6];
            const track = state[10] || 0;
            const velocity = state[9] || 0;

            if (lat && lng) {
                seenIds.add(id);
                const isHeli = velocity < 60 && state[7] < 1000;

                if (flightMarkers[id]) {
                    flightMarkers[id].marker.setLngLat([lng, lat]);
                    // BUG 4 FIX: MapLibre Marker has no setRotation(); apply via CSS transform on the element
                    flightMarkers[id].el.style.transform = `rotate(${track}deg)`;
                    // Update state for prediction
                    flightMarkers[id].lat = lat;
                    flightMarkers[id].lng = lng;
                    flightMarkers[id].velocity = velocity;
                    flightMarkers[id].track = track;
                } else {
                    const el = document.createElement('div');
                    el.className = isHeli ? 'heli-blip' : 'plane-blip';

                    // Randomize plane icons via CSS class
                    if (!isHeli) {
                        const rand = Math.floor(Math.random() * 12);
                        el.classList.add(`plane-${rand}`);
                    }

                    const marker = new maplibregl.Marker({
                        element: el,
                        rotation: track,
                        anchor: 'center',
                        rotationAlignment: 'viewport',
                        pitchAlignment: 'viewport'
                    })
                        .setLngLat([lng, lat])
                        .addTo(map);

                    flightMarkers[id] = {
                        marker,
                        el,
                        lat,
                        lng,
                        velocity,
                        track
                    };
                }
            }
        });

        // Cleanup
        for (let id in flightMarkers) {
            if (!seenIds.has(id)) {
                flightMarkers[id].marker.remove();
                delete flightMarkers[id];
            }
        }
    }

    function clearFlightBlips() {
        for (let id in flightMarkers) {
            flightMarkers[id].marker.remove();
        }
        flightMarkers = {};
    }



    async function fetchStores() {
        const toggle = document.getElementById('stores-toggle');
        if (toggle && !toggle.innerText.includes('On')) {
            clearStoreBlips();
            return;
        }

        if (!map || !map.getStyle() || map.getZoom() < 12) {
            clearStoreBlips();
            return;
        }

        try {
            const bounds = map.getBounds();
            const query = `
                [out:json][timeout:25];
                (
                  node["shop"~"convenience|supermarket|liquor|clothes"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
                  way["shop"~"convenience|supermarket|liquor|clothes"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
                  node["amenity"="fuel"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
                  way["amenity"="fuel"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
                );
                out center;`;


            const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

            lastFetchTimes.stores = Date.now();
            const response = await fetch(url);

            if (response.status === 429) {
                console.warn("[STORES] Store API Rate Limited. Increasing cooldown.");
                lastFetchTimes.stores += 60000; // Block for 1 min
                return;
            }
            const data = await response.json();

            if (data && data.elements) {
                console.log(`[STORES] Found ${data.elements.length} stores in view.`);
                updateStoreBlips(data.elements);
            }
        } catch (error) {
            console.warn("[STORES] Overpass API failed:", error);
        }
    }

    function updateStoreBlips(elements) {
        const seenIds = new Set();

        elements.forEach(el => {
            const id = el.id;
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);
            const name = (el.tags && el.tags.name) || "Store";

            if (lat && lon) {
                seenIds.add(id);
                if (!storeMarkers[id]) {
                    const markerEl = document.createElement('div');
                    markerEl.className = 'store-blip';
                    markerEl.title = name;

                    const marker = new maplibregl.Marker({
                        element: markerEl,
                        anchor: 'center',
                        rotationAlignment: 'viewport',
                        pitchAlignment: 'viewport'
                    })
                        .setLngLat([lon, lat])
                        .addTo(map);

                    storeMarkers[id] = { marker, name };
                }
            }
        });

        // Cleanup
        for (let id in storeMarkers) {
            if (!seenIds.has(id)) {
                storeMarkers[id].marker.remove();
                delete storeMarkers[id];
            }
        }
    }

    function clearStoreBlips() {
        for (let id in storeMarkers) {
            storeMarkers[id].marker.remove();
        }
        storeMarkers = {};
    }

    function initMultiplayer(lat, lng) {
        if (isMultiplayerTransitioning) return;
        isMultiplayerTransitioning = true;

        userPos.lat = lat;
        userPos.lng = lng;

        // Clear all existing blips on re-init to prevent ghosting
        for (let id in otherPlayers) {
            if (otherPlayers[id].marker) otherPlayers[id].marker.remove();
        }
        otherPlayers = {};

        // Universal Global Lobby ID - Everyone connects here
        const hubId = 'GTA-V-UNIVERSAL-LOBBY-M4K0';

        const statusEl = document.querySelector('.connection-status');
        const peerIdEl = document.getElementById('debug-peer-id');
        if (statusEl) statusEl.innerText = "FINDING SESSION...";

        // PeerJS Config with expanded STUN servers for robust Global NAT traversal
        const peerConfig = {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    // --- TURN SERVER (REQUIRED FOR MOBILE DATA / 5G) ---
                    // 1. Go to Metered.ca (Free account)
                    // 2. Paste your TURN server details below:
                    // { 
                    //   urls: 'turn:YOUR_RELAY_URL:443', 
                    //   username: 'YOUR_USERNAME', 
                    //   credential: 'YOUR_PASSWORD' 
                    // }
                ]
            }
        };

        if (currentPeer) {
            currentPeer.destroy();
            currentPeer = null;
        }

        let peer = new Peer(peerConfig);
        currentPeer = peer;

        peer.on('open', (myId) => {
            isMultiplayerTransitioning = false;
            console.log('My Peer ID:', myId);
            myPeerId = myId; // Save globally
            if (peerIdEl) peerIdEl.innerText = myId;
            if (statusEl) statusEl.innerText = "JOINING GLOBAL LOBBY...";
            attemptConnect(hubId, myId, peer);
        });

        peer.on('error', (err) => {
            isMultiplayerTransitioning = false;
            console.error('Peer Primary Error:', err.type, err);
            if (err.type === 'peer-unavailable') {
                // Lobby peer is likely dead or transition in progress
                becomeHub();
            } else if (err.type === 'network' || err.type === 'server-error') {
                if (statusEl) statusEl.innerText = "RECONNECTING...";
                setTimeout(() => initMultiplayer(userPos.lat, userPos.lng), 5000);
            }
        });

        function attemptConnect(targetId, myId, peerRef) {
            console.log('Attempting to connect to Global Hub:', targetId);
            const conn = peerRef.connect(targetId, {
                reliable: true,
                serialization: 'json'
            });

            let connectionTimeout = setTimeout(() => {
                if (!conn.open) {
                    console.log('Mobile Data / NAT likely blocking connection. Attempting Relay Hub mode...');
                    if (statusEl) statusEl.innerText = "NAT RESTRICTED - TRYING RELAY...";
                    conn.close();
                    peerRef.destroy();
                    becomeHub();
                }
            }, 8000);

            conn.on('open', () => {
                clearTimeout(connectionTimeout);
                console.log('Connected to Global Lobby Relay');
                if (statusEl) statusEl.innerText = "LOBBY ACTIVE";
                startHeartbeat(conn, myId);

                // Receive World State from the Hub
                conn.on('data', (data) => {
                    if (data.type === 'WORLD_SYNC') {
                        const incomingIds = new Set(Object.keys(data.players));

                        // Remove players no longer in the world sync
                        for (let id in otherPlayers) {
                            if (!incomingIds.has(id) && id !== myPeerId) {
                                otherPlayers[id].marker.remove();
                                delete otherPlayers[id];
                            }
                        }

                        // Batch update all other players from the host's master state
                        for (let id in data.players) {
                            if (id !== myPeerId) {
                                updateOtherPlayer({
                                    peerId: id,
                                    sessionId: data.players[id].sessionId,
                                    lat: data.players[id].lat,
                                    lng: data.players[id].lng,
                                    name: data.players[id].name
                                });
                            }
                        }
                        updateLegend();
                    }
                });
            });

            conn.on('close', () => {
                console.log('Connection lost. Re-finding session...');
                if (statusEl) statusEl.innerText = "RE-FINDING SESSION...";
                setTimeout(() => {
                    if (currentPeer && !currentPeer.destroyed) {
                        initMultiplayer(userPos.lat, userPos.lng);
                    }
                }, 2000);
            });

            conn.on('error', (err) => {
                console.log('Hub connect error:', err);
                peerRef.destroy();
                becomeHub();
            });
        }

        // --- PREVIOUS POSITION OF LOGIC MOVED OUTSIDE ---

        // --- END OF MOVED LOGIC ---

        function becomeHub() {
            if (isMultiplayerTransitioning) return;
            isMultiplayerTransitioning = true;

            if (statusEl) statusEl.innerText = "CLAIMING RELAY...";

            const hubPeer = new Peer(hubId, peerConfig);
            currentPeer = hubPeer;

            hubPeer.on('open', () => {
                isMultiplayerTransitioning = false;
                if (statusEl) statusEl.innerText = "LOBBY ACTIVE (RELAY)";
                console.log('+++ GLOBAL LOBBY RELAY ACTIVE +++');
                myPeerId = hubId; // CRITICAL

                // Clear old state when becoming hub
                for (let id in otherPlayers) {
                    otherPlayers[id].marker.remove();
                }
                otherPlayers = {};

                if (peerIdEl) peerIdEl.innerText = hubId;

                // MASTER WORLD SYNC: Send the state of EVERYONE to EVERYBODY every 3s
                if (worldSyncInterval) clearInterval(worldSyncInterval);
                worldSyncInterval = setInterval(() => {
                    const worldData = {
                        type: 'WORLD_SYNC',
                        players: {}
                    };

                    // Add Hub's own position
                    worldData.players[hubId] = {
                        sessionId: mySessionId,
                        lat: userPos.lat,
                        lng: userPos.lng,
                        name: document.querySelector('.username').innerText
                    };

                    // Add all other connected players
                    for (let id in otherPlayers) {
                        worldData.players[id] = {
                            sessionId: otherPlayers[id].sessionId,
                            lat: otherPlayers[id].lat,
                            lng: otherPlayers[id].lng,
                            name: otherPlayers[id].name
                        };
                    }

                    connections.forEach(c => {
                        if (c.open) c.send(worldData);
                    });
                }, 3000);

                hubPeer.on('connection', (conn) => {
                    console.log('New peer joined global flow:', conn.peer);
                    connections.push(conn);

                    conn.on('data', (data) => {
                        if (data.type === 'POS_UPDATE') {
                            updateOtherPlayer(data);
                        }
                    });

                    conn.on('close', () => {
                        connections = connections.filter(c => c !== conn);
                        // Find and remove the blip by matching peerId stored in otherPlayers
                        for (let id in otherPlayers) {
                            if (otherPlayers[id].peerId === conn.peer) {
                                otherPlayers[id].marker.remove();
                                delete otherPlayers[id];
                                break;
                            }
                        }
                        updateLegend();
                        console.log('Player disconnected and blip removed:', conn.peer);
                    });
                });
            });

            hubPeer.on('error', (err) => {
                isMultiplayerTransitioning = false;
                if (err.type === 'unavailable-id') {
                    console.log('Hub ID taken. Backing off before reconnecting...');
                    hubPeer.destroy();
                    if (statusEl) statusEl.innerText = "LOBBY BUSY - RETRYING...";
                    setTimeout(() => initMultiplayer(userPos.lat, userPos.lng), 5000);
                } else {
                    console.error("Hub Error:", err);
                    if (statusEl) statusEl.innerText = "CONNECTION ERROR";
                }
            });

            hubPeer.on('disconnected', () => {
                console.log('Hub peer disconnected from server.');
                hubPeer.reconnect();
            });
        }

        function startHeartbeat(conn, myId) {
            const sendUpdate = () => {
                if (conn.open) {
                    conn.send({
                        type: 'POS_UPDATE',
                        peerId: myId,
                        sessionId: mySessionId,
                        lat: userPos.lat,
                        lng: userPos.lng,
                        name: document.querySelector('.username').innerText
                    });
                }
            };

            // BUG 5 FIX: clear any previous heartbeat before starting a new one
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            sendUpdate();
            heartbeatInterval = setInterval(sendUpdate, 3000);
        }

        // Shared peer listener
        peer.on('connection', (conn) => {
            conn.on('data', (data) => {
                if (data.type === 'POS_UPDATE') updateOtherPlayer(data);
            });
        });
    }

    function updateOtherPlayer(data) {
        const id = data.sessionId || data.peerId || data.id;

        // --- GHOST PROTECTION GUARDS ---
        if (!id || id === "undefined" || id === "null") return;
        if (id === mySessionId) return; // Never draw ourselves

        // Don't draw blips at 0,0
        if (Math.abs(data.lat) < 0.0001 && Math.abs(data.lng) < 0.0001) return;

        // Proximity Guard: If blip is within ~10 meters of us, it's probably a stale version of us
        // (0.0001 degrees is roughly 10 meters)
        const latDiff = Math.abs(data.lat - (userPos.lat || 0));
        const lngDiff = Math.abs(data.lng - (userPos.lng || 0));
        if (latDiff < 0.0001 && lngDiff < 0.0001) return;

        if (otherPlayers[id]) {
            otherPlayers[id].marker.setLngLat([data.lng, data.lat]);
            otherPlayers[id].lat = data.lat;
            otherPlayers[id].lng = data.lng;
            otherPlayers[id].name = data.name || "Unknown Player";
            otherPlayers[id].sessionId = data.sessionId;
            otherPlayers[id].lastUpdate = Date.now();

            // Update Name Tag text
            const nameTag = otherPlayers[id].marker.getElement().querySelector('.blip-name-tag');
            if (nameTag) nameTag.innerText = otherPlayers[id].name;
        } else {
            console.log('New player detected (Session ID):', id);
            const el = document.createElement('div');
            el.className = 'other-blip';

            // Create the visible icon
            const icon = document.createElement('div');
            icon.className = 'blip-icon';
            el.appendChild(icon);

            // Create Name Tag
            const nameTag = document.createElement('span');
            nameTag.className = 'blip-name-tag';
            nameTag.innerText = data.name || "Unknown Player";
            el.appendChild(nameTag);

            // --- MOBILE TOUCH SUPPORT ---
            el.addEventListener('click', (e) => {
                e.preventDefault(); // Stop map drag
                // Toggle show-name class
                el.classList.add('show-name');

                // Clear any existing timer
                if (el.hideTimer) clearTimeout(el.hideTimer);

                // Auto-hide after 3 seconds
                el.hideTimer = setTimeout(() => {
                    el.classList.remove('show-name');
                }, 3000);

                // Prevent map click events
                e.stopPropagation();
            });

            const marker = new maplibregl.Marker({
                element: el,
                anchor: 'center',
                rotationAlignment: 'viewport',
                pitchAlignment: 'viewport'
            })
                .setLngLat([data.lng, data.lat])
                .addTo(map);

            otherPlayers[id] = {
                marker,
                lat: data.lat,
                lng: data.lng,
                name: data.name,
                sessionId: data.sessionId,
                peerId: data.peerId,
                lastUpdate: Date.now()
            };
        }

        updateLegend();
    }

    // Cleanup stale blips after 15 seconds
    setInterval(() => {
        const now = Date.now();
        for (let id in otherPlayers) {
            if (now - otherPlayers[id].lastUpdate > 15000) {
                otherPlayers[id].marker.remove();
                delete otherPlayers[id];
            }
        }
        updateLegend();
    }, 5000);

    // --- PLAYER LEGEND ---
    function updateLegend() {
        const legendList = document.getElementById('legend-list');
        if (!legendList) return;

        legendList.innerHTML = '';

        // Self entry — not clickable, uses Player blip
        const selfName = document.querySelector('.username')?.innerText || 'YOU';
        const selfEntry = document.createElement('div');
        selfEntry.className = 'legend-entry';
        selfEntry.innerHTML = `
            <span class="legend-name self">${selfName}</span>
            <div class="legend-blip self"></div>
        `;
        legendList.appendChild(selfEntry);

        // Other players — clickable, fly to their position
        for (let id in otherPlayers) {
            const p = otherPlayers[id];
            const entry = document.createElement('div');
            entry.className = 'legend-entry clickable';
            entry.title = `Center on ${p.name || 'Player'}`;
            entry.innerHTML = `
                <span class="legend-name">${p.name || 'Unknown'}</span>
                <div class="legend-blip other"></div>
            `;
            entry.addEventListener('click', () => {
                if (p.lat && p.lng) {
                    map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14), essential: true });
                }
            });
            legendList.appendChild(entry);
        }
    }

    // Initial legend render (just self)
    updateLegend();


    // Weather API (Open-Meteo)
    async function fetchWeather(lat, lng) {
        try {
            // Removed temperature_unit=fahrenheit to default to Celsius
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,is_day&daily=weather_code,temperature_2m_max&timezone=auto`);
            const data = await response.json();

            updateWeatherUI(data);
            fetchAirQuality(lat, lng);
        } catch (error) {
            console.error("Weather fetch failed:", error);
        }
    }

    async function fetchAirQuality(lat, lng) {
        try {
            const response = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi`);
            const data = await response.json();
            if (data.current && data.current.us_aqi) {
                const aqi = data.current.us_aqi;
                const aqiEl = document.querySelector('.aqi-value');
                if (aqiEl) {
                    aqiEl.innerText = `AQI ${aqi}`;
                    // Optional color coding
                    if (aqi <= 50) aqiEl.style.color = '#2ecc71'; // Good
                    else if (aqi <= 100) aqiEl.style.color = '#f1c40f'; // Moderate
                    else aqiEl.style.color = '#e74c3c'; // Unhealthy
                }
            }
        } catch (error) {
            console.error("AQI fetch failed:", error);
        }
    }

    function updateWeatherUI(data) {
        const current = data.current;
        const daily = data.daily;

        const getWeatherInfo = (code, isDay = 1) => {
            const icons = {
                0: isDay ? '☀️' : '🌙', 1: isDay ? '🌤️' : '☁️', 2: '⛅', 3: '☁️',
                45: '🌫️', 48: '🌫️', 51: '🌦️', 61: '🌧️', 71: '❄️', 95: '⛈️'
            };
            const desc = {
                0: 'Clear Sky', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
                45: 'Foggy', 48: 'Freezing Fog', 51: 'Drizzle', 61: 'Rainy', 71: 'Snowy', 95: 'Thunderstorm' // BUG 7 FIX: added missing code 48
            };
            return {
                icon: icons[code] || '❓',
                text: desc[code] || 'Unknown'
            };
        };

        const currentInfo = getWeatherInfo(current.weather_code, current.is_day);

        // Update Current Weather
        document.querySelector('.temperature').innerText = `${Math.round(current.temperature_2m)}°C`;
        document.querySelector('.condition').innerText = currentInfo.text;
        document.querySelector('.weather-icon').innerText = currentInfo.icon;

        const humidityEl = document.querySelector('.humidity-value');
        if (humidityEl && current.relative_humidity_2m) {
            humidityEl.innerText = `${current.relative_humidity_2m}%`;
        }

        // Update Forecast (Next 3 days)
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const forecastContainer = document.querySelector('.forecast-row');
        forecastContainer.innerHTML = ''; // Clear existing

        for (let i = 1; i <= 3; i++) {
            const date = new Date(daily.time[i]);
            const dayName = days[date.getDay()];
            const maxTemp = Math.round(daily.temperature_2m_max[i]);
            const code = daily.weather_code[i];
            const info = getWeatherInfo(code);

            const item = document.createElement('div');
            item.className = 'forecast-item';
            item.innerHTML = `
                <div class="day">${dayName}</div>
                <div class="icon">${info.icon}</div>
                <div class="temp">${maxTemp}°C</div>
            `;
            forecastContainer.appendChild(item);
        }
    }

    // --- Settings Logic ---
    const usernameInput = document.getElementById('username-input');
    const pfpInput = document.getElementById('pfp-input');
    const colorInput = document.getElementById('color-input');
    const sliders = document.querySelectorAll('.gta-slider');

    function saveSettings() {
        const flightToggle = document.getElementById('flight-radar-toggle');
        const storesToggle = document.getElementById('stores-toggle');
        const blipSlider = document.getElementById('blip-scale-slider');
        const legendToggle = document.getElementById('legend-toggle');
        const overlayToggle = document.getElementById('overlay-toggle');

        const settings = {
            username: usernameInput.value,
            accentColor: colorInput.value,
            avatar: document.querySelector('.avatar').src,
            volume: volSlider ? volSlider.value : 80,
            flightRadar: flightToggle ? flightToggle.innerText.includes('On') : true,
            showStores: storesToggle ? storesToggle.innerText.includes('On') : true,
            blipScale: blipSlider ? blipSlider.value : 1.0,
            showLegend: legendToggle ? legendToggle.innerText.includes('On') : true,
            showOverlay: overlayToggle ? overlayToggle.innerText.includes('On') : true
        };
        localStorage.setItem('gta_pause_settings', JSON.stringify(settings));
    }

    function loadSettings() {
        const saved = localStorage.getItem('gta_pause_settings');
        if (saved) {
            const settings = JSON.parse(saved);

            // Name
            if (usernameInput) {
                usernameInput.value = settings.username || 'PlayerOne';
                document.querySelector('.username').innerText = usernameInput.value;
            }

            // Color
            if (colorInput) {
                colorInput.value = settings.accentColor || '#3498db';
                document.documentElement.style.setProperty('--accent-color', colorInput.value);
            }

            // Lobby



            // Avatar
            if (settings.avatar) {
                document.querySelector('.avatar').src = settings.avatar;
            }

            // Sliders
            // BUG 1 FIX: volSlider is now hoisted to outer scope; assign here instead of re-declaring
            volSlider = document.getElementById('volume-slider');
            const blipSlider = document.getElementById('blip-scale-slider');

            if (volSlider) {
                volSlider.value = settings.volume || 80;
                updateSliderVisuals(volSlider);
            }

            if (blipSlider) {
                blipSlider.value = settings.blipScale || 1.0;
                // Apply scale immediately
                document.documentElement.style.setProperty('--blip-scale', blipSlider.value);
                updateSliderVisuals(blipSlider);
            }

            // Flight Radar
            const flightToggle = document.getElementById('flight-radar-toggle');
            if (flightToggle && settings.hasOwnProperty('flightRadar')) {
                flightToggle.innerText = settings.flightRadar ? '< On >' : '< Off >';
                if (!settings.flightRadar) clearFlightBlips(); // Sync state
            }

            // Stores
            const storesToggle = document.getElementById('stores-toggle');
            if (storesToggle && settings.hasOwnProperty('showStores')) {
                storesToggle.innerText = settings.showStores ? '< On >' : '< Off >';
                if (!settings.showStores) clearStoreBlips();
            }

            // Legend
            const legendToggle = document.getElementById('legend-toggle');
            if (legendToggle && settings.hasOwnProperty('showLegend')) {
                legendToggle.innerText = settings.showLegend ? '< On >' : '< Off >';
                const legendEl = document.getElementById('player-legend');
                if (legendEl) legendEl.classList.toggle('hidden', !settings.showLegend);
            }

            // Map Overlay
            const overlayToggle = document.getElementById('overlay-toggle');
            if (overlayToggle && settings.hasOwnProperty('showOverlay')) {
                overlayToggle.innerText = settings.showOverlay ? '< On >' : '< Off >';
                const overlayEl = document.getElementById('map-overlay-info');
                if (overlayEl) overlayEl.classList.toggle('hidden', !settings.showOverlay);
            }
        }
    }

    // Load initial settings
    loadSettings();

    // Initialize volume slider visuals & audio even if no saved settings exist
    const _volSliderInit = document.getElementById('volume-slider');
    if (_volSliderInit) {
        volSlider = _volSliderInit;
        updateSliderVisuals(volSlider);
        const initVol = parseFloat(volSlider.value) / 100;
        Object.values(sounds).forEach(s => s.volume = initVol);
        sounds.music.volume = initVol * 0.6; // music slightly quieter
    }

    if (usernameInput) {
        usernameInput.addEventListener('input', (e) => {
            document.querySelector('.username').innerText = e.target.value || 'PlayerOne';
            updateLegend();
            saveSettings();
        });
    }

    if (colorInput) {
        colorInput.addEventListener('input', (e) => {
            document.documentElement.style.setProperty('--accent-color', e.target.value);
            saveSettings();
        });
    }

    if (pfpInput) {
        pfpInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (event) {
                    document.querySelector('.avatar').src = event.target.result;
                    saveSettings();
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const flightToggle = document.getElementById('flight-radar-toggle');
    if (flightToggle) {
        flightToggle.addEventListener('click', () => {
            const isOn = flightToggle.innerText.includes('On');
            flightToggle.innerText = isOn ? '< Off >' : '< On >';
            saveSettings();

            if (isOn) { // Was On, now Off
                clearFlightBlips();
            } else {
                fetchFlights();
            }
        });
    }

    const storesToggle = document.getElementById('stores-toggle');
    if (storesToggle) {
        storesToggle.addEventListener('click', () => {
            const isOn = storesToggle.innerText.includes('On');
            storesToggle.innerText = isOn ? '< Off >' : '< On >';
            saveSettings();

            if (isOn) {
                clearStoreBlips();
            } else {
                fetchStores();
            }
        });
    }

    // Legend toggle
    const legendToggle = document.getElementById('legend-toggle');
    if (legendToggle) {
        legendToggle.addEventListener('click', () => {
            const isOn = legendToggle.innerText.includes('On');
            legendToggle.innerText = isOn ? '< Off >' : '< On >';
            const legendEl = document.getElementById('player-legend');
            if (legendEl) legendEl.classList.toggle('hidden', isOn);
            saveSettings();
        });
    }

    // Map Overlay toggle
    const overlayToggle = document.getElementById('overlay-toggle');
    if (overlayToggle) {
        overlayToggle.addEventListener('click', () => {
            const isOn = overlayToggle.innerText.includes('On');
            overlayToggle.innerText = isOn ? '< Off >' : '< On >';
            const overlayEl = document.getElementById('map-overlay-info');
            if (overlayEl) overlayEl.classList.toggle('hidden', isOn);
            saveSettings();
        });
    }



    function updateSliderVisuals(slider) {
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const val = parseFloat(slider.value);
        const percentage = ((val - min) / (max - min)) * 100;
        slider.style.backgroundSize = `${percentage}% 100%`;
    }

    // Debounce helper - prevents hammering localStorage on every slider pixel
    function debounce(fn, delay) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }
    const debouncedSave = debounce(saveSettings, 500);

    sliders.forEach((slider, index) => {
        // Initial visual update
        updateSliderVisuals(slider);

        slider.addEventListener('input', () => {
            updateSliderVisuals(slider);

            if (slider.id === 'blip-scale-slider') {
                const scale = slider.value;
                document.documentElement.style.setProperty('--blip-scale', scale);
                // Update Airport Layer (GeoJSON) - scaling 0.7 base
                if (map && map.getLayer('airports-layer')) {
                    map.setLayoutProperty('airports-layer', 'icon-size', 0.7 * scale);
                }
            } else if (slider.id === 'volume-slider') {
                // Update Global Volume (if applicable)
                if (sounds) {
                    Object.values(sounds).forEach(sound => {
                        sound.volume = slider.value / 100;
                    });
                }
            }
            debouncedSave(); // Debounced - only saves 500ms after user stops dragging
        });
    });

    // --- Input Sounds ---
    const inputs = document.querySelectorAll('input, .toggle-switch');
    inputs.forEach(input => {
        if (input.type !== 'text' && input.type !== 'file' && input.type !== 'color') {
            input.addEventListener('input', () => {
                sounds.changeOption.currentTime = 0;
                sounds.changeOption.play().catch(() => { });
            });
        }
    });
});
