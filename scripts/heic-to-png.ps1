<#
  HEIC -> PNG via Windows Imaging Component.

  Exists because libheif inside the prebuilt sharp cannot decode the 2026
  delivery's iPhone HEICs: every one fails with "bad seek to <filesize+32>",
  and the downloads are byte-exact against Drive's Content-Length, so the
  files are intact and the decoder is at fault. WIC reads them natively on
  Windows 11 (HEIF Image Extensions ship with the OS).

  WIC also applies HEIF's `irot` transform, which libheif's metadata does not
  report — so the PNG comes out at true display orientation with the rotation
  baked into pixels. That matters because images.mjs relies on EXIF
  orientation, and a PNG carries none.

  PNG because it is lossless: the single lossy step stays in images.mjs.

  Usage:  powershell -File scripts/heic-to-png.ps1 -In <src> -Out <dst.png>
#>
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore

$fs = [IO.File]::OpenRead($In)
try {
  $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create(
    $fs, 'None', 'OnLoad'
  )
  $frame = $decoder.Frames[0]
  $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($frame))
  $os = [IO.File]::Create($Out)
  try { $encoder.Save($os) } finally { $os.Close() }
  "$($frame.PixelWidth)x$($frame.PixelHeight)"
} finally {
  $fs.Close()
}
