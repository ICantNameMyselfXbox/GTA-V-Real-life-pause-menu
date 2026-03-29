$output = "window.RADIO_SONGS = {`n"
$dirs = Get-ChildItem -Directory -Path "sfx and music"

foreach ($dir in $dirs) {
    $station = $dir.Name
    $output += "    `"$station`": [`n"
    $files = Get-ChildItem -Path $dir.FullName -Filter "*.mp3" -File
    foreach ($f in $files) {
        $relPath = "sfx and music/$station/" + $f.Name
        $relPath = $relPath -replace "'", "\'"
        $output += "        '$relPath',`n"
    }
    $output += "    ],`n"
}

$output += "};`n"
Set-Content -Path ".\songs.js" -Value $output -Encoding UTF8
Write-Host "Successfully generated songs.js! All your radio stations are updated! >w<"
Start-Sleep -Seconds 2
