Add-Type -AssemblyName System.Drawing

$userUpload = "C:\Users\6025.tiso25\.gemini\antigravity\brain\0e69a9e9-9bab-4efb-ad01-0f7065f1680e\.user_uploaded\media_1793033915522_96b5d8e5.png"

# 1. Load source image and crop the squircle icon bounds
$srcImg = [System.Drawing.Bitmap]::FromFile($userUpload)
$cropRect = New-Object System.Drawing.Rectangle(70, 40, 407, 407)
$croppedBmp = New-Object System.Drawing.Bitmap(407, 407, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gCrop = [System.Drawing.Graphics]::FromImage($croppedBmp)
$gCrop.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$gCrop.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gCrop.DrawImage($srcImg, (New-Object System.Drawing.Rectangle(0, 0, 407, 407)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$gCrop.Dispose()
$srcImg.Dispose()

# 2. Master 512x512 Bitmap (centered with clean margin)
$master512 = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g512 = [System.Drawing.Graphics]::FromImage($master512)
$g512.Clear([System.Drawing.Color]::Transparent)
$g512.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g512.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g512.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g512.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

$iconSize = 472
$iconOffset = [int]((512 - $iconSize) / 2) # 20px padding
$destRect = New-Object System.Drawing.Rectangle($iconOffset, $iconOffset, $iconSize, $iconSize)
$g512.DrawImage($croppedBmp, $destRect, (New-Object System.Drawing.Rectangle(0, 0, 407, 407)), [System.Drawing.GraphicsUnit]::Pixel)
$g512.Dispose()

# 3. Helper to resize
function Resize-Bitmap($src, $w, $h) {
    $dest = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)))
    $g.Dispose()
    return $dest
}

# 4. Helper to build multi-resolution Windows ICO
function Create-MultiResIco($master, $sizes, $outPath) {
    $pngStreams = @()
    foreach ($s in $sizes) {
        $resized = Resize-Bitmap $master $s $s
        $ms = New-Object System.IO.MemoryStream
        $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngStreams += ,@($s, $ms.ToArray())
        $ms.Dispose()
        $resized.Dispose()
    }

    $fs = [System.IO.File]::Create($outPath)
    $bw = New-Object System.IO.BinaryWriter($fs)

    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$pngStreams.Count)

    $offset = 6 + ($pngStreams.Count * 16)

    foreach ($entry in $pngStreams) {
        $size = $entry[0]
        $bytes = $entry[1]
        $wByte = if ($size -ge 256) { [byte]0 } else { [byte]$size }
        $hByte = if ($size -ge 256) { [byte]0 } else { [byte]$size }

        $bw.Write([byte]$wByte)
        $bw.Write([byte]$hByte)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$bytes.Length)
        $bw.Write([uint32]$offset)

        $offset += $bytes.Length
    }

    foreach ($entry in $pngStreams) {
        $bytes = $entry[1]
        $bw.Write($bytes)
    }

    $bw.Flush()
    $bw.Dispose()
    $fs.Dispose()
    Write-Output ("Created ICO: " + $outPath)
}

# 5. Generate Master PNGs
$master512.Save("EasyDesk-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$master512.Save("build\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$master512.Save("assets\branding\EasyDesk-app-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$master512.Save("Interface\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved 512x512 Master PNGs."

# 6. Generate Favicons (PNG)
$fav128 = Resize-Bitmap $master512 128 128
$fav128.Save("site\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$fav128.Save("Interface\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$fav128.Dispose()
Write-Output "Saved favicons (PNG)."

# 7. Generate Multi-Res ICOs
$icoSizes = @(256, 128, 64, 48, 32, 24, 16)
Create-MultiResIco $master512 $icoSizes "assets\branding\easydesk.ico"
Create-MultiResIco $master512 $icoSizes "build\icon.ico"
Create-MultiResIco $master512 $icoSizes "build\installerIcon.ico"
Create-MultiResIco $master512 $icoSizes "build\uninstallerIcon.ico"
Create-MultiResIco $master512 @(64, 48, 32, 16) "site\favicon.ico"
Create-MultiResIco $master512 @(64, 48, 32, 16) "Interface\favicon.ico"

# 8. Generate NSIS Installer Header BMP (150x57, 24-bit RGB)
$headerBmp = New-Object System.Drawing.Bitmap(150, 57, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$gH = [System.Drawing.Graphics]::FromImage($headerBmp)
$gH.Clear([System.Drawing.Color]::FromArgb(255, 255, 255)) # Clean white background matching NSIS header
$gH.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gH.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# Draw the new icon on the right side of the header (48x48)
$iconHeader = Resize-Bitmap $master512 48 48
$gH.DrawImage($iconHeader, 96, 4, 48, 48)
$iconHeader.Dispose()
$gH.Dispose()
$headerBmp.Save("assets\branding\installer-header.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
$headerBmp.Dispose()
Write-Output "Generated assets\branding\installer-header.bmp"

# 9. Generate NSIS Installer Sidebar BMP (164x314, 24-bit RGB)
$sidebarBmp = New-Object System.Drawing.Bitmap(164, 314, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$gS = [System.Drawing.Graphics]::FromImage($sidebarBmp)
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, 314)),
    [System.Drawing.Color]::FromArgb(15, 23, 42), # Deep slate #0F172A
    [System.Drawing.Color]::FromArgb(30, 27, 75)  # Rich indigo #1E1B4B
)
$gS.FillRectangle($gradBrush, 0, 0, 164, 314)
$gradBrush.Dispose()

$gS.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gS.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# Prominent icon centered near the top (100x100)
$iconSidebar = Resize-Bitmap $master512 100 100
$gS.DrawImage($iconSidebar, 32, 40, 100, 100)
$iconSidebar.Dispose()

# Subtle telemetry wave accent line at the bottom
$cyanPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), 2)
$gS.DrawLine($cyanPen, 20, 250, 50, 250)
$gS.DrawLine($cyanPen, 50, 250, 65, 230)
$gS.DrawLine($cyanPen, 65, 230, 80, 270)
$gS.DrawLine($cyanPen, 80, 270, 95, 240)
$gS.DrawLine($cyanPen, 95, 240, 110, 250)
$gS.DrawLine($cyanPen, 110, 250, 144, 250)
$cyanPen.Dispose()

# Subtitle text
$font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(148, 163, 184))
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$gS.DrawString("EasyDesk", (New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)), 82, 155, $sf)
$gS.DrawString("HARDWARE MONITOR", $font, $brush, 82, 182, $sf)
$font.Dispose()
$brush.Dispose()
$sf.Dispose()
$gS.Dispose()

$sidebarBmp.Save("assets\branding\installer-sidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)
$sidebarBmp.Dispose()
Write-Output "Generated assets\branding\installer-sidebar.bmp"

$master512.Dispose()
$croppedBmp.Dispose()

# Remove test file if exists
if (Test-Path "assets\branding\test_generated.ico") {
    Remove-Item "assets\branding\test_generated.ico"
}

Write-Output "ALL ICONS AND INSTALLER ASSETS GENERATED SUCCESSFULLY!"
