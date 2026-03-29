@echo off
echo window.RADIO_SONGS = { > songs.js
for /d %%D in ("sfx and music\*") do (
    echo     "%%~nxD": [ >> songs.js
    for %%F in ("%%D\*.mp3") do (
        echo         "sfx and music/%%~nxD/%%~nxF", >> songs.js
    )
    echo     ], >> songs.js
)
echo }; >> songs.js
