#!/usr/bin/env python3
"""
Generiert professionelle PNG-Icons für die PWA
"""
from PIL import Image, ImageDraw, ImageFont

def create_icon(size, output_path):
    """Erstellt ein Icon mit dem Adressbuch-Symbol"""
    # Hintergrundfarbe: Primärfarbe #2196F3 (blau)
    bg_color = (33, 150, 243)
    text_color = (255, 255, 255)

    # Bild erstellen
    img = Image.new('RGB', (size, size), bg_color)
    draw = ImageDraw.Draw(img)

    # Adressbuch-Symbol zeichnen (📒 stilisiert)
    # Äußeres Rechteck (Buch)
    margin = size // 8
    book_left = margin
    book_top = margin
    book_right = size - margin
    book_bottom = size - margin

    # Buch-Umriss
    draw.rounded_rectangle(
        [book_left, book_top, book_right, book_bottom],
        radius=size // 20,
        fill=text_color,
        outline=None
    )

    # Innerer Bereich (etwas dunkler)
    inner_margin = margin + size // 20
    draw.rounded_rectangle(
        [inner_margin, inner_margin, size - inner_margin, size - inner_margin],
        radius=size // 25,
        fill=bg_color,
        outline=None
    )

    # "A" für Adressbuch
    # Versuche eine systemweite Font zu verwenden, sonst default
    try:
        # Verschiedene mögliche Font-Pfade für Linux
        font_paths = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
            '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
        ]
        font = None
        for font_path in font_paths:
            try:
                font = ImageFont.truetype(font_path, size // 2)
                break
            except:
                continue

        if font is None:
            raise Exception("Kein TrueType Font gefunden")

    except:
        # Fallback auf default font
        font = ImageFont.load_default()

    # Text zentriert zeichnen
    text = "A"

    # Text-Position berechnen (zentriert)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    text_x = (size - text_width) // 2
    text_y = (size - text_height) // 2 - size // 20  # Leicht nach oben verschoben

    draw.text((text_x, text_y), text, fill=text_color, font=font)

    # Speichern
    img.save(output_path, 'PNG', optimize=True)
    print(f"✓ {output_path} erstellt ({size}x{size})")

if __name__ == '__main__':
    # Generiere beide Icon-Größen
    create_icon(192, 'icon-192.png')
    create_icon(512, 'icon-512.png')
    print("\n✓ Alle Icons erfolgreich generiert!")
