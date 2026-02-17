document.addEventListener('DOMContentLoaded', () => {
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

    // --- Settings Persistence & Application ---
    const usernameInput = document.getElementById('username-input');
    const pfpInput = document.getElementById('pfp-input');
    const colorInput = document.getElementById('color-input');
    const sliders = document.querySelectorAll('.gta-slider');

    function applyVolume(val) {
        try {
            const volume = val / 100;
            Object.values(sounds).forEach(sound => {
                if (sound instanceof Audio) sound.volume = volume;
            });
        } catch (e) { console.error("Volume apply failed:", e); }
    }

    function applyBrightness(val) {
        try {
            const brightness = 0.5 + (val / 100);
            const container = document.querySelector('.pause-menu-container');
            if (container) container.style.filter = `brightness(${brightness})`;
        } catch (e) { console.error("Brightness apply failed:", e); }
    }

    function saveSettings() {
        try {
            if (!usernameInput || !colorInput || sliders.length < 2) return;
            const avatarEl = document.querySelector('.avatar');
            const settings = {
                username: usernameInput.value,
                accentColor: colorInput.value,
                avatar: avatarEl ? avatarEl.src : '',
                volume: sliders[0].value,
                brightness: sliders[1].value
            };
            localStorage.setItem('gta_pause_settings', JSON.stringify(settings));
        } catch (e) { console.error("Save failed:", e); }
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem('gta_pause_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (usernameInput) {
                    usernameInput.value = settings.username || 'PlayerOne';
                    const userDisplay = document.querySelector('.username');
                    if (userDisplay) userDisplay.innerText = usernameInput.value;
                }
                if (colorInput) {
                    colorInput.value = settings.accentColor || '#3498db';
                    document.documentElement.style.setProperty('--accent-color', colorInput.value);
                }
                if (settings.avatar) {
                    const avatarEl = document.querySelector('.avatar');
                    if (avatarEl) avatarEl.src = settings.avatar;
                }
                if (sliders.length >= 2) {
                    const vol = settings.volume !== undefined ? settings.volume : 80;
                    const bright = settings.brightness !== undefined ? settings.brightness : 50;
                    sliders[0].value = vol;
                    sliders[1].value = bright;
                    applyVolume(vol);
                    applyBrightness(bright);
                }
            } else {
                applyVolume(80);
                applyBrightness(50);
            }
        } catch (err) {
            console.error("Load failed:", err);
            applyVolume(80);
            applyBrightness(50);
        }
    }

    loadSettings();

    // Event Listeners
    if (usernameInput) {
        usernameInput.addEventListener('input', () => {
            const userDisplay = document.querySelector('.username');
            if (userDisplay) userDisplay.innerText = usernameInput.value || 'PlayerOne';
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
                reader.onload = (event) => {
                    const avatarEl = document.querySelector('.avatar');
                    if (avatarEl) {
                        avatarEl.src = event.target.result;
                        saveSettings();
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (sliders.length >= 2) {
        sliders[0].addEventListener('input', () => {
            applyVolume(sliders[0].value);
            saveSettings();
        });
        sliders[1].addEventListener('input', () => {
            applyBrightness(sliders[1].value);
            saveSettings();
        });
    }

    // --- Geolocation & Live Data ---
    const clockElement = document.getElementById('real-time-clock');

    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        if (clockElement) clockElement.textContent = `${hours}:${minutes}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Map Initialization
    let map;
    try {
        const apiKey = 'xZ5mRqiLKIk5P0G37FF9';
        const mapId = '0196a9ff-ca5a-72a8-b5e3-71deec7a5e00';
        const styleUrl = `https://api.maptiler.com/maps/${mapId}/style.json?key=${apiKey}`;

        map = new maplibregl.Map({
            container: 'map-container',
            style: styleUrl,
            center: [-0.09, 51.505], // Default London
            zoom: 13,
            attributionControl: false
        });
    } catch (e) {
        console.error("Map failed to load:", e);
    }

    // Geolocation Tracking
    let multiplayerInitialized = false;
    let playerMarker = null;

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            userPos.lat = lat;
            userPos.lng = lng;

            if (!playerMarker) {
                const playerMarkerEl = document.createElement('div');
                playerMarkerEl.className = 'player-blip';
                playerMarker = new maplibregl.Marker({ element: playerMarkerEl })
                    .setLngLat([lng, lat])
                    .addTo(map);
                if (map) map.flyTo({ center: [lng, lat], zoom: 15, essential: true });
                if (!multiplayerInitialized) {
                    initMultiplayer(lat, lng);
                    multiplayerInitialized = true;
                }
                fetchWeather(lat, lng);
            } else {
                playerMarker.setLngLat([lng, lat]);
            }

            const coordText = document.querySelector('.coordinates');
            if (coordText) {
                const ns = lat >= 0 ? 'N' : 'S';
                const ew = lng >= 0 ? 'E' : 'W';
                coordText.innerText = `${ns} ${Math.abs(lat).toFixed(4)}°  ${ew} ${Math.abs(lng).toFixed(4)}°`;
            }
            const locName = document.querySelector('.location-name');
            if (locName) locName.innerText = "Current Location";
        }, error => {
            console.error("Geolocation error:", error);
            const locName = document.querySelector('.location-name');
            if (locName) locName.innerText = "Location Unavailable";
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
    }

    // Multiplayer Functions
    let otherPlayers = {};
    let connections = [];
    let userPos = { lat: 0, lng: 0 };

    function initMultiplayer(lat, lng) {
        try {
            if (typeof Peer === 'undefined') return;
            const hubId = 'GTA-V-LOBBY-RECREATION';
            const peer = new Peer();

            peer.on('open', (myId) => {
                const connToHub = peer.connect(hubId);
                connToHub.on('open', () => startHeartbeat(connToHub, myId));
                connToHub.on('error', () => becomeHub());
                setTimeout(() => { if (!connToHub.open) becomeHub(); }, 3000);
            });

            function becomeHub() {
                const hubPeer = new Peer(hubId);
                hubPeer.on('open', () => {
                    hubPeer.on('connection', (conn) => {
                        connections.push(conn);
                        conn.on('data', (data) => {
                            if (data.type === 'POS_UPDATE') {
                                updateOtherPlayer(data);
                                connections.forEach(c => { if (c.open && c.peer !== data.id) c.send(data); });
                            }
                        });
                        conn.on('close', () => connections = connections.filter(c => c !== conn));
                    });
                });
            }

            function startHeartbeat(conn, myId) {
                setInterval(() => {
                    if (conn.open) {
                        const userDisplay = document.querySelector('.username');
                        conn.send({
                            type: 'POS_UPDATE', id: myId, lat: userPos.lat, lng: userPos.lng,
                            name: userDisplay ? userDisplay.innerText : 'Anonymous'
                        });
                    }
                }, 3000);
            }

            peer.on('connection', (conn) => {
                conn.on('data', (data) => { if (data.type === 'POS_UPDATE') updateOtherPlayer(data); });
            });
        } catch (e) { console.error("Multiplayer error:", e); }
    }

    function updateOtherPlayer(data) {
        if (otherPlayers[data.id]) {
            otherPlayers[data.id].marker.setLngLat([data.lng, data.lat]);
            otherPlayers[data.id].lastUpdate = Date.now();
        } else {
            const el = document.createElement('div');
            el.className = 'other-blip';
            const marker = new maplibregl.Marker({ element: el }).setLngLat([data.lng, data.lat]).addTo(map);
            otherPlayers[data.id] = { marker, lastUpdate: Date.now() };
        }
    }

    setInterval(() => {
        const now = Date.now();
        for (let id in otherPlayers) {
            if (now - otherPlayers[id].lastUpdate > 15000) {
                otherPlayers[id].marker.remove();
                delete otherPlayers[id];
            }
        }
    }, 5000);

    // Weather API
    async function fetchWeather(lat, lng) {
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max&timezone=auto`);
            const data = await response.json();
            updateWeatherUI(data);
        } catch (e) { console.error("Weather error:", e); }
    }

    function updateWeatherUI(data) {
        const current = data.current;
        const daily = data.daily;
        const getWeatherInfo = (code, isDay = 1) => {
            const icons = { 0: isDay ? '☀️' : '🌙', 1: isDay ? '🌤️' : '☁️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 61: '🌧️', 71: '❄️', 95: '⛈️' };
            const desc = { 0: 'Clear Sky', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Foggy', 51: 'Drizzle', 61: 'Rainy', 71: 'Snowy', 95: 'Thunderstorm' };
            return { icon: icons[code] || '❓', text: desc[code] || 'Unknown' };
        };
        const currentInfo = getWeatherInfo(current.weather_code, current.is_day);
        document.querySelector('.temperature').innerText = `${Math.round(current.temperature_2m)}°C`;
        document.querySelector('.condition').innerText = currentInfo.text;
        document.querySelector('.weather-icon').innerText = currentInfo.icon;
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const forecastContainer = document.querySelector('.forecast-row');
        if (forecastContainer) {
            forecastContainer.innerHTML = '';
            for (let i = 1; i <= 3; i++) {
                const date = new Date(daily.time[i]);
                const info = getWeatherInfo(daily.weather_code[i]);
                const item = document.createElement('div');
                item.className = 'forecast-item';
                item.innerHTML = `<div class="day">${days[date.getDay()]}</div><div class="icon">${info.icon}</div><div class="temp">${Math.round(daily.temperature_2m_max[i])}°C</div>`;
                forecastContainer.appendChild(item);
            }
        }
    }

    // Sounds for inputs
    const allInputs = document.querySelectorAll('input, .toggle-switch');
    allInputs.forEach(input => {
        if (input.type !== 'text' && input.type !== 'file' && input.type !== 'color') {
            input.addEventListener('input', () => {
                if (sounds.changeOption) {
                    sounds.changeOption.currentTime = 0;
                    sounds.changeOption.play().catch(() => { });
                }
            });
        }
    });
});
