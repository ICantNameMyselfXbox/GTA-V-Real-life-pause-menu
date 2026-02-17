document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. STATE & DOM REFERENCES (Declarations First!)
    // =========================================================================

    // Audio State
    const sounds = {
        changeOption: new Audio('sfx and music/changeoption.mp3'),
        switchTab: new Audio('sfx and music/switchtab.mp3'),
        tabLoaded: new Audio('sfx and music/tabloaded.mp3'),
        back: new Audio('sfx and music/back.mp3'),
        music: new Audio('sfx and music/pausemenumusic.mp3')
    };

    // Navigation References
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    // UI/Clock References
    const clockElement = document.getElementById('real-time-clock');

    // Settings References
    const usernameInput = document.getElementById('username-input');
    const pfpInput = document.getElementById('pfp-input');
    const colorInput = document.getElementById('color-input');
    const sliders = document.querySelectorAll('.gta-slider');

    // Map & Geolocation State
    let map = null;
    let playerMarker = null;
    let multiplayerInitialized = false;
    let userPos = { lat: 0, lng: 0 };

    // Multiplayer State
    let otherPlayers = {}; // { peerId: { marker, lastUpdate } }
    let connections = []; // For Hub mode

    // =========================================================================
    // 2. HELPER FUNCTIONS
    // =========================================================================

    function applyVolume(val) {
        try {
            const volume = val / 100;
            Object.values(sounds).forEach(s => {
                if (s instanceof Audio) s.volume = volume;
            });
        } catch (e) { console.error("Volume Error:", e); }
    }

    function applyBrightness(val) {
        try {
            const brightness = 0.5 + (val / 100);
            const container = document.querySelector('.pause-menu-container');
            if (container) container.style.filter = `brightness(${brightness})`;
        } catch (e) { console.error("Brightness Error:", e); }
    }

    function saveSettings() {
        try {
            if (!usernameInput || !colorInput || sliders.length < 2) return;
            const avatarEl = document.querySelector('.avatar');
            const data = {
                username: usernameInput.value,
                accentColor: colorInput.value,
                avatar: avatarEl ? avatarEl.src : '',
                volume: sliders[0].value,
                brightness: sliders[1].value
            };
            localStorage.setItem('gta_pause_settings', JSON.stringify(data));
        } catch (e) { console.error("Save Error:", e); }
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem('gta_pause_settings');
            if (saved) {
                const s = JSON.parse(saved);
                if (usernameInput) {
                    usernameInput.value = s.username || 'PlayerOne';
                    const ud = document.querySelector('.username');
                    if (ud) ud.innerText = usernameInput.value;
                }
                if (colorInput) {
                    colorInput.value = s.accentColor || '#3498db';
                    document.documentElement.style.setProperty('--accent-color', colorInput.value);
                }
                if (s.avatar) {
                    const av = document.querySelector('.avatar');
                    if (av) av.src = s.avatar;
                }
                if (sliders.length >= 2) {
                    const v = s.volume !== undefined ? s.volume : 80;
                    const b = s.brightness !== undefined ? s.brightness : 50;
                    sliders[0].value = v; sliders[1].value = b;
                    applyVolume(v); applyBrightness(b);
                }
            } else {
                applyVolume(80); applyBrightness(50);
            }
        } catch (e) {
            console.error("Load Error:", e);
            applyVolume(80); applyBrightness(50);
        }
    }

    // =========================================================================
    // 3. FEATURE MODULES
    // =========================================================================

    // TAB NAVIGATION
    function initTabs() {
        navItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                sounds.changeOption.currentTime = 0;
                sounds.changeOption.play().catch(() => { });
            });
            item.addEventListener('click', () => {
                const tabId = item.dataset.tab;
                sounds.switchTab.currentTime = 0;
                sounds.switchTab.play().catch(() => { });

                navItems.forEach(n => n.classList.toggle('active', n.dataset.tab === tabId));
                tabContents.forEach(c => {
                    c.classList.toggle('active', c.id === tabId);
                    if (c.id === 'map' && c.classList.contains('active') && map) {
                        setTimeout(() => map.resize(), 100);
                    }
                });
            });
        });
    }

    // AUDIO/MUSIC SETUP
    function initAudio() {
        Object.values(sounds).forEach(s => s.volume = 0.5);
        sounds.music.loop = true;
        sounds.music.volume = 0.3;
        document.body.addEventListener('click', () => {
            if (sounds.music.paused) sounds.music.play().catch(() => { });
        }, { once: true });
    }

    // CLOCK
    function initClock() {
        const update = () => {
            const now = new Date();
            if (clockElement) {
                clockElement.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            }
        };
        setInterval(update, 1000);
        update();
    }

    // MAP INITIALIZATION
    function initMap() {
        try {
            const apiKey = 'xZ5mRqiLKIk5P0G37FF9';
            const mapId = '0196a9ff-ca5a-72a8-b5e3-71deec7a5e00';
            map = new maplibregl.Map({
                container: 'map-container',
                style: `https://api.maptiler.com/maps/${mapId}/style.json?key=${apiKey}`,
                center: [-0.09, 51.505],
                zoom: 13,
                attributionControl: false
            });
        } catch (e) { console.error("Map Init Fail:", e); }
    }

    // GEOLOCATION & WEATHER
    function initGeo() {
        if (!navigator.geolocation) return;
        navigator.geolocation.watchPosition(pos => {
            const { latitude: lat, longitude: lng } = pos.coords;
            userPos = { lat, lng };

            if (!playerMarker) {
                const el = document.createElement('div'); el.className = 'player-blip';
                playerMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
                if (map) map.flyTo({ center: [lng, lat], zoom: 15, essential: true });
                if (!multiplayerInitialized) { initMultiplayer(lat, lng); multiplayerInitialized = true; }
                fetchWeather(lat, lng);
            } else { playerMarker.setLngLat([lng, lat]); }

            const ct = document.querySelector('.coordinates');
            if (ct) ct.innerText = `${lat >= 0 ? 'N' : 'S'} ${Math.abs(lat).toFixed(4)}°  ${lng >= 0 ? 'E' : 'W'} ${Math.abs(lng).toFixed(4)}°`;
            const ln = document.querySelector('.location-name');
            if (ln) ln.innerText = "Current Location";
        }, err => {
            console.error("Geo Error:", err);
            const ln = document.querySelector('.location-name');
            if (ln) ln.innerText = "Location Unavailable";
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
    }

    // MULTIPLAYER
    function initMultiplayer(startLat, startLng) {
        try {
            if (typeof Peer === 'undefined') return;
            const peer = new Peer();
            const hubId = 'GTA-V-LOBBY-RECREATION';

            peer.on('open', (myId) => {
                const conn = peer.connect(hubId);
                conn.on('open', () => {
                    setInterval(() => {
                        if (conn.open) {
                            const ud = document.querySelector('.username');
                            conn.send({ type: 'POS_UPDATE', id: myId, lat: userPos.lat, lng: userPos.lng, name: ud ? ud.innerText : 'Player' });
                        }
                    }, 3000);
                });
                conn.on('error', () => becomeHub());
                setTimeout(() => { if (!conn.open) becomeHub(); }, 3000);
            });

            function becomeHub() {
                const hub = new Peer(hubId);
                hub.on('open', () => {
                    hub.on('connection', c => {
                        connections.push(c);
                        c.on('data', d => {
                            if (d.type === 'POS_UPDATE') {
                                updateOther(d);
                                connections.forEach(target => { if (target.open && target.peer !== d.id) target.send(d); });
                            }
                        });
                        c.on('close', () => connections = connections.filter(x => x !== c));
                    });
                });
            }

            peer.on('connection', c => c.on('data', d => { if (d.type === 'POS_UPDATE') updateOther(d); }));
        } catch (e) { console.error("Multiplayer Error:", e); }
    }

    function updateOther(data) {
        if (otherPlayers[data.id]) {
            otherPlayers[data.id].marker.setLngLat([data.lng, data.lat]);
            otherPlayers[data.id].lastUpdate = Date.now();
        } else {
            const el = document.createElement('div'); el.className = 'other-blip';
            const m = new maplibregl.Marker({ element: el }).setLngLat([data.lng, data.lat]).addTo(map);
            otherPlayers[data.id] = { marker: m, lastUpdate: Date.now() };
        }
    }

    setInterval(() => {
        const now = Date.now();
        for (let id in otherPlayers) {
            if (now - otherPlayers[id].lastUpdate > 15000) {
                otherPlayers[id].marker.remove(); delete otherPlayers[id];
            }
        }
    }, 5000);

    // WEATHER
    async function fetchWeather(lat, lng) {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max&timezone=auto`);
            const data = await res.json();
            const current = data.current;
            const daily = data.daily;
            const icons = { 0: current.is_day ? '☀️' : '🌙', 1: current.is_day ? '🌤️' : '☁️', 2: '⛅', 3: '☁️', 45: '🌫️', 51: '🌦️', 61: '🌧️', 71: '❄️', 95: '⛈️' };
            const desc = { 0: 'Clear Sky', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Foggy', 51: 'Drizzle', 61: 'Rainy', 71: 'Snowy', 95: 'Thunderstorm' };

            document.querySelector('.temperature').innerText = `${Math.round(current.temperature_2m)}°C`;
            document.querySelector('.condition').innerText = desc[current.weather_code] || 'Clear';
            document.querySelector('.weather-icon').innerText = icons[current.weather_code] || '☀️';

            const forecast = document.querySelector('.forecast-row');
            if (forecast) {
                forecast.innerHTML = '';
                const week = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                for (let i = 1; i <= 3; i++) {
                    const d = new Date(daily.time[i]);
                    const item = document.createElement('div'); item.className = 'forecast-item';
                    item.innerHTML = `<div class="day">${week[d.getDay()]}</div><div class="icon">${icons[daily.weather_code[i]] || '☀️'}</div><div class="temp">${Math.round(daily.temperature_2m_max[i])}°C</div>`;
                    forecast.appendChild(item);
                }
            }
        } catch (e) { console.error("Weather Error:", e); }
    }

    // =========================================================================
    // 4. SETTINGS LISTENERS (Robust!)
    // =========================================================================

    if (usernameInput) {
        usernameInput.addEventListener('input', () => {
            const ud = document.querySelector('.username');
            if (ud) ud.innerText = usernameInput.value || 'PlayerOne';
            saveSettings();
        });
    }

    if (colorInput) {
        colorInput.addEventListener('input', () => {
            document.documentElement.style.setProperty('--accent-color', colorInput.value);
            saveSettings();
        });
    }

    if (pfpInput) {
        pfpInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const av = document.querySelector('.avatar');
                    if (av) { av.src = ev.target.result; saveSettings(); }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (sliders.length >= 2) {
        sliders[0].addEventListener('input', () => { applyVolume(sliders[0].value); saveSettings(); });
        sliders[1].addEventListener('input', () => { applyBrightness(sliders[1].value); saveSettings(); });

        // Input Sounds for sliders only
        sliders.forEach(s => s.addEventListener('input', () => {
            sounds.changeOption.currentTime = 0; sounds.changeOption.play().catch(() => { });
        }));
    }

    // =========================================================================
    // 5. BOOTSTRAP (The Kick-off)
    // =========================================================================

    initAudio();
    initTabs();
    initClock();
    loadSettings();
    initMap();
    initGeo();
});
