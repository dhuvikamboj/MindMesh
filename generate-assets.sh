#!/bin/bash
set -e

SRC="/Users/davindersingh/projects/MindMesh/image.png"
ASSETS="/Users/davindersingh/projects/MindMesh/assets/images"

echo "Source: $SRC (1024x1024 RGBA)"

# ── icon.png — white background, 1024x1024 ────────────────────────────────────
echo "Generating icon.png..."
python3 - <<'PYEOF'
from PIL import Image
import os

src = "/Users/davindersingh/projects/MindMesh/image.png"
out_dir = "/Users/davindersingh/projects/MindMesh/assets/images"

img = Image.open(src).convert("RGBA")

# Flatten onto white background
def on_white(img, size=1024):
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    resized = img.resize((size, size), Image.LANCZOS)
    bg.paste(resized, (0, 0), resized)
    return bg.convert("RGB")

# icon.png — white bg
on_white(img).save(os.path.join(out_dir, "icon.png"))
print("  icon.png done")

# splash-icon.png — logo centered on white, 1024x1024, logo takes ~60% width
def centered_on_white(img, canvas=1024, logo_ratio=0.6):
    bg = Image.new("RGBA", (canvas, canvas), (255, 255, 255, 255))
    logo_size = int(canvas * logo_ratio)
    resized = img.resize((logo_size, logo_size), Image.LANCZOS)
    offset = (canvas - logo_size) // 2
    bg.paste(resized, (offset, offset), resized)
    return bg.convert("RGB")

centered_on_white(img).save(os.path.join(out_dir, "splash-icon.png"))
print("  splash-icon.png done")

# favicon.png — white bg, 64x64
on_white(img, 64).save(os.path.join(out_dir, "favicon.png"))
print("  favicon.png done")

# android-icon-foreground.png — transparent bg, logo centered at 72% of canvas
def transparent_centered(img, canvas=1024, logo_ratio=0.72):
    bg = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    logo_size = int(canvas * logo_ratio)
    resized = img.resize((logo_size, logo_size), Image.LANCZOS)
    offset = (canvas - logo_size) // 2
    bg.paste(resized, (offset, offset), resized)
    return bg

transparent_centered(img).save(os.path.join(out_dir, "android-icon-foreground.png"))
print("  android-icon-foreground.png done")

# android-icon-background.png — solid white
bg_only = Image.new("RGB", (1024, 1024), (255, 255, 255))
bg_only.save(os.path.join(out_dir, "android-icon-background.png"))
print("  android-icon-background.png done")

# android-icon-monochrome.png — white logo on black bg
def monochrome(img, canvas=1024, logo_ratio=0.72):
    bg = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 255))
    logo_size = int(canvas * logo_ratio)
    resized = img.resize((logo_size, logo_size), Image.LANCZOS).convert("RGBA")
    # Make non-transparent pixels white
    r, g, b, a = resized.split()
    white_logo = Image.new("RGBA", resized.size, (255, 255, 255, 255))
    white_logo.putalpha(a)
    offset = (canvas - logo_size) // 2
    bg.paste(white_logo, (offset, offset), white_logo)
    return bg.convert("RGB")

monochrome(img).save(os.path.join(out_dir, "android-icon-monochrome.png"))
print("  android-icon-monochrome.png done")

print("\nAll assets generated.")
PYEOF
