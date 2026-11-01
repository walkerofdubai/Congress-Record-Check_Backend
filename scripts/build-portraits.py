# Builds public/portraits/<id>.webp: transparent head-and-shoulders cut-outs for the home cards, and
# public/portraits/index.json listing who has one and where each photo came from.
#
# Photos: official congressional portraits (public domain, U.S. government works) from
# https://github.com/unitedstates/images, for everyone in research.json with a Bioguide ID and every other sitting senator
# in public/senate.json (from scripts/build-senate.mjs). Other photos, supplied
# for use here, are kept in data/portraits/ and listed in scripts/portrait-extra.json, which takes precedence:
#   {"<person id>": {"file": "data/portraits/<id>.jpg", "credit": "Photo: <who>, used with permission", "url": optional}}
# For a photo whose cut-out keeps a halo of a light background, add "tighten": true (refit the edge to the photo's own
# colors), "tighten": "left" or "right" (only that side of the photo, keeping the hair on top), and/or "choke": <px> (trim
# that many output pixels off the edge). Where the outline strays into a background of a similar color (blond hair against
# a light wall), "model": 1 uses MediaPipe's other segmentation model; where a checked shirt steps the edge, "smooth": true
# follows the outline more loosely. Where a red flag stripe is kept beside the jaw or collar, "clear": "red" drops it, and
# where a bright background shows through the hair, "clear": "light" paints it over with the hair (above the eyes only).
# For something wider than the frame on one
# side, such as a hat brim, "nudge": <px> moves the portrait sideways (positive is right) without changing its size;
# if it is wider than the whole frame, "zoom": <factor below 1> shrinks that portrait to fit.
# A supplied photo that already has a transparent background (a PNG cut-out) keeps its own outline.
# People with neither keep the initials circle.
#
# Each photo's background is removed with MediaPipe selfie segmentation, and the face is found with MediaPipe face
# detection so every portrait is framed the same way: same eye height, same distance between the eyes.
#
#   python3 -m venv .local/pv && .local/pv/bin/pip install mediapipe==0.10.14 pillow
#   .local/pv/bin/python scripts/build-portraits.py            downloads photos into .local/portraits/
#   .local/pv/bin/python scripts/build-portraits.py --refresh  downloads them again
#   .local/pv/bin/python scripts/build-portraits.py --only osborn,alme   rebuilds just those, keeping the rest
import json, os, sys, urllib.request
from datetime import date

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.local', 'portraits')
OUT = os.path.join(ROOT, 'public', 'portraits')
BASE = 'https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress'
SIZES = ('450x550', 'original')  # the full-size original often shows more of the head and shoulders
OFFICIAL = 'Official congressional portrait (public domain), via the unitedstates/images project'

# Output canvas: 3x the card's 88 x 104 px portrait box. Eyes are centered at EYE_Y, EYE_GAP px apart.
W, H, EYE_Y, EYE_GAP = 264, 312, 124, 50
# The card's circle (public/index.html .hc-pv), in output pixels: centered at 44, 66 with radius 38 in the card's units.
CX, CY, R = W / 2, 198, 114


def fetch(bioguide, size):
    folder = os.path.join(CACHE, size)
    os.makedirs(folder, exist_ok=True)
    path, url = os.path.join(folder, bioguide + '.jpg'), f'{BASE}/{size}/{bioguide}.jpg'
    if '--refresh' in sys.argv and os.path.exists(path):
        os.remove(path)
    if not os.path.exists(path):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
        except Exception:
            return None
        with open(path, 'wb') as f:
            f.write(data)
    return path, url


def eyes(rgb, detectors):
    for detector in detectors:  # the full-range model first, then the close-up one, which finds tightly framed faces
        res = detector.process(rgb)
        if res.detections:
            break
    else:
        return None
    # The largest face is the person; a smaller one can be a painting or poster behind them.
    d = max(res.detections, key=lambda d: d.location_data.relative_bounding_box.width)
    k = d.location_data.relative_keypoints  # 0 = right eye, 1 = left eye
    h, w = rgb.shape[:2]
    return (k[0].x * w, k[0].y * h), (k[1].x * w, k[1].y * h)


def extend(rgba, pad_b, pad_s, k):
    """Carry a cropped photo's clothing on past its bottom and side edges, blurred along the edge so it reads as fabric."""
    f = rgba.astype(np.float32)
    f[..., :3] *= f[..., 3:4] / 255  # premultiplied, so transparent pixels add no color
    solid = np.where(f[..., 3:4] >= 217, f, 0)  # only clothing that reaches the edge is carried on, not stray background
    h = f.shape[0]
    bottom = cv2.GaussianBlur(solid[h - 6:].mean(axis=0, keepdims=True), (2 * k + 1, 1), 0)
    # Below the photo, the carried-on clothing blends toward its average color, so stripes such as a shirt and tie fade into
    # the fabric instead of running on, and then fades out into the card's circle. It keeps the clothing's own brightness:
    # no shading toward the bottom, and no flat band of color on a tightly cropped photo.
    t = np.minimum(1, np.arange(pad_b, dtype=np.float32) / max(1, 0.9 * k))[:, None, None]
    a = bottom[..., 3:4]
    avg = bottom[..., :3].sum(axis=1, keepdims=True) / max(1e-3, a.sum()) * a  # the average color, at each column's opacity
    edge = solid[h - 3:].mean(axis=0, keepdims=True)  # the photo's own last rows, unblurred, so there is no seam
    below = np.repeat(bottom, pad_b, axis=0)
    below[..., :3] = (1 - t) * edge[..., :3] + t * avg
    # The fade starts a little above the photo's last row (only seen when the photo ends inside the frame) and ends soon
    # below it, so the clothing dissolves into the circle instead of leaving a band.
    r = min(h, max(2, int(0.6 * k)))
    f[h - r:] *= np.linspace(1, 0.55, r, dtype=np.float32)[:, None, None]
    below *= np.clip(0.55 * (1 - np.arange(pad_b, dtype=np.float32) / max(1, 1.2 * k)), 0, 1)[:, None, None]
    f = np.vstack([f, below])
    solid = np.vstack([solid, below])
    left = cv2.GaussianBlur(solid[:, :4].mean(axis=1, keepdims=True), (1, k), 0)
    right = cv2.GaussianBlur(solid[:, -4:].mean(axis=1, keepdims=True), (1, k), 0)
    f = np.hstack([np.repeat(left, pad_s, axis=1), f, np.repeat(right, pad_s, axis=1)])
    a = f[..., 3:4] / 255
    f[..., :3] = np.where(a > 1e-3, f[..., :3] / np.maximum(a, 1e-3), 0)
    return np.clip(f, 0, 255).astype(np.uint8)


def measure(path, detector):
    """Eyes, and how much of the frame the photo covers once scaled (more head room and shoulders is better)."""
    raw = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if raw is None:
        return None
    if raw.ndim == 2:
        raw = cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
    bgr, own = raw[..., :3].copy(), None
    if raw.shape[2] == 4 and (raw[..., 3] < 128).mean() > 0.05:  # already cut out: use its own transparency
        own = raw[..., 3].astype(np.float32) / 255
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    e = eyes(rgb, detector)
    if not e:
        return None
    (rx, ry), (lx, ly) = e
    gap = abs(lx - rx)
    if gap > 150:  # far more detail than the card needs; shrink first so the cut-out is quick
        f = 150 / gap
        bgr = cv2.resize(bgr, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        if own is not None:
            own = cv2.resize(own, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        (rx, ry), (lx, ly), gap = (rx * f, ry * f), (lx * f, ly * f), 150.0
        e = (rx, ry), (lx, ly)
    s = EYE_GAP / max(1.0, gap)
    cy = (ry + ly) / 2
    cover = min(cy * s, EYE_Y - 20) + min((rgb.shape[0] - cy) * s, H - EYE_Y)
    return {'bgr': bgr, 'rgb': rgb, 'own': own, 'eyes': e, 'gap': gap, 'cover': cover}


def tighten(bgr, mask, r):
    """Refit the person's outline to the photo's own colors (GrabCut), starting from the segmentation."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (4 * r + 1, 4 * r + 1))
    gc = np.where(mask > 0.5, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    gc[cv2.erode((mask > 0.9).astype(np.uint8), k) > 0] = cv2.GC_FGD
    gc[cv2.dilate((mask > 0.1).astype(np.uint8), k) == 0] = cv2.GC_BGD
    # GrabCut starts from OpenCV's shared random generator: reset it, so a portrait comes out the same whichever other
    # portraits were built before it in the run.
    cv2.setRNGSeed(0)
    cv2.grabCut(bgr, gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    return np.isin(gc, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.float32)


def defringe(rgb, alpha, sigma):
    """Edge pixels carry some of the old background's color; give them the person's own color from just inside."""
    solid = (alpha > 0.95).astype(np.float32)
    fg = np.zeros_like(rgb, dtype=np.float32)
    for sg in (sigma, sigma * 4):  # near the person first, then further out for anything left
        den = cv2.GaussianBlur(solid, (0, 0), sg)
        num = cv2.GaussianBlur(rgb.astype(np.float32) * solid[..., None], (0, 0), sg)
        est = num / np.maximum(den, 1e-6)[..., None]
        fill = (den > 0.02) & (fg.sum(axis=2) == 0)
        fg[fill] = est[fill]
    w = np.clip((0.95 - alpha) / 0.95, 0, 1)[..., None] * (fg.sum(axis=2) > 0)[..., None]
    return np.clip(rgb * (1 - w) + fg * w, 0, 255).astype(np.uint8)


def cutout(m, segmenter, opts):
    bgr, rgb = m['bgr'], m['rgb']
    if m['own'] is not None:
        alpha = m['own']
    else:
        mask = segmenter.process(rgb).segmentation_mask.astype(np.float32)
        if opts.get('tighten'):
            fit = tighten(bgr, mask, max(2, int(m['gap'] / 20)))
            # "tighten": "left" or "right" refits only that side of the photo, as seen (past one eye gap from the face's
            # center), so a bright background beside one ear is cleared without trimming the hair on top.
            side = opts['tighten'] if opts['tighten'] in ('left', 'right') else None
            if side:
                (rx, _), (lx, _) = m['eyes']
                cut = int((rx + lx) / 2 + (m['gap'] if side == 'right' else -m['gap']))
                cols = np.arange(mask.shape[1])[None, :]
                fit = np.where(cols >= cut if side == 'right' else cols < cut, fit, mask)
            mask = fit
        # Snap the soft mask to the photo's own edges (hair, collar), then firm it up. "smooth" snaps more loosely, for a
        # checked or striped shirt whose pattern would otherwise step the edge.
        mask = cv2.ximgproc.guidedFilter(guide=bgr, src=mask, radius=max(4, int(m['gap'] / 16)), eps=1e-2 if opts.get('smooth') else 1e-4)
        alpha = np.clip((mask - 0.35) / 0.3, 0, 1)
        if opts.get('clear'):
            # A red flag stripe touching the outline (under a jaw, beside a collar), or a bright background seen through
            # the hair, can be kept as part of the person. "red" drops strongly red pixels near the edge, anywhere, since
            # lips and a red tie sit well inside the outline. "light" paints near-white pixels near the edge over with
            # the hair around them (cutting them out would leave holes in the hair), only above the eyes, so earrings
            # and white collars stay.
            r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
            edge = cv2.distanceTransform((alpha > 0.5).astype(np.uint8), cv2.DIST_L2, 5) < 0.4 * m['gap']
            if opts['clear'] == 'red':
                alpha[(r > 110) & (r > 2 * g) & (r > 1.6 * b) & edge] = 0
            else:
                lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
                hit = (lo > 170) & (hi - lo < 30) & edge
                hit[int(min(m['eyes'][0][1], m['eyes'][1][1])):] = False
                hit = cv2.dilate(hit.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2)
                rgb = cv2.inpaint(np.ascontiguousarray(rgb), hit, 3, cv2.INPAINT_TELEA)
    # Keep only the person: drop loose specks of background the segmentation picked up.
    r = max(2, int(m['gap'] / 20))
    disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    core = cv2.morphologyEx((alpha > 0.5).astype(np.uint8), cv2.MORPH_OPEN, disk)  # cut thin bridges to specks
    n, lab, stats, _ = cv2.connectedComponentsWithStats(core, connectivity=8)
    if n > 1:
        body = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
        near = cv2.dilate(body, disk, iterations=2)
        # Below the chin there are only clothes, with a smooth edge: keep less around the body there, which also drops
        # thin lines of a light background traced along the shoulders.
        chin = int((m['eyes'][0][1] + m['eyes'][1][1]) / 2 + 1.3 * m['gap'])
        near[chin:] = cv2.dilate(body, np.ones((3, 3), np.uint8), iterations=2)[chin:]
        alpha *= near
    s = EYE_GAP / max(1.0, m['gap']) * opts.get('zoom', 1)
    if opts.get('choke'):
        c = max(1, round(opts['choke'] / s))
        alpha = cv2.erode(alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * c + 1, 2 * c + 1)))
    rgb = defringe(rgb, alpha, max(1.5, m['gap'] / 30))
    (rx, ry), (lx, ly) = m['eyes']
    cx, cy = (rx + lx) / 2, (ry + ly) / 2
    # A tightly cropped photo ends before the frame does: carry its clothing on to the edge. That part sits inside
    # the bottom of the card's circle, so it reads as more of the jacket rather than a cut-off line.
    pad = int(H / s)
    k = int(m['gap'] * 0.35) | 1
    rgba = extend(np.dstack([rgb, (alpha * 255).astype(np.uint8)]), pad, pad, k)
    t = np.float32([[s, 0, W / 2 + opts.get('nudge', 0) - (cx + pad) * s], [0, s, EYE_Y - cy * s]])
    out = cv2.warpAffine(rgba, t, (W, H), flags=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC,
                         borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    return Image.fromarray(trim(out), 'RGBA')


def trim(rgba):
    """The card shows the whole frame above the circle's middle, so a head can rise above the circle. Clothing that reaches
    past the circle there (high shoulders in a tightly framed photo) would show outside it: fade out anything outside the
    circle from just below the eyes, over a few pixels so hair beside the face is not cut along a hard line."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    inside = np.clip((R - np.hypot(xx - CX, yy - CY)) / 1.5 + 0.5, 0, 1)
    below = np.clip((yy - (EYE_Y + 30)) / 12, 0, 1)
    out = rgba.copy()
    out[..., 3] = (out[..., 3] * np.maximum(inside, 1 - below)).astype(np.uint8)
    return out


def visible(img):
    """The share of the cut-out that is solid: near zero when the segmentation lost the person."""
    return 0 if img is None else float((np.array(img.convert('RGBA'))[..., 3] > 200).mean())


def main():
    D = json.load(open(os.path.join(ROOT, 'public', 'research.json'), encoding='utf8'))
    extra_path = os.path.join(ROOT, 'scripts', 'portrait-extra.json')
    extra = json.load(open(extra_path, encoding='utf8')) if os.path.exists(extra_path) else {}
    os.makedirs(OUT, exist_ok=True)
    old_path = os.path.join(OUT, 'index.json')
    old = json.load(open(old_path, encoding='utf8'))['people'] if os.path.exists(old_path) else {}
    people, missing, listed = {}, [], set()
    seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0)
    seg_alt = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
    det = [mp.solutions.face_detection.FaceDetection(model_selection=m, min_detection_confidence=0.5) for m in (1, 0)]
    only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
    # Every other sitting senator (public/senate.json) gets the same official portrait, for their basic profile's card.
    senate_path = os.path.join(ROOT, 'public', 'senate.json')
    senate = json.load(open(senate_path, encoding='utf8'))['senators'] if os.path.exists(senate_path) else []
    profiled = {s['id'] for s in D['members'] + D.get('cands', []) + D.get('featured', [])}
    basic = [{'id': x['id'], 'bioguide': x['bioguide']} for x in senate if x['id'] not in profiled]
    for s in D['members'] + D.get('cands', []) + D.get('featured', []) + basic:
        if only is not None and s['id'] not in only:
            if s['id'] in old:
                people[s['id']] = old[s['id']]
                listed.add(s['id'])
            continue
        if s['id'] in extra:
            x = extra[s['id']]
            options, credit = [(os.path.join(ROOT, x['file']), x.get('url'))], x['credit']
        elif s.get('bioguide'):
            options, credit = [o for o in (fetch(s['bioguide'], z) for z in SIZES) if o], OFFICIAL
        else:
            continue
        listed.add(s['id'])
        # Of the versions of the photo, use the one that fills the frame best; on a near tie, the sharper one.
        best, measured = None, []
        for path, url in options:
            m = measure(path, det)
            if m and m['gap'] >= 36:
                measured.append((m, url))
                if not best or m['cover'] > best[0]['cover'] + 8 or (m['cover'] > best[0]['cover'] - 8 and m['gap'] > best[0]['gap']):
                    best = (m, url)
        opts = extra.get(s['id'], {})
        first, other = (seg_alt, seg) if opts.get('model') == 1 else (seg, seg_alt)
        img = cutout(best[0], first, opts) if best else None
        # Now and then the segmentation loses the person and leaves an empty cut-out: try the other segmentation model,
        # then the other versions of the photo.
        if best and visible(img) < 0.2:
            img = cutout(best[0], other, opts)
            for alt in [x for x in measured if x is not best]:
                if visible(img) >= 0.2:
                    break
                img, best = cutout(alt[0], first, opts), alt
            if visible(img) < 0.2:
                img = None
        if img is None:
            missing.append(s['id'])
            if s['id'] in old and os.path.exists(os.path.join(OUT, s['id'] + '.webp')):
                people[s['id']] = old[s['id']]  # keep the portrait already built rather than lose it
            continue
        img.save(os.path.join(OUT, s['id'] + '.webp'), 'WEBP', quality=82, method=6)
        people[s['id']] = {'file': f'portraits/{s["id"]}.webp', 'credit': credit}
        if best[1]:
            people[s['id']]['src'] = best[1]
    for f in os.listdir(OUT):  # drop portraits of people no longer listed
        if f.endswith('.webp') and f[:-5] not in listed:
            os.remove(os.path.join(OUT, f))
    index = {'about': 'Transparent portraits for the home cards. See scripts/build-portraits.py.',
             'built': date.today().isoformat(), 'people': people}
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf8') as f:
        json.dump(index, f, indent=2)
    print(f'Wrote {len(people)} portraits to public/portraits/.' + (f' No photo or no face found: {", ".join(missing)}.' if missing else ''))


if __name__ == '__main__':
    main()
