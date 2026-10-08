"""Generate synthetic worksheet photos (PIL) + ground truth for the OCR accuracy test.
   Run: python3 tests/make_fixtures.py  -> tests/fixtures/*.png + truth.json"""
import json, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).parent / 'fixtures'; OUT.mkdir(exist_ok=True)
F = '/usr/share/fonts/truetype/dejavu/'
def font(bold=False, size=34): return ImageFont.truetype(F + ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'), size)
random.seed(7)

def photo(img, angle):
    """paper-ish: light noise, slight rotation, a soft shadow gradient, mild blur"""
    w, h = img.size
    img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=(205, 200, 190))
    px = img.load(); W, H = img.size
    for y in range(0, H, 2):
        shade = int(18 * y / H)
        for x in range(0, W, 2):
            r, g, b = px[x, y]; n = random.randint(-6, 6) - shade
            px[x, y] = (max(0, r + n), max(0, g + n), max(0, b + n))
    return img.filter(ImageFilter.GaussianBlur(0.6))

def table(rows, title, cols, path, angle):
    W, rh = 1400, 64; H = 200 + rh * (len(rows) + 1)
    im = Image.new('RGB', (W, H), (250, 248, 240)); d = ImageDraw.Draw(im)
    d.text((70, 50), title, font=font(True, 44), fill=(20, 20, 30))
    y = 140; d.line((60, y, W - 60, y), fill=(60, 60, 60), width=3)
    d.text((80, y + 14), cols[0], font=font(True), fill=(30, 30, 30)); d.text((720, y + 14), cols[1], font=font(True), fill=(30, 30, 30))
    for a, b in rows:
        y += rh; d.line((60, y, W - 60, y), fill=(150, 150, 150), width=2)
        d.text((80, y + 14), a, font=font(), fill=(15, 15, 25)); d.text((720, y + 14), b, font=font(), fill=(15, 15, 25))
    d.line((700, 140, 700, y + rh), fill=(150, 150, 150), width=2)
    photo(im, angle).save(path)

def wordlist(rows, title, path, angle):
    W, rh = 1240, 62; H = 190 + rh * len(rows)
    im = Image.new('RGB', (W, H), (252, 251, 246)); d = ImageDraw.Draw(im)
    d.text((70, 50), title, font=font(True, 42), fill=(10, 10, 60))
    y = 130
    for a, b in rows:
        d.text((80, y), f'{a} – {b}', font=font(size=36), fill=(10, 10, 60)); y += rh
    photo(im, angle).save(path)

def sheet(qa, title, path, angle):
    W = 1400; H = 190 + 110 * len(qa)
    im = Image.new('RGB', (W, H), (250, 250, 250)); d = ImageDraw.Draw(im)
    d.text((70, 50), title, font=font(True, 44), fill=(0, 60, 40))
    y = 140
    for q, a in qa:
        d.text((80, y), q, font=font(True, 32), fill=(20, 20, 20)); d.text((110, y + 44), a, font=font(size=32), fill=(40, 40, 40)); y += 110
    photo(im, angle).save(path)

vocab = [('the teacher', 'die Lehrerin'), ('the pupil', 'der Schüler'), ('to explain', 'erklären'), ('difficult', 'schwierig'),
         ('the timetable', 'der Stundenplan'), ('to be late', 'zu spät kommen'), ('the break', 'die Pause'), ('the homework', 'die Hausaufgaben'),
         ('the playground', 'der Schulhof'), ('to forget', 'vergessen')]
words = [('la pomme', 'der Apfel'), ('le fromage', 'der Käse'), ('la boulangerie', 'die Bäckerei'), ('les légumes', 'das Gemüse'),
         ('le petit-déjeuner', 'das Frühstück'), ('la clé', 'der Schlüssel'), ('très', 'sehr'), ('acheter', 'kaufen'), ('la fête', 'das Fest'), ('le garçon', 'der Junge')]
bio = [('Was ist die kleinste Einheit des Lebens?', 'die Zelle'), ('Was erzeugt in der Zelle Energie (ATP)?', 'die Mitochondrien'),
       ('Wo liegt die Erbinformation (DNA)?', 'im Zellkern'), ('Was gibt der Pflanzenzelle Stabilität?', 'die Zellwand'),
       ('Wo findet die Fotosynthese statt?', 'in den Chloroplasten'), ('Was umgibt jede Zelle?', 'die Zellmembran')]
table(vocab, 'Unit 3 – At school', ('English', 'Deutsch'), OUT / 'vocab-table.png', 1.2)
wordlist(words, 'Vocabulaire – Unité 2', OUT / 'wordlist-fr-de.png', -0.8)
sheet(bio, 'Biologie: Die Zelle', OUT / 'biology-sheet.png', 0.6)
json.dump({'vocab-table.png': {'lang': 'en', 'native': 'de', 'pairs': vocab},
           'wordlist-fr-de.png': {'lang': 'fr', 'native': 'de', 'pairs': words},
           'biology-sheet.png': {'lang': None, 'native': 'de', 'pairs': bio}},
          open(OUT / 'truth.json', 'w'), ensure_ascii=False, indent=1)
print('ok', sorted(p.name for p in OUT.iterdir()))
