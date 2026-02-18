# Icon Generator Script
# This PowerShell script generates book binder themed icons for the bAInder extension

Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$iconDir = "$PSScriptRoot\icons"

# Create icons directory if it doesn't exist
if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Path $iconDir | Out-Null
}

foreach ($size in $sizes) {
    # Create a bitmap with anti-aliasing
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Fill background with gradient (book cover colors)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        [System.Drawing.Point]::new(0, 0),
        [System.Drawing.Point]::new($size, $size),
        [System.Drawing.Color]::FromArgb(139, 69, 19),   # Saddle Brown
        [System.Drawing.Color]::FromArgb(101, 67, 33)    # Dark Brown
    )
    $graphics.FillRectangle($brush, 0, 0, $size, $size)
    
    # Calculate proportions
    $margin = [Math]::Max(2, $size * 0.1)
    $binderWidth = $size * 0.2
    $pageWidth = $size - ($margin * 2) - $binderWidth
    $bookHeight = $size - ($margin * 2)
    
    # Draw binder spine (left side)
    $binderBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 82, 45)) # Sienna
    $binderRect = [System.Drawing.Rectangle]::new($margin, $margin, $binderWidth, $bookHeight)
    $graphics.FillRectangle($binderBrush, $binderRect)
    
    # Draw binder rings/holes
    $ringColor = [System.Drawing.Color]::FromArgb(70, 70, 70)
    $ringBrush = New-Object System.Drawing.SolidBrush($ringColor)
    $ringSize = [Math]::Max(2, $size * 0.08)
    $ringX = $margin + ($binderWidth / 2) - ($ringSize / 2)
    
    # Top ring
    $ringY1 = $margin + ($bookHeight * 0.25) - ($ringSize / 2)
    $graphics.FillEllipse($ringBrush, $ringX, $ringY1, $ringSize, $ringSize)
    
    # Middle ring (for larger icons)
    if ($size -ge 32) {
        $ringY2 = $margin + ($bookHeight * 0.5) - ($ringSize / 2)
        $graphics.FillEllipse($ringBrush, $ringX, $ringY2, $ringSize, $ringSize)
    }
    
    # Bottom ring
    $ringY3 = $margin + ($bookHeight * 0.75) - ($ringSize / 2)
    $graphics.FillEllipse($ringBrush, $ringX, $ringY3, $ringSize, $ringSize)
    
    # Draw pages (white/cream area)
    $pagesBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 253, 245)) # Ivory
    $pagesRect = [System.Drawing.Rectangle]::new($margin + $binderWidth, $margin, $pageWidth, $bookHeight)
    $graphics.FillRectangle($pagesBrush, $pagesRect)
    
    # Add page lines for detail (on larger icons)
    if ($size -ge 32) {
        $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 200, 200), [Math]::Max(1, $size * 0.01))
        $lineSpacing = $bookHeight / 5
        for ($i = 1; $i -le 3; $i++) {
            $lineY = $margin + ($lineSpacing * $i)
            $lineX1 = $margin + $binderWidth + ($pageWidth * 0.1)
            $lineX2 = $margin + $binderWidth + ($pageWidth * 0.9)
            $graphics.DrawLine($linePen, $lineX1, $lineY, $lineX2, $lineY)
        }
        $linePen.Dispose()
    }
    
    # Add border/outline
    $outlinePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 40, 20), [Math]::Max(1, $size * 0.02))
    $graphics.DrawRectangle($outlinePen, 0, 0, $size - 1, $size - 1)
    
    # Save the icon
    $filePath = Join-Path $iconDir "icon$size.png"
    $bitmap.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Cleanup
    $graphics.Dispose()
    $bitmap.Dispose()
    $brush.Dispose()
    $binderBrush.Dispose()
    $ringBrush.Dispose()
    $pagesBrush.Dispose()
    $outlinePen.Dispose()
    
    Write-Host "Created: icon$size.png (book binder design)"
}

Write-Host "`nAll icons generated successfully in $iconDir"
