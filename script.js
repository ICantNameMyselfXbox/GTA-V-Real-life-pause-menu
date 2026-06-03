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

    // --- Radio System (SoundCloud Widget Synced Streams) ---
    const radioStations = [
        { name: 'Radio Off', icon: '', soundcloudUrl: null }
    ];

    if (window.RADIO_SONGS) {
        for (const [name, data] of Object.entries(window.RADIO_SONGS)) {
            radioStations.push({
                name: name,
                icon: data.icon,
                soundcloudUrl: data.soundcloud
            });
        }
    }

    let currentRadioIndex = 0;
    const stationWidgets = {};
    const directAudioPlayers = {}; // For non-SoundCloud links

    // --- Radio Progress Persistence ---
    function loadRadioProgress() {
        const saved = localStorage.getItem('gta_radio_progress');
        return saved ? JSON.parse(saved) : {};
    }

    function saveRadioProgress(stationName, time) {
        const progress = loadRadioProgress();
        progress[stationName] = time;
        localStorage.setItem('gta_radio_progress', JSON.stringify(progress));
    }

    const radioProgress = loadRadioProgress();

    // Initialize Radio Streams
    const scContainer = document.getElementById('radio-streams-container');

    radioStations.forEach((station, index) => {
        if (index === 0 || !station.soundcloudUrl) return;

        const isSoundCloud = typeof station.soundcloudUrl === 'string' && station.soundcloudUrl.includes('soundcloud.com');

        if (isSoundCloud && window.SC && window.SC.Widget) {
            // --- SoundCloud Setup ---
            const iframe = document.createElement('iframe');
            let src = station.soundcloudUrl;
            if (!src.includes('enable_api')) {
                src += (src.includes('?') ? '&' : '?') + 'enable_api=1';
            }
            iframe.src = src;
            iframe.id = `sc-widget-${index}`;
            iframe.width = "100%";
            iframe.height = "166";
            iframe.allow = "autoplay";
            iframe.style.display = "none";
            if (scContainer) scContainer.appendChild(iframe);

            const widget = SC.Widget(iframe);
            stationWidgets[index] = widget;

            widget.bind(SC.Widget.Events.READY, () => {
                widget.setVolume(0);
                widget.play();
            });
        } else if (!isSoundCloud) {
            // --- Local / Direct Audio Setup ---
            const audio = new Audio(station.soundcloudUrl);
            audio.loop = true;
            audio.volume = 0;
            // Preload metadata to avoid lag on first play
            audio.preload = "metadata";

            // Restore saved progress if available
            if (radioProgress[station.name]) {
                audio.currentTime = radioProgress[station.name];
            }

            // Periodically save progress while playing
            let lastSaveTime = 0;
            audio.addEventListener('timeupdate', () => {
                const now = audio.currentTime;
                if (!audio.paused && Math.abs(now - lastSaveTime) > 2) {
                    saveRadioProgress(station.name, now);
                    lastSaveTime = now;
                }
            });

            directAudioPlayers[index] = audio;
        }
    });

    // Note: Synchronization logic was removed per user request for simplicity.


    function initRadioWheel() {
        const wheel = document.getElementById('radio-wheel');
        const infoName = document.getElementById('radio-station-name');
        if (!wheel) return;

        wheel.innerHTML = '';
        const total = radioStations.length;

        radioStations.forEach((station, index) => {
            const angle = (index / total) * (Math.PI * 2) - (Math.PI / 2);
            const x = 50 + (Math.cos(angle) * 0.92 * 50);
            const y = 50 + (Math.sin(angle) * 0.92 * 50);

            const el = document.createElement('div');
            el.className = 'radio-station';
            el.style.left = `${x}%`;
            el.style.top = `${y}%`;

            if (station.icon) {
                if (station.icon.toLowerCase().endsWith('.webm')) {
                    const video = document.createElement('video');
                    video.src = station.icon;
                    video.autoplay = true;
                    video.loop = true;
                    video.muted = true;
                    video.playsInline = true;
                    video.style.width = '100%';
                    video.style.height = '100%';
                    video.style.objectFit = 'contain';
                    video.style.borderRadius = '50%';
                    el.appendChild(video);
                } else {
                    el.style.backgroundImage = `url('${station.icon}')`;
                }
            } else {
                el.innerHTML = '<div style="width:100%;height:100%;display:flex;justify-content:center;align-items:center;font-size:24px;border:3px solid #ccc;border-radius:50%;color:#ccc;">🚫</div>';
            }

            if (index === currentRadioIndex) el.classList.add('active');

            el.addEventListener('mouseenter', () => {
                infoName.innerText = station.name;
                sounds.changeOption.currentTime = 0;
                sounds.changeOption.play().catch(() => { });
            });

            el.addEventListener('touchstart', () => {
                infoName.innerText = station.name;
            }, { passive: true });

            el.addEventListener('click', () => {
                document.querySelectorAll('.radio-station').forEach(s => s.classList.remove('active'));
                el.classList.add('active');
                currentRadioIndex = index;

                Object.values(stationWidgets).forEach(w => w.setVolume(0));
                Object.values(directAudioPlayers).forEach(a => {
                    a.pause();
                });
                sounds.music.pause();
                
                if (index === 0) {
                    sounds.music.play().catch(() => { });
                    console.log("Playing background ambiance...");
                } else if (!station.soundcloudUrl) {
                    showRadioToast('NO STREAM AVAILABLE');
                } else {
                    const radioVolSlider = document.getElementById('radio-volume-slider');
                    const targetVolume = radioVolSlider ? (radioVolSlider.value / 100) : 0.5;

                    if (stationWidgets[index]) {
                        const widget = stationWidgets[index];
                        widget.setVolume(targetVolume * 100);
                        console.log(`Streaming SoundCloud: ${station.name}`);
                    } else if (directAudioPlayers[index]) {
                        const player = directAudioPlayers[index];
                        player.volume = targetVolume;
                        player.play().catch(e => console.error("Streaming failed:", e));
                        console.log(`Streaming Direct: ${station.name}`);
                    }
                }
            });

            wheel.appendChild(el);
        });

        document.getElementById('radio').addEventListener('mouseleave', () => {
            infoName.innerText = radioStations[currentRadioIndex].name;
        });

        layoutRadioWheel();
    }

    function layoutRadioWheel() {
        const wheel = document.getElementById('radio-wheel');
        if (!wheel) return;
        const container = wheel.parentElement;
        if (!container || container.offsetWidth === 0) return;

        const cw = container.offsetWidth;
        const ch = container.offsetHeight;
        const size = Math.min(cw, ch);
        const total = radioStations.length;
        const stationEls = wheel.querySelectorAll('.radio-station');
        if (!stationEls.length) return;

        const isSmall = size < 500;
        const stationSize = isSmall ? Math.max(28, size / (total * 0.3)) : 88;
        const stationMargin = stationSize / 2;
        const radius = (size / 2) - stationMargin - (isSmall ? 4 : 8);
        const radiusPct = (radius / (size / 2)) * 50;

        stationEls.forEach((el, index) => {
            const angle = (index / total) * (Math.PI * 2) - (Math.PI / 2);
            const x = 50 + Math.cos(angle) * radiusPct;
            const y = 50 + Math.sin(angle) * radiusPct;
            el.style.left = `${x}%`;
            el.style.top = `${y}%`;
            el.style.width = `${stationSize}px`;
            el.style.height = `${stationSize}px`;
            el.style.marginLeft = `-${stationMargin}px`;
            el.style.marginTop = `-${stationMargin}px`;
            el.style.zIndex = index === currentRadioIndex ? 10 : 1;
        });

        const active = wheel.querySelector('.radio-station.active');
        if (active) active.style.zIndex = 10;
    }

    initRadioWheel();

    window.addEventListener('resize', debounce(layoutRadioWheel, 200));

    // --- Tab Navigation ---
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    let previousTab = 'map';

    function switchTab(tabName) {
        sounds.switchTab.currentTime = 0;
        sounds.switchTab.play().catch(() => { });

        const prevActive = document.querySelector('.nav-item.active');
        if (prevActive && prevActive.dataset.tab !== tabName) {
            previousTab = prevActive.dataset.tab;
        }

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
                if (tabName === 'map' && map) {
                    setTimeout(() => map.resize(), 100);
                }
                if (tabName === 'radio') {
                    setTimeout(layoutRadioWheel, 50);
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
        attributionControl: false,
        doubleClickZoom: false
    });

    map.on('load', () => {
        const spinner = document.getElementById('map-spinner');
        if (spinner) spinner.style.display = 'none';
        startFlightRadar();
        initStaticMapLayers();
        initStaticBlips();

        // Map interaction: stop following if user manually moves/interacts with map
        map.on('dragstart', () => {
            if (followTarget) {
                console.log("Follow mode DISABLED due to manual map move.");
                followTarget = null;
            }
        });
        map.on('wheel', () => {
            if (followTarget) {
                console.log("Follow mode DISABLED due to manual zoom.");
                followTarget = null;
            }
        });
    });

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

            // Follow mode for self - only update if user explicitly enabled it
            if (followTarget === 'self') {
                map.flyTo({ center: [lng, lat], essential: true, duration: 0 });
            }

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

            // Initialization fallback if geolocation fails
            if (!multiplayerInitialized) {
                initMultiplayer(0, 0);
                multiplayerInitialized = true;
            }
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    } else {
        // Initialization fallback if geolocation is completely unsupported
        if (!multiplayerInitialized) {
            initMultiplayer(0, 0);
            multiplayerInitialized = true;
        }
    }

    // --- Network Awareness (Mobile Data / WiFi switching) ---
    window.addEventListener('online', () => {
        console.log("+++ Network back ONLINE. Reconnecting multiplayer... +++");
        if (cachedStatusEl) cachedStatusEl.innerText = "NETWORK RESTORED - RECONNECTING...";

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
        if (cachedStatusEl) cachedStatusEl.innerText = "OFFLINE - CHECK CONNECTION";

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
    let hubConnection = null; // Connection to the hub (if we are a client)
    let flightMarkers = {};
    let userPos = { lat: 0, lng: 0 }; // Global tracking
    let followTarget = null; // null, 'self', or sessionId
    let radarServiceInitialised = false; // New safety flag
    let worldSyncInterval = null; // Track sync interval to avoid duplicates
    let heartbeatInterval = null; // Fix for heartbeat ReferenceError
    let isMultiplayerTransitioning = false; // Track connection state



    // --- Settings Logic ---
    const usernameInput = document.getElementById('username-input');
    const pfpInput = document.getElementById('pfp-input');
    const colorInput = document.getElementById('color-input');
    const sliders = document.querySelectorAll('.gta-slider');
    let volSlider = null;

    function saveSettings() {
        const flightToggle = document.getElementById('flight-radar-toggle-btn');

        const blipSlider = document.getElementById('blip-scale-slider');
        const legendToggle = document.getElementById('legend-toggle');
        const overlayToggle = document.getElementById('overlay-toggle');

        const settings = {
            username: usernameInput.value,
            accentColor: colorInput.value,
            avatar: document.querySelector('.avatar').src,
            volume: volSlider ? volSlider.value : 80,
            flightRadar: flightToggle ? flightToggle.innerText.includes('On') : true,
            blipScale: blipSlider ? blipSlider.value : 1.0,
            showLegend: legendToggle ? legendToggle.innerText.includes('On') : true,
            showOverlay: overlayToggle ? overlayToggle.innerText.includes('On') : true,
            radioVolume: document.getElementById('radio-volume-slider')?.value || 50,
            reduceMotion: document.getElementById('reduce-motion-toggle')?.innerText.includes('On') || false
        };
        localStorage.setItem('gta_pause_settings', JSON.stringify(settings));
    }

    function loadSettings() {
        const saved = localStorage.getItem('gta_pause_settings');
        if (saved) {
            let settings;
            try {
                settings = JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse settings:", e);
                localStorage.removeItem('gta_pause_settings');
                return;
            }

            // Name
            if (usernameInput) {
                usernameInput.value = settings.username || 'PlayerOne';
                if (cachedUsernameEl) cachedUsernameEl.innerText = usernameInput.value;
            }

            // Color
            if (colorInput) {
                colorInput.value = settings.accentColor || '#3498db';
                document.documentElement.style.setProperty('--accent-color', colorInput.value);
            }

            // Avatar
            if (settings.avatar) {
                document.querySelector('.avatar').src = settings.avatar;
            }

            // Sliders
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
            // Flight Radar
            const flightToggle = document.getElementById('flight-radar-toggle-btn');
            if (flightToggle && settings.hasOwnProperty('flightRadar')) {
                flightToggle.innerText = settings.flightRadar ? '< On >' : '< Off >';
                if (!settings.flightRadar) clearFlightBlips();
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

            // Radio Volume ^~^
            const radioVolSlider = document.getElementById('radio-volume-slider');
            if (radioVolSlider && settings.hasOwnProperty('radioVolume')) {
                radioVolSlider.value = settings.radioVolume;
                updateSliderVisuals(radioVolSlider);
            }

            // Reduce Motion
            const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
            if (reduceMotionToggle && settings.hasOwnProperty('reduceMotion')) {
                reduceMotionToggle.innerText = settings.reduceMotion ? '< On >' : '< Off >';
                applyReduceMotion(settings.reduceMotion);
            }
        }

    }

    // --- SESSION PERSISTENCE (Fixes Ghost Blips) ---
    let mySessionId = sessionStorage.getItem('gta_session_id');
    if (!mySessionId) {
        mySessionId = 'PLAYER-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        sessionStorage.setItem('gta_session_id', mySessionId);
    }
    console.log("+++ Session ID Assigned:", mySessionId, "+++");

    // API Throttling
    let lastFetchTimes = {
        flights: 0
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
    let flightCooldown = 60000;
    let flightFetchTimer = null;
    let allAircraftData = null;
    let radarAnimFrame = null;
    let radarLastFrameTime = 0;
    let radarEnabled = true;

    function scheduleNextFlightFetch(delay) {
        if (flightFetchTimer) clearTimeout(flightFetchTimer);
        flightFetchTimer = setTimeout(() => {
            fetchFlights();
        }, delay);
    }

    function startFlightRadar() {
        if (radarServiceInitialised) return;
        radarServiceInitialised = true;

        console.log("+++ Flight Radar Service starting (10s cooldown) +++");
        fetchFlights();

        radarLastFrameTime = performance.now();
        function radarLoop(now) {
            radarAnimFrame = requestAnimationFrame(radarLoop);
            if (document.hidden) return;
            if (!radarEnabled) return;
            const toggle = document.getElementById('flight-radar-toggle-btn');
            if (toggle && !toggle.innerText.includes('On')) return;
            const deltaT = (now - radarLastFrameTime) / 1000;
            radarLastFrameTime = now;
            if (deltaT > 0 && deltaT < 1) {
                simulateAircraftMovement(deltaT);
                applyViewportFilter();
            }
        }
        radarAnimFrame = requestAnimationFrame(radarLoop);

        // Map move: re-fetch if center moved significantly
        let lastFetchCenter = null;
        map.on('moveend', () => {
            const center = map.getCenter();
            if (!lastFetchCenter) lastFetchCenter = center;

            // Haversine-lite
            const dLat = Math.abs(center.lat - lastFetchCenter.lat);
            const dLng = Math.abs(center.lng - lastFetchCenter.lng) * Math.cos(center.lat * Math.PI / 180);
            const degreeDist = Math.sqrt(dLat * dLat + dLng * dLng);

            if (degreeDist > 1.5) {
                lastFetchCenter = center;
                fetchFlights();
            }
        });
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
                data: 'airports.geojson'
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

    // Physics Engine: interpolate aircraft positions from base data
    function simulateAircraftMovement(deltaT) {
        if (!allAircraftData || allAircraftData.length === 0) return;

        const degM = 111111;
        const now = performance.now();

        allAircraftData.forEach(ac => {
            if (!ac._baseLat) return;
            if (ac.gs && ac.gs > 0 && ac.track !== undefined) {
                const elapsed = (now - ac._baseTime) / 1000;
                const speedMs = ac.gs * 0.514444;
                const rad = (ac.track - 90) * (Math.PI / 180);
                const dx = Math.cos(rad) * speedMs * elapsed;
                const dy = -Math.sin(rad) * speedMs * elapsed;
                ac.lat = ac._baseLat + dy / degM;
                ac.lon = ac._baseLon + dx / (degM * Math.cos(ac._baseLat * Math.PI / 180));
            } else {
                ac.lat = ac._baseLat;
                ac.lon = ac._baseLon;
            }
        });
    }

    async function fetchFlights() {
        const toggle = document.getElementById('flight-radar-toggle-btn');
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
            // Use map VIEW CENTER so it works anywhere on the globe
            const center = map.getCenter();
            const lat = center.lat.toFixed(4);
            const lon = center.lng.toFixed(4);
            const dist = 250; // nm (~460km)
            // airplanes.live — same ADS-B Exchange data, proper CORS headers for browser use
            const url = `https://api.airplanes.live/v2/point/${lat}/${lon}/${dist}`;

            console.log(`[RADAR] Fetching aircraft around map center (${lat}, ${lon}) r=${dist}nm via airplanes.live...`);
            lastFetchTimes.flights = Date.now();

            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[RADAR] HTTP error: ${response.status}`);
                scheduleNextFlightFetch(flightCooldown);
                return;
            }

            const data = await response.json();

            if (data && Array.isArray(data.ac)) {
                console.log(`[RADAR] ✈ Found ${data.ac.length} aircraft near map center.`);
                flightCooldown = 10000;
                const now = performance.now();
                data.ac.forEach(ac => {
                    ac._baseLat = ac.lat;
                    ac._baseLon = ac.lon;
                    ac._baseTime = now;
                });
                allAircraftData = data.ac;
                applyViewportFilter();
            } else {
                console.log('[RADAR] No aircraft data in response.');
                clearFlightBlips();
            }

        } catch (error) {
            console.warn('[RADAR] Fetch failed:', error.message);
        }

        scheduleNextFlightFetch(flightCooldown);
    }

    function applyViewportFilter() {
        if (!allAircraftData || !map) return;
        const bounds = map.getBounds();
        if (!bounds) return;

        const s = bounds.getSouth(), n = bounds.getNorth();
        const w = bounds.getWest(), e = bounds.getEast();

        const visible = allAircraftData.filter(ac =>
            ac.lat && ac.lon &&
            ac.lat >= s && ac.lat <= n &&
            ac.lon >= w && ac.lon <= e
        );

        // console.log(`[RADAR] Viewport: ${visible.length} visible aircraft.`);
        // Reduced logging to avoid spam in 50ms loop
        updateFlightBlips(visible);
    }



    function updateFlightBlips(aircraft) {
        const seenIds = new Set();

        aircraft.forEach(ac => {
            const id = ac.hex;
            const lat = ac.lat;
            const lng = ac.lon;
            const track = ac.track || 0;
            const gs = ac.gs || 0;
            const alt = ac.alt_baro;
            const category = ac.category || '';
            const typecode = (ac.t || '').toUpperCase();

            if (!lat || !lng) return;
            seenIds.add(id);

            const isHeli = category === 'A7'
                || typecode.startsWith('H')
                || (typeof alt === 'number' && alt < 1500 && gs < 60);

            // Fallback for unidentified aircraft (no category/type data)
            const isUnknown = !isHeli && !category && !typecode;

            const rotation = isUnknown ? 0 : track;

            if (flightMarkers[id]) {
                flightMarkers[id].marker.setLngLat([lng, lat]);
                flightMarkers[id].marker.setRotation(rotation);

                flightMarkers[id].lat = lat;
                flightMarkers[id].lng = lng;
                flightMarkers[id].velocity = gs;
                flightMarkers[id].track = track;
            } else {
                // Container for MapLibre positioning
                const container = document.createElement('div');
                container.className = 'flight-blip-container';

                // Inner element for rotation & icon
                const el = document.createElement('div');
                // Use new specific type classes to avoid double-background issues
                if (isHeli) {
                    el.className = 'flight-blip-base heli-type';
                } else if (isUnknown) {
                    el.className = 'flight-blip-base oppressor-type';
                } else {
                    const rand = Math.floor(Math.random() * 12);
                    el.className = `flight-blip-base plane-type-${rand}`;
                }

                // Removed manual CSS rotation, now handled by MapLibre (setRotation + alignment: map)
                container.appendChild(el);

                const marker = new maplibregl.Marker({
                    element: container,
                    anchor: 'center',
                    rotationAlignment: 'map', // Map-aligned rotation (True North)
                    pitchAlignment: 'map'
                })
                    .setLngLat([lng, lat])
                    .setRotation(rotation)
                    .addTo(map);

                flightMarkers[id] = { marker, el, lat, lng, velocity: gs, track };
            }
        });

        // Remove blips that left the viewport
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

    // Universal Global Lobby ID
    const LOBBY_ID = 'GTA-V-UNIVERSAL-LOBBY-M4K0';
    let retryCount = 0;
    const MAX_RETRIES = 5;

    function initMultiplayer(lat, lng) {
        const statusEl = cachedStatusEl;
        const peerIdEl = cachedPeerIdEl;

        if (isMultiplayerTransitioning) {
            if (statusEl && !statusEl.innerText.includes('RETRY')) {
                statusEl.innerText = "FINDING SESSION...";
            }
            return;
        }
        isMultiplayerTransitioning = true;

        userPos.lat = lat;
        userPos.lng = lng;

        // Clear all existing blips on re-init to prevent ghosting
        for (let id in otherPlayers) {
            if (otherPlayers[id].marker) otherPlayers[id].marker.remove();
        }
        otherPlayers = {};

        const hubId = LOBBY_ID;

        if (statusEl && !statusEl.innerText.includes('RETRY')) {
            statusEl.innerText = "FINDING SESSION...";
        }

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
            retryCount = 0;
            isMultiplayerTransitioning = false;
            console.log('My Peer ID:', myId);
            myPeerId = myId;
            if (peerIdEl) peerIdEl.innerText = myId;
            if (statusEl) statusEl.innerText = "JOINING GLOBAL LOBBY...";
            attemptConnect(hubId, myId, peer);
        });

        peer.on('error', (err) => {
            isMultiplayerTransitioning = false;
            console.error('Peer Primary Error:', err.type, err);
            if (err.type === 'peer-unavailable') {
                retryCount = 0;
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
                hubConnection = conn;
                startHeartbeat(conn, myId);

                // Receive World State from the Hub
                conn.on('data', (data) => {
                    if (data.type === 'WORLD_SYNC') {
                        const incomingIds = new Set(Object.keys(data.players));

                        // Remove players no longer in the world sync
                        for (let id in otherPlayers) {
                            if (!incomingIds.has(id)) {
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
                retryCount = 0;
                isMultiplayerTransitioning = false;
                if (statusEl) statusEl.innerText = "LOBBY ACTIVE (RELAY)";
                console.log('+++ GLOBAL LOBBY RELAY ACTIVE +++');
                myPeerId = hubId;

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
                    worldData.players[mySessionId] = {
                        sessionId: mySessionId,
                        lat: userPos.lat,
                        lng: userPos.lng,
                        name: cachedUsernameEl?.innerText || 'PlayerOne'
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
                        } else if (data.type === 'MISSION_UPDATE') {
                            connections.forEach(c => {
                                if (c !== conn && c.open) c.send(data);
                            });
                            handleMissionUpdate(data);
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
                    console.log('Hub ID ghosted! Retrying in 5s...');
                    hubPeer.destroy();
                    retryCount++;
                    if (retryCount >= MAX_RETRIES) {
                        console.error('Max retries reached. Waiting 30s before reset.');
                        if (statusEl) statusEl.innerText = "LOBBY BUSY - RETRYING...";
                        retryCount = 0;
                        setTimeout(() => initMultiplayer(userPos.lat, userPos.lng), 30000);
                    } else {
                        if (statusEl) statusEl.innerText = `RETRY ${retryCount}/${MAX_RETRIES}...`;
                        setTimeout(() => initMultiplayer(userPos.lat, userPos.lng), 5000);
                    }
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
                        name: cachedUsernameEl?.innerText || 'PlayerOne'
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
                else if (data.type === 'MISSION_UPDATE') handleMissionUpdate(data);
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

        if (otherPlayers[id]) {
            otherPlayers[id].marker.setLngLat([data.lng, data.lat]);
            otherPlayers[id].lat = data.lat;
            otherPlayers[id].lng = data.lng;

            // Follow mode for others
            if (followTarget === id) {
                map.flyTo({ center: [data.lng, data.lat], essential: true });
            }

            otherPlayers[id].name = data.name || "Unknown Player";
            otherPlayers[id].sessionId = data.sessionId;
            otherPlayers[id].lastUpdate = Date.now();
        } else {
            console.log('New player detected (Session ID):', id);
            const el = document.createElement('div');
            el.className = 'other-blip';

            // Create the visible icon
            const icon = document.createElement('div');
            icon.className = 'blip-icon';
            el.appendChild(icon);

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
    const cachedUsernameEl = document.querySelector('.username');
    const cachedStatusEl = document.querySelector('.connection-status');
    const cachedPeerIdEl = document.getElementById('debug-peer-id');
    const cachedLegendList = document.getElementById('legend-list');

    function updateLegend() {
        const legendList = cachedLegendList || document.getElementById('legend-list');
        if (!legendList) return;

        const selfName = cachedUsernameEl?.innerText || 'YOU';
        const playerIds = Object.keys(otherPlayers);
        const existingEntries = legendList.querySelectorAll('.legend-entry');
        const existingIds = [];

        existingEntries.forEach((entry, i) => {
            if (i === 0) return;
            existingIds.push(entry.dataset.playerId);
        });

        const neededIds = playerIds;

        const removedIds = existingIds.filter(id => !neededIds.includes(id));
        const addedIds = neededIds.filter(id => !existingIds.includes(id));
        const keptIds = neededIds.filter(id => existingIds.includes(id));

        removedIds.forEach(id => {
            const entry = legendList.querySelector(`[data-player-id="${id}"]`);
            if (entry) entry.remove();
        });

        const selfEntry = existingEntries[0];
        if (selfEntry) {
            const nameSpan = selfEntry.querySelector('.legend-name');
            if (nameSpan) nameSpan.textContent = selfName;
        } else {
            const entry = document.createElement('div');
            entry.className = 'legend-entry clickable';
            entry.title = 'Center on YOU';
            entry.innerHTML = `
                <span class="legend-name self">${selfName}</span>
                <div class="legend-blip self"></div>
            `;
            entry.addEventListener('click', () => {
                if (userPos.lat && userPos.lng) {
                    followTarget = 'self';
                    map.flyTo({ center: [userPos.lng, userPos.lat], zoom: Math.max(map.getZoom(), 15), essential: true });
                }
            });
            legendList.appendChild(entry);
        }

        addedIds.forEach(id => {
            const p = otherPlayers[id];
            if (!p) return;
            const entry = document.createElement('div');
            entry.className = 'legend-entry clickable';
            entry.dataset.playerId = id;
            entry.title = `Center & Follow ${p.name || 'Player'}`;
            entry.innerHTML = `
                <span class="legend-name">${p.name || 'Unknown'}</span>
                <div class="legend-blip other"></div>
            `;
            entry.addEventListener('click', () => {
                if (p.lat && p.lng) {
                    followTarget = id;
                    map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), essential: true });
                }
            });
            legendList.appendChild(entry);
        });

        keptIds.forEach(id => {
            const p = otherPlayers[id];
            const entry = legendList.querySelector(`[data-player-id="${id}"]`);
            if (entry && p) {
                const nameSpan = entry.querySelector('.legend-name');
                if (nameSpan) nameSpan.textContent = p.name || 'Unknown';
            }
        });
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
            if (cachedUsernameEl) cachedUsernameEl.innerText = e.target.value || 'PlayerOne';
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

    // Flight Radar toggle
    const flightRadarToggle = document.getElementById('flight-radar-toggle-btn');
    if (flightRadarToggle) {
        flightRadarToggle.addEventListener('click', () => {
            const isOn = flightRadarToggle.innerText.includes('On');
            flightRadarToggle.innerText = isOn ? '< Off >' : '< On >';

            if (map && map.getLayer('airports-layer')) {
                map.setLayoutProperty('airports-layer', 'visibility', isOn ? 'none' : 'visible');
            }

            radarEnabled = !isOn;

            saveSettings();

            if (isOn) {
                allAircraftData = [];
                clearFlightBlips();
            } else {
                fetchFlights();
            }
        });
    }

    // Reduce Motion toggle
    const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
    function applyReduceMotion(enabled) {
        document.body.classList.toggle('reduce-motion', enabled);
    }
    if (reduceMotionToggle) {
        reduceMotionToggle.addEventListener('click', () => {
            const isOn = reduceMotionToggle.innerText.includes('On');
            reduceMotionToggle.innerText = isOn ? '< Off >' : '< On >';
            applyReduceMotion(!isOn);
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
                if (sounds) {
                    const vol = slider.value / 100;
                    Object.values(sounds).forEach(sound => {
                        sound.volume = vol;
                    });
                    sounds.music.volume = vol * 0.6;
                }
                Object.keys(stationWidgets).forEach(key => {
                    if (parseInt(key) === currentRadioIndex) {
                        stationWidgets[key].setVolume(slider.value); // SC is 0-100
                    }
                });
            } else if (slider.id === 'radio-volume-slider') {
                // Update Active Radio Volume >w<
                Object.keys(stationWidgets).forEach(key => {
                    if (parseInt(key) === currentRadioIndex) {
                        stationWidgets[key].setVolume(slider.value); // SC is 0-100
                    }
                });
                Object.keys(directAudioPlayers).forEach(key => {
                    if (parseInt(key) === currentRadioIndex) {
                        directAudioPlayers[key].volume = slider.value / 100;
                    }
                });
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

    // --- Keyboard Navigation ---
    document.addEventListener('keydown', (e) => {
        const activeTab = document.querySelector('.nav-item.active');
        const tabNames = Array.from(navItems).map(i => i.dataset.tab);
        const currentIndex = tabNames.indexOf(activeTab?.dataset.tab);

        if (e.key === 'ArrowRight') {
            const next = (currentIndex + 1) % tabNames.length;
            switchTab(tabNames[next]);
            sounds.changeOption.currentTime = 0;
            sounds.changeOption.play().catch(() => { });
        } else if (e.key === 'ArrowLeft') {
            const prev = (currentIndex - 1 + tabNames.length) % tabNames.length;
            switchTab(tabNames[prev]);
            sounds.changeOption.currentTime = 0;
            sounds.changeOption.play().catch(() => { });
        } else if (e.key === 'Escape') {
            sounds.back.currentTime = 0;
            sounds.back.play().catch(() => { });
            switchTab(previousTab || 'map');
        } else if (e.key === 'Enter') {
            const radioTab = document.getElementById('radio');
            if (radioTab.classList.contains('active')) {
                const stations = document.querySelectorAll('.radio-station');
                if (stations[currentRadioIndex]) stations[currentRadioIndex].click();
            }
        }
    });

    // --- Radio Toast ---
    function showRadioToast(msg) {
        let toast = document.getElementById('radio-toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('visible'), 2000);
    }

    // --- GPS Navigation System ---
    let personalWaypoint = null;
    let missionMarker = null;
    let personalWaypointMarker = null;
    let missionMarkerEl = null;
    let personalRouteSource = null;
    let missionRouteSource = null;
    let personalRouteLayer = null;
    let missionRouteLayer = null;
    let gpsMode = null;
    let routeUpdateInterval = null;

    const gpsRouteInfo = document.getElementById('gps-route-info');
    const routeDistanceEl = document.getElementById('route-distance');
    const routeTimeEl = document.getElementById('route-time');
    const gpsModeIndicator = document.getElementById('gps-mode-indicator');

    function initGPSSystem() {
        if (!map) return;

        map.addSource('personal-route', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
        personalRouteSource = map.getSource('personal-route');

        map.addLayer({
            id: 'personal-route-glow',
            type: 'line',
            source: 'personal-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': '#a44cf2',
                'line-width': 12,
                'line-opacity': 0.4,
                'line-blur': 4
            }
        });

        map.addLayer({
            id: 'personal-route-layer',
            type: 'line',
            source: 'personal-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': '#c88aff',
                'line-width': 6,
                'line-opacity': 1
            }
        });
        personalRouteLayer = map.getLayer('personal-route-layer');

        map.addSource('mission-route', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
        missionRouteSource = map.getSource('mission-route');

        map.addLayer({
            id: 'mission-route-glow',
            type: 'line',
            source: 'mission-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': '#efc74f',
                'line-width': 12,
                'line-opacity': 0.4,
                'line-blur': 4
            }
        });

        map.addLayer({
            id: 'mission-route-layer',
            type: 'line',
            source: 'mission-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': '#ffe066',
                'line-width': 6,
                'line-opacity': 1
            }
        });
        missionRouteLayer = map.getLayer('mission-route-layer');

        map.on('contextmenu', (e) => {
            e.preventDefault();
            placePersonalWaypoint(e.lngLat.lng, e.lngLat.lat);
        });

        map.on('dblclick', (e) => {
            e.preventDefault();
            placeMissionMarker(e.lngLat.lng, e.lngLat.lat);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (personalWaypoint) {
                    removePersonalWaypoint();
                }
            }
            if (e.key === 'm' || e.key === 'M') {
                if (missionMarker) {
                    removeMissionMarker();
                }
            }
        });

        routeUpdateInterval = setInterval(() => {
            if (personalWaypoint && userPos) {
                calculateAndDrawRoute(userPos.lng, userPos.lat, personalWaypoint.lng, personalWaypoint.lat, 'personal');
            }
            if (missionMarker && userPos) {
                calculateAndDrawRoute(userPos.lng, userPos.lat, missionMarker.lng, missionMarker.lat, 'mission');
            }
        }, 5000);
        
        // GPS button event listeners
        document.getElementById('place-waypoint-btn')?.addEventListener('click', () => {
            // Place waypoint at current player position
            if (userPos) {
                placePersonalWaypoint(userPos.lng, userPos.lat);
                showRadioToast('WAYPOINT SET AT PLAYER');
            } else {
                showRadioToast('WAITING FOR GPS...');
            }
        });
        
        document.getElementById('place-mission-btn')?.addEventListener('click', () => {
            // Place mission marker at current player position
            if (userPos) {
                placeMissionMarker(userPos.lng, userPos.lat);
                showRadioToast('MISSION SET AT PLAYER');
            } else {
                showRadioToast('WAITING FOR GPS...');
            }
        });
    }

    function placePersonalWaypoint(lng, lat) {
        if (personalWaypointMarker) {
            personalWaypointMarker.remove();
        }

        personalWaypoint = { lng, lat };

        const el = document.createElement('div');
        el.className = 'waypoint-blip';
        const icon = document.createElement('div');
        icon.className = 'blip-icon';
        el.appendChild(icon);

        personalWaypointMarker = new maplibregl.Marker({
            element: el,
            anchor: 'bottom',
            rotationAlignment: 'viewport',
            pitchAlignment: 'viewport'
        }).setLngLat([lng, lat]).addTo(map);

        showGPSMode('waypoint');
        calculateAndDrawRoute(userPos.lng, userPos.lat, lng, lat, 'personal');
        showRadioToast('WAYPOINT SET');
    }

    function removePersonalWaypoint() {
        if (personalWaypointMarker) {
            personalWaypointMarker.remove();
            personalWaypointMarker = null;
        }
        personalWaypoint = null;
        if (personalRouteSource) {
            personalRouteSource.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
        }
        hideGPSRouteInfo();
        showRadioToast('WAYPOINT REMOVED');
    }

    function placeMissionMarker(lng, lat) {
        if (missionMarkerEl) {
            missionMarkerEl.remove();
        }

        missionMarker = { lng, lat };

        const el = document.createElement('div');
        el.className = 'mission-blip';
        const icon = document.createElement('div');
        icon.className = 'blip-icon';
        el.appendChild(icon);

        missionMarkerEl = new maplibregl.Marker({
            element: el,
            anchor: 'bottom',
            rotationAlignment: 'viewport',
            pitchAlignment: 'viewport'
        }).setLngLat([lng, lat]).addTo(map);

        showGPSMode('mission');
        calculateAndDrawRoute(userPos.lng, userPos.lat, lng, lat, 'mission');
        showRadioToast('MISSION MARKER SET');

        broadcastMissionMarker();
    }

    function removeMissionMarker() {
        if (missionMarkerEl) {
            missionMarkerEl.remove();
            missionMarkerEl = null;
        }
        missionMarker = null;
        if (missionRouteSource) {
            missionRouteSource.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
        }
        hideGPSRouteInfo();
        showRadioToast('MISSION MARKER REMOVED');

        broadcastMissionMarker();
    }

    function broadcastMissionMarker() {
        if (!currentPeer) return;

        const missionData = {
            type: 'MISSION_UPDATE',
            sessionId: mySessionId,
            mission: missionMarker ? { lng: missionMarker.lng, lat: missionMarker.lat } : null
        };

        if (hubConnection && hubConnection.open) {
            hubConnection.send(missionData);
        } else if (connections && connections.length > 0) {
            connections.forEach(c => {
                if (c.open) c.send(missionData);
            });
        }
    }

    function handleMissionUpdate(data) {
        if (data.sessionId === mySessionId) return;

        if (data.mission) {
            if (missionMarkerEl) {
                missionMarkerEl.setLngLat([data.mission.lng, data.mission.lat]);
            } else {
                const el = document.createElement('div');
                el.className = 'mission-blip';
                const icon = document.createElement('div');
                icon.className = 'blip-icon';
                el.appendChild(icon);

                missionMarkerEl = new maplibregl.Marker({
                    element: el,
                    anchor: 'center',
                    rotationAlignment: 'viewport',
                    pitchAlignment: 'viewport'
                }).setLngLat([data.mission.lng, data.mission.lat]).addTo(map);
            }
            missionMarker = data.mission;
            calculateAndDrawRoute(userPos.lng, userPos.lat, data.mission.lng, data.mission.lat, 'mission');
        } else {
            if (missionMarkerEl) {
                missionMarkerEl.remove();
                missionMarkerEl = null;
            }
            missionMarker = null;
            if (missionRouteSource) {
                missionRouteSource.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
            }
        }
    }

    async function calculateAndDrawRoute(fromLng, fromLat, toLng, toLat, type) {
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
                console.warn('OSRM routing failed:', data.code);
                return;
            }

            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;

            if (type === 'personal' && personalRouteSource) {
                personalRouteSource.setData({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates }
                });
            } else if (type === 'mission' && missionRouteSource) {
                missionRouteSource.setData({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates }
                });
            }

            const distanceKm = (route.distance / 1000).toFixed(1);
            const durationMin = Math.round(route.duration / 60);

            showGPSRouteInfo(distanceKm, durationMin, type);

        } catch (error) {
            console.error('Route calculation error:', error);
        }
    }

    function showGPSRouteInfo(distance, time, type) {
        if (!gpsRouteInfo || !routeDistanceEl || !routeTimeEl) return;

        routeDistanceEl.textContent = `${distance} km`;
        routeTimeEl.textContent = `${time} min`;

        gpsRouteInfo.style.setProperty('--gps-color', type === 'personal' ? '#a44cf2' : '#efc74f');
        gpsRouteInfo.classList.add('visible');
    }

    function hideGPSRouteInfo() {
        if (gpsRouteInfo) {
            gpsRouteInfo.classList.remove('visible');
        }
    }

    function showGPSMode(mode) {
        if (!gpsModeIndicator) return;

        gpsMode = mode;
        gpsModeIndicator.textContent = mode === 'waypoint' ? 'GPS: WAYPOINT' : 'GPS: MISSION';
        gpsModeIndicator.className = 'gps-mode-indicator visible ' + (mode === 'waypoint' ? 'waypoint-mode' : 'mission-mode');

        setTimeout(() => {
            gpsModeIndicator.classList.remove('visible');
        }, 3000);
    }

    if (map) {
        if (map.loaded()) {
            initGPSSystem();
        } else {
            map.on('load', initGPSSystem);
        }
    }
});
