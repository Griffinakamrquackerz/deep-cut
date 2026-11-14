# Deep Cut promo -- stitch the Blender clips into the final 10s cut.
#
# Frame math: 4 clips x 69f = 276f, minus 3 xfade overlaps of 12f (0.5s) = 240f
# = 10.000s @ 24fps. Offsets are derived from the REAL clip durations at run
# time rather than hardcoded, so a re-render at another length still lines up.
#
#   powershell -File Assets\stitch_promo.ps1
#   powershell -File Assets\stitch_promo.ps1 -Xfade 0        # hard cuts
#   powershell -File Assets\stitch_promo.ps1 -NoAudio
#
# Audio: uses Assets\music.mp3 when present (a licensed track always wins),
# otherwise synthesises a projector-room bed with ffmpeg. No track is bundled
# with this repo, so the synth path is the default and is rights-clean.
param(
  [double]$Xfade = 0.5,
  [double]$Duration = 10.0,
  [switch]$NoAudio,
  [switch]$LowQuality,
  [switch]$ShowGraph
)

$ErrorActionPreference = 'Stop'

$assets = $PSScriptRoot
$render = Join-Path $assets 'render'
$out    = Join-Path $assets 'final_promo.mp4'
$music  = Join-Path $assets 'music.mp3'

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { $ffmpeg = 'C:\Users\griff\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe' }
if (-not (Test-Path $ffmpeg)) { throw "ffmpeg not found on PATH or at $ffmpeg" }
$ffprobe = Join-Path (Split-Path $ffmpeg -Parent) 'ffprobe.exe'

# ---------- gather clips --------------------------------------------------
$clips = @()
foreach ($i in 1..4) {
  $p = Join-Path $render "clip$i.mp4"
  if (Test-Path $p) { $clips += $p } else { Write-Warning "missing clip$i.mp4" }
}
if ($clips.Count -lt 1) { throw "no clips found in $render -- run build_promo_scenes.py first" }
Write-Host ("clips: " + $clips.Count) -ForegroundColor Cyan

$durs = @()
foreach ($c in $clips) {
  $d = & $ffprobe -v error -show_entries format=duration -of csv=p=0 $c
  $durs += [double]$d
  Write-Host ("  {0}  {1:N3}s" -f (Split-Path $c -Leaf), [double]$d)
}

# xfade offsets: each transition starts (prev_length - Xfade) into the run.
$offsets = @()
if ($Xfade -gt 0) {
  $acc = 0.0
  for ($i = 0; $i -lt $clips.Count - 1; $i++) {
    $acc += $durs[$i] - $Xfade
    $offsets += [math]::Round($acc, 3)
  }
}

# ---------- inputs --------------------------------------------------------
$argsList = @()
foreach ($c in $clips) { $argsList += @('-i', $c) }

# ---------- video chain ---------------------------------------------------
if ($Xfade -gt 0 -and $clips.Count -gt 1) {
  $vparts = @()
  $prev = '[0:v]'
  for ($i = 1; $i -lt $clips.Count; $i++) {
    $lbl = if ($i -eq $clips.Count - 1) { '[vc]' } else { "[x${i}]" }
    $vparts += "${prev}[${i}:v]xfade=transition=fade:duration=${Xfade}:offset=$($offsets[$i - 1])${lbl}"
    $prev = $lbl
  }
  $vchain = ($vparts -join ';') + ';[vc]format=yuv420p[vout]'
  Write-Host ("xfade offsets: " + ($offsets -join ', ')) -ForegroundColor Cyan
}
else {
  $n = $clips.Count
  $vchain = (@(0..($n - 1) | ForEach-Object { "[${_}:v]" }) -join '') +
            "concat=n=${n}:v=1:a=0[vc];[vc]format=yuv420p[vout]"
  Write-Host 'hard cuts (concat)' -ForegroundColor Cyan
}

# ---------- audio chain ---------------------------------------------------
$useMusic = (-not $NoAudio) -and (Test-Path $music)
$aparts = @()
if ($useMusic) {
  $argsList += @('-i', $music)
  $mi = $clips.Count
  Write-Host "audio: $music" -ForegroundColor Cyan
  $fo = [math]::Round($Duration - 0.8, 2)
  # Kept on one line deliberately: wrapping a filter string with a trailing '+'
  # inside an array literal makes PowerShell emit TWO elements, which the join
  # then splices together with ';' and produces an empty filter name.
  $aparts += "[${mi}:a]afade=t=in:st=0:d=0.5,afade=t=out:st=${fo}:d=0.8,loudnorm=I=-16:TP=-1.5:LRA=9,atrim=0:${Duration},asetpts=N/SR/TB[aout]"
}
elseif (-not $NoAudio) {
  # Synthesised projector-room bed. Indices follow the clip inputs.
  $h1 = $clips.Count; $h2 = $h1 + 1; $nz = $h1 + 2; $th = $h1 + 3; $ch = $h1 + 4
  $argsList += @(
    '-f', 'lavfi', '-i', "sine=frequency=55:duration=${Duration}:sample_rate=48000",
    '-f', 'lavfi', '-i', "sine=frequency=82.41:duration=${Duration}:sample_rate=48000",
    '-f', 'lavfi', '-i', "anoisesrc=color=brown:duration=${Duration}:sample_rate=48000:amplitude=0.4",
    '-f', 'lavfi', '-i', 'sine=frequency=90:duration=0.40:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1.40:sample_rate=48000'
  )
  Write-Host 'audio: synthesised projector bed' -ForegroundColor Cyan

  # Beat pulses land on the three cuts plus the open, i.e. the same offsets the
  # video transitions use; the chime sits just after the final cut.
  $beats = @(0) + ($offsets | ForEach-Object { [int]([math]::Round($_ * 1000)) })
  $b1 = $beats[0]
  $b2 = if ($beats.Count -gt 1) { $beats[1] } else { 2375 }
  $b3 = if ($beats.Count -gt 2) { $beats[2] } else { 4750 }
  $b4 = if ($beats.Count -gt 3) { $beats[3] } else { 7125 }
  $fo = [math]::Round($Duration - 0.8, 2)

  $aparts += @(
    "[${h1}:a]volume=0.34,tremolo=f=3.1:d=0.45[hum1]",
    "[${h2}:a]volume=0.20,tremolo=f=2.3:d=0.50[hum2]",
    "[${nz}:a]highpass=f=140,lowpass=f=5200,volume=0.055,tremolo=f=11:d=0.85[clat]",
    "[${th}:a]afade=t=out:st=0.03:d=0.37,volume=0.42,asplit=4[k1][k2][k3][k4]",
    "[k1]adelay=${b1}|${b1}[a1]",
    "[k2]adelay=${b2}|${b2}[a2]",
    "[k3]adelay=${b3}|${b3}[a3]",
    "[k4]adelay=${b4}|${b4}[a4]",
    "[${ch}:a]afade=t=in:st=0:d=0.15,afade=t=out:st=0.5:d=0.9,tremolo=f=6:d=0.3,volume=0.22,adelay=$($b4 + 125)|$($b4 + 125)[chd]",
    '[hum1][hum2][clat][a1][a2][a3][a4][chd]amix=inputs=8:normalize=0:duration=longest[bed]',
    '[bed]aecho=0.8:0.75:45:0.28,alimiter=limit=0.95[room]',
    "[room]afade=t=in:st=0:d=0.7,afade=t=out:st=${fo}:d=0.8,loudnorm=I=-16:TP=-1.5:LRA=9,atrim=0:${Duration},asetpts=N/SR/TB[aout]"
  )
}

# ---------- encode --------------------------------------------------------
$fc = $vchain
if ($aparts.Count -gt 0) { $fc += ';' + ($aparts -join ';') }

$enc = @('-map', '[vout]')
if ($aparts.Count -gt 0) { $enc += @('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2') }
else { $enc += '-an' }

$crf = if ($LowQuality) { '28' } else { '18' }
$preset = if ($LowQuality) { 'veryfast' } else { 'slow' }
$enc += @('-c:v', 'libx264', '-preset', $preset, '-crf', $crf, '-pix_fmt', 'yuv420p',
          '-r', '24', '-movflags', '+faststart', '-t', "$Duration", '-y', $out)

Write-Host '--- encoding ---' -ForegroundColor Cyan
if ($ShowGraph) {
  Write-Host '--- filter_complex ---'
  Write-Host $fc
  Write-Host '--- argv ---'
  Write-Host (($argsList + @('-filter_complex') + @($fc) + $enc) -join ' ')
  return
}

# ffmpeg reports progress on stderr, and $ErrorActionPreference='Stop' turns the
# first stderr line into a terminating error -- which hid ffmpeg's real message
# entirely on the first run. So run it with Continue and check the code by hand.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $ffmpeg -hide_banner -loglevel error @($argsList + @('-filter_complex') + @($fc) + $enc) 2>&1 |
  ForEach-Object { Write-Host "  $_" }
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($code -ne 0) { throw "ffmpeg failed with exit code $code" }

# ---------- verify --------------------------------------------------------
$ErrorActionPreference = 'Continue'
$v = & $ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -show_entries format=duration -of default=nw=1 $out 2>&1
$hasA = & $ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 $out 2>&1
$ErrorActionPreference = $prevEap
Write-Host '--- ffprobe ---' -ForegroundColor Cyan
$v | ForEach-Object { Write-Host "  $_" }
Write-Host ("  audio stream: " + $(if ($hasA) { $hasA } else { 'NONE' }))
Write-Host ("WROTE " + $out) -ForegroundColor Green