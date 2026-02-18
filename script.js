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

                playerMarker = new maplibregl.Marker({ element: playerMarkerEl })
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
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }

    async function fetchLocationName(lat, lng) {
        try {
            // Nominatim requires a User-Agent or Referer header
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`, {
                headers: {
                    'User-Agent': 'GTA-V-Pause-Menu-Recreation'
                }
            });
            const data = await response.json();
            const city = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || "San Andreas";

            const locName = document.querySelector('.location-name');
            if (locName) locName.innerText = city.toUpperCase();
        } catch (error) {
            console.error("Failed to fetch city name:", error);
            const locName = document.querySelector('.location-name');
            if (locName) locName.innerText = "LOS SANTOS";
        }
    }

    let otherPlayers = {}; // { peerId: { marker, lat, lng } }
    let connections = []; // Track connections if we are the hub
    let currentPeer = null;
    let userPos = { lat: 0, lng: 0 }; // Global tracking

    function initMultiplayer(lat, lng) {
        userPos.lat = lat;
        userPos.lng = lng;

        const lobbyInput = document.getElementById('lobby-input');
        const hubId = lobbyInput.value.toUpperCase() || 'GTA-GLOBAL-LOBBY';

        const statusEl = document.querySelector('.connection-status');
        if (statusEl) statusEl.innerText = "STARTING PEER...";

        // PeerJS Config with STUN servers for NAT traversal
        const peerConfig = {
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' }
                ]
            }
        };

        if (currentPeer) currentPeer.destroy();
        let peer = new Peer(peerConfig);
        currentPeer = peer;

        peer.on('open', (myId) => {
            console.log('My Peer ID:', myId);
            if (statusEl) statusEl.innerText = "CONNECTING...";
            attemptConnect(hubId, myId, peer);
        });

        function attemptConnect(targetId, myId, peerRef) {
            console.log('Attempting to connect to Hub:', targetId);
            const conn = peerRef.connect(targetId, {
                reliable: true
            });

            let connectionTimeout = setTimeout(() => {
                if (!conn.open) {
                    console.log('Hub connection timed out. Attempting to host...');
                    conn.close();
                    becomeHub();
                }
            }, 5000);

            conn.on('open', () => {
                clearTimeout(connectionTimeout);
                console.log('Connected to Lobby Hub');
                if (statusEl) statusEl.innerText = "CONNECTED";
                startHeartbeat(conn, myId);

                // Receive relayed updates from the hub
                conn.on('data', (data) => {
                    if (data.type === 'POS_UPDATE') {
                        updateOtherPlayer(data);
                    }
                });
            });

            conn.on('close', () => {
                console.log('Hub connection closed. Retrying...');
                if (statusEl) statusEl.innerText = "LINK LOST - RECONNECTING...";
                setTimeout(() => {
                    if (currentPeer && !currentPeer.destroyed) {
                        initMultiplayer(userPos.lat, userPos.lng);
                    }
                }, 3000);
            });

            conn.on('error', (err) => {
                console.log('Hub connect error:', err);
                becomeHub();
            });
        }

        function becomeHub() {
            if (statusEl) statusEl.innerText = "HOSTING LOBBY";
            const hubPeer = new Peer(hubId, peerConfig);

            hubPeer.on('open', () => {
                console.log('+++ YOU ARE NOW HOSTING THE HUB +++');
                hubPeer.on('connection', (conn) => {
                    console.log('Someone joined your map:', conn.peer);
                    connections.push(conn);

                    // Proactive sync
                    for (let id in otherPlayers) {
                        conn.send({
                            type: 'POS_UPDATE',
                            peerId: id,
                            lat: otherPlayers[id].lat,
                            lng: otherPlayers[id].lng,
                            name: otherPlayers[id].name
                        });
                    }
                    conn.send({
                        type: 'POS_UPDATE',
                        peerId: hubId,
                        lat: userPos.lat,
                        lng: userPos.lng,
                        name: document.querySelector('.username').innerText
                    });

                    conn.on('data', (data) => {
                        if (data.type === 'POS_UPDATE') {
                            updateOtherPlayer(data);
                            connections.forEach(c => {
                                if (c.open && c.peer !== data.peerId) {
                                    c.send(data);
                                }
                            });
                        }
                    });

                    conn.on('close', () => {
                        console.log('Peer leftlobby');
                        connections = connections.filter(c => c !== conn);
                    });
                });
            });

            hubPeer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    console.log('Hub ID taken. Retrying as client...');
                    if (statusEl) statusEl.innerText = "CONNECTING...";
                    setTimeout(() => attemptConnect(hubId, peer.id, peer), 2000);
                } else {
                    console.error("Hub Error:", err);
                    if (statusEl) statusEl.innerText = "HUB ERROR";
                }
            });

            hubPeer.on('disconnected', () => {
                console.log('Hub peer disconnected from signaling server.');
                hubPeer.reconnect();
            });
        }

        function startHeartbeat(conn, myId) {
            const sendUpdate = () => {
                if (conn.open) {
                    conn.send({
                        type: 'POS_UPDATE',
                        peerId: myId,
                        lat: userPos.lat,
                        lng: userPos.lng,
                        name: document.querySelector('.username').innerText
                    });
                }
            };

            sendUpdate();
            setInterval(sendUpdate, 3000);
        }

        peer.on('connection', (conn) => {
            conn.on('data', (data) => {
                if (data.type === 'POS_UPDATE') {
                    updateOtherPlayer(data);
                }
            });
        });
    }

    function updateOtherPlayer(data) {
        const id = data.peerId || data.id;
        if (otherPlayers[id]) {
            otherPlayers[id].marker.setLngLat([data.lng, data.lat]);
            otherPlayers[id].lat = data.lat;
            otherPlayers[id].lng = data.lng;
            otherPlayers[id].name = data.name;
            otherPlayers[id].lastUpdate = Date.now();
        } else {
            console.log('New player detected on map:', id);
            const el = document.createElement('div');
            el.className = 'other-blip';

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([data.lng, data.lat])
                .addTo(map);

            otherPlayers[id] = {
                marker,
                lat: data.lat,
                lng: data.lng,
                name: data.name,
                lastUpdate: Date.now()
            };
        }
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
    }, 5000);

    // Weather API (Open-Meteo)
    async function fetchWeather(lat, lng) {
        try {
            // Removed temperature_unit=fahrenheit to default to Celsius
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max&timezone=auto`);
            const data = await response.json();

            updateWeatherUI(data);
        } catch (error) {
            console.error("Weather fetch failed:", error);
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
                45: 'Foggy', 51: 'Drizzle', 61: 'Rainy', 71: 'Snowy', 95: 'Thunderstorm'
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
        const settings = {
            username: usernameInput.value,
            accentColor: colorInput.value,
            lobbyId: document.getElementById('lobby-input').value,
            avatar: document.querySelector('.avatar').src,
            volume: sliders[0].value,
            brightness: sliders[1].value
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
            const lobbyInput = document.getElementById('lobby-input');
            if (lobbyInput) {
                lobbyInput.value = settings.lobbyId || 'GTA-GLOBAL-LOBBY';
            }

            // Avatar
            if (settings.avatar) {
                document.querySelector('.avatar').src = settings.avatar;
            }

            // Sliders
            if (sliders.length >= 2) {
                sliders[0].value = settings.volume || 80;
                sliders[1].value = settings.brightness || 50;
            }
        }
    }

    // Load initial settings
    loadSettings();

    if (usernameInput) {
        usernameInput.addEventListener('input', (e) => {
            document.querySelector('.username').innerText = e.target.value || 'PlayerOne';
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

    const lobbyInput = document.getElementById('lobby-input');
    if (lobbyInput) {
        lobbyInput.addEventListener('change', () => {
            saveSettings();
            // Re-init multiplayer if we have coordinates
            if (userPos.lat !== 0) {
                initMultiplayer(userPos.lat, userPos.lng);
            }
        });
    }

    sliders.forEach(slider => {
        slider.addEventListener('input', () => {
            saveSettings();
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
