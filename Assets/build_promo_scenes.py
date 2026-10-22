"""
Deep Cut 10s promo — Blender scene builder (v5)

Scenes (69 frames each @ 1920x1080, 24fps -> 2.875s each):
  1. CRT channel-cycling room      (Assets/screens/01_crt_channels.jpg on the TV)
  2. Phone profile rack-focus      (Assets/screens/02_profile.jpg)
  3. Fund ballot + ADMIT ONE stamp (Assets/screens/03_ballot.jpg)
  4. "$1 = 1 VOTE" marquee closer  (Assets/screens/04_fund_hero.png)

Output: ./Assets/render/clip1..4.mp4, stitched by ./Assets/stitch_promo.ps1

Frame math (why 69 and not 60):
  4 clips x 69f = 276f, minus 3 xfade overlaps of 12f = 36f  ->  240f = 10.000s
  at 24fps. The stitcher must therefore cross-fade (57f/114f/171f), not hard cut;
  a hard cut of these clips would run 276f = 11.5s.

Headless (recommended -- needs no MCP addon and no saved .blend):
    blender -b -P Assets/build_promo_scenes.py
    blender -b -P Assets/build_promo_scenes.py -- --scene 3
    blender -b -P Assets/build_promo_scenes.py -- --scale 40    # fast preview
    blender -b -P Assets/build_promo_scenes.py -- --engine CYCLES --samples 64

Blender 4.5.10 API notes -- each of these cost a failed render, so they are
recorded here rather than rediscovered:
  * render.ffmpeg_format / ffmpeg_codec are 2.8-3.x names. In 4.x they moved to
    a nested struct: render.ffmpeg.format / .codec / .constant_rate_factor.
  * A texture node's `image` is NOT animatable ("not animatable" TypeError), so
    a channel change moves the lit card forward instead of swapping its texture.
  * A font curve does not lay out "\n" -- one text object per line.
  * Emission Color must be LINKED to the texture. Left as plain white the card
    emits flat white and the screenshot disappears into a blank rectangle.
  * Font objects sit on their BASELINE, so the caps grow upward from location.z.
    Values here are baselines, not centres.
  * Area lights are visible to the camera unless visible_camera = False.
"""
import bpy, os, math, sys

# Resolve the project root from this file's own location (Assets/ -> deep-cut/).
# Deliberate replacement for bpy.path.abspath("//"), which only resolved when a
# .blend had already been saved in the project root -- that made headless runs
# write to the wrong folder or fail outright.
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(DIR, "Assets")
SHOTS = os.path.join(ASSETS, "screens")
OUT = os.path.join(ASSETS, "render")
os.makedirs(OUT, exist_ok=True)

FPS = 24
FPE = 69               # frames per scene -> 2.875s (see frame math above)
SCN = FPE / FPS
RES = (1920, 1080)

# ---------- CLI -----------------------------------------------------------
# Everything after the bare "--" belongs to us, otherwise Blender eats the flags.
_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def _arg(flag, default):
    return _argv[_argv.index(flag) + 1] if flag in _argv else default


ENGINE = _arg("--engine", "EEVEE").upper()
SAMPLES = int(_arg("--samples", 64))
SCALE = int(_arg("--scale", 100))   # resolution %, e.g. 40 for a fast preview pass
_only = _arg("--scene", None)
ONLY = int(_only) if _only is not None else None


def srgb(hexstr):
    """'#ffb454' -> linear RGBA. Blender colour sockets are linear, so feeding
    sRGB bytes straight in renders noticeably darker than the brand palette."""
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


# Brand palette, mirrored from src/app/globals.css @theme
BG = srgb("#171210")
LINE = srgb("#3b2e27")
CREAM = srgb("#f3e9d7")
AMBER = srgb("#ffb454")
TICKET = srgb("#e4573d")

# Kept as aliases so the v4 helpers below stay source-compatible.
ORANGE = AMBER
DARK = BG

# globals.css declares --font-display: var(--font-bebas), "Impact", sans-serif,
# so Impact is the app's own declared fallback rather than a substitute face.
DISPLAY_TTF = r"C:\Windows\Fonts\impact.ttf"

# ---------- helpers -------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y = RES
    s.render.resolution_percentage = SCALE
    s.render.fps = FPS
    s.render.image_settings.file_format = "FFMPEG"
    # Blender 4.x moved these onto a nested `render.ffmpeg` struct; the flat
    # `render.ffmpeg_format` / `ffmpeg_codec` names from 2.8-3.x raise
    # AttributeError here (verified against 4.5.10).
    ff = s.render.ffmpeg
    ff.format = "MPEG4"
    ff.codec = "H264"
    ff.constant_rate_factor = "HIGH"
    ff.audio_codec = "NONE"   # audio is built in the ffmpeg stitch pass
    s.frame_start, s.frame_end = 1, FPE

    # Engine. EEVEE is much faster but in --background on Windows it must still
    # create a GPU context, which is not guaranteed on a headless/remote session.
    # CYCLES on CPU always works -- just slower (minutes, not seconds).
    if ENGINE == "CYCLES":
        s.render.engine = "CYCLES"
        s.cycles.device = "CPU"
        s.cycles.samples = SAMPLES
        s.cycles.use_denoising = True
    else:
        try:
            s.render.engine = "BLENDER_EEVEE_NEXT"   # 4.2+ identifier
        except TypeError:
            s.render.engine = "BLENDER_EEVEE"        # 4.0/4.1 identifier
        # In EEVEE, samples drive anti-aliasing and soft-shadow quality rather
        # than noise. The 64 default is far more than this footage needs and
        # costs roughly 3x the render time.
        try:
            s.eevee.taa_render_samples = max(8, min(SAMPLES, 64))
        except AttributeError:
            pass

    # AgX (the 4.x default) desaturates bright poster colours; Standard keeps the
    # amber/cream tickets looking like the app instead of washed out.
    try:
        s.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    s.view_settings.look = "None"

    w = bpy.data.worlds.new("W")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = BG
    s.world = w
    return s

def mat(name, color, emit=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emit
    return m

def box(name, loc, size, material):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    o.data.materials.append(material)
    return o

def plane(name, loc, rot, size, material):
    bpy.ops.mesh.primitive_plane_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, 1)
    o.data.materials.append(material)
    return o

def tex_mat(img_path, name, emit=2.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(img_path)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    # v4 set Emission Color to pure white, which made every screenshot card emit
    # a flat white glow and erased the UI entirely (verified in a render: the
    # screen came out as a blank white rectangle). The texture has to drive
    # Emission Color as well, and the strength has to stay near 1.0 or the bright
    # app text clips.
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = emit
    bsdf.inputs["Roughness"].default_value = 0.4
    return m

def camera(name, loc, rot):
    bpy.ops.object.camera_add(location=loc, rotation=rot)
    c = bpy.context.object
    c.name = name
    bpy.context.scene.camera = c
    return c

def key_light(loc, energy, color=(1, 0.9, 0.8, 1)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.object
    l.data.energy = energy
    l.data.color = color[:3]
    l.data.size = 4
    # Otherwise the camera sees the light plane itself as a bright rectangle on
    # the wall, which showed up in the first render.
    l.visible_camera = False
    return l

def txt(name, body, loc, rot, size, color, extrude=0.02):
    c = bpy.data.curves.new(name, type="FONT")
    c.body = body
    c.size = size
    c.extrude = extrude
    c.align_x = "CENTER"
    # Impact is the app's own declared display fallback (see DISPLAY_TTF note).
    if os.path.exists(DISPLAY_TTF):
        c.font = bpy.data.fonts.load(DISPLAY_TTF)
    o = bpy.data.objects.new(name, c)
    o.location = loc
    o.rotation_euler = rot
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat(name + "_m", color, emit=2.5, rough=0.3))
    return o

def render_to(path):
    s = bpy.context.scene
    s.render.filepath = path
    bpy.ops.render.render(animation=True)
    print("RENDERED:", path)

# ---------- animation / staging helpers (v5) ------------------------------

def kf(obj, data_path, frame, value, index=-1):
    """Set a value and key it. index>=0 targets one component (e.g. rotation x)."""
    if index >= 0:
        getattr(obj, data_path)[index] = value
    else:
        setattr(obj, data_path, value)
    obj.keyframe_insert(data_path=data_path, frame=frame, index=index)


def shot(name):
    """Resolve Assets/screens/<name>.<ext>, or None if the shot is missing."""
    for ext in (".png", ".jpg", ".jpeg", ".PNG", ".JPG"):
        p = os.path.join(SHOTS, name + ext)
        if os.path.exists(p):
            return p
    print("WARN: no screenshot for", name)
    return None


def aspect(img_path):
    """Real pixel aspect of a screenshot, so UI text is never stretched."""
    img = bpy.data.images.load(img_path)
    w, h = img.size
    bpy.data.images.remove(img)
    return (w / float(h)) if h else 1.0


def shot_plane(name, img_path, loc, rot, height, emit=2.0):
    """A lit portrait card carrying a real app screenshot. Width is derived from
    the image's own aspect -- hardcoding a width would distort the UI lettering."""
    return plane(name, loc, rot, (height * aspect(img_path), height),
                 tex_mat(img_path, name + "_m", emit=emit))


def slab(name, loc, size, material, bevel=0.04):
    """Bevelled box, for TV cabinets and phone bodies."""
    o = box(name, loc, size, material)
    b = o.modifiers.new("bev", "BEVEL")
    b.width = bevel
    b.segments = 3
    return o


def emit_socket(obj):
    """The Emission Strength socket of an object's first material."""
    return obj.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]


def key_socket(sock, keys):
    """Key a node socket. Callers emit a hold-key one frame before each change,
    which produces a hard cut without relying on CONSTANT interpolation (whose
    API moved around across Blender 4.x releases)."""
    for f, v in keys:
        sock.default_value = v
        sock.keyframe_insert("default_value", frame=f)


def chan_keys(n_cards, switches, front=0.80, back=1.00, emits=(1.30, 1.15, 1.25)):
    """Stacked-card visibility keys, returning (y_lists, emission_lists).

    Blender refuses to keyframe a texture node's image -- verified on 4.5.10 it
    raises 'property "image" not animatable' -- so a channel cut is done by
    lighting one card and moving it to the front of the stack. The ACTIVE card
    must always be closest to the camera or the dim cards occlude it; that bug
    is what put bright slivers over the screen in the first render.
    """
    ys = [[] for _ in range(n_cards)]
    em = [[] for _ in range(n_cards)]

    def snap(f, active):
        for i in range(n_cards):
            ys[i].append((f, front if i == active else back))
            em[i].append((f, emits[i] if i == active else 0.0))

    snap(1, 0)
    for f in sorted(switches):
        for i in range(n_cards):                    # hold the previous value
            ys[i].append((f - 1, ys[i][-1][1]))
            em[i].append((f - 1, em[i][-1][1]))
        snap(f, switches[f])
    for i in range(n_cards):                        # hold to the end
        ys[i].append((FPE, ys[i][-1][1]))
        em[i].append((FPE, em[i][-1][1]))
    return ys, em


# ---------- scene 1: CRT channel-cycling room -----------------------------

def scene1_crt():
    reset_scene()
    plane("floor", (0, 0, 0), (0, 0, 0), (30, 30), mat("s1_floor", srgb("#12100e"), rough=0.95))
    plane("wall", (0, 1.7, 0), (math.radians(90), 0, 0), (30, 16),
          mat("s1_wall", srgb("#1b1512"), rough=1.0))

    # CRT cabinet, face pointing -Y so the camera sits on the -Y side. Depth
    # order is explicit and never crossed: body front face y=1.10, glass y=1.05,
    # inactive card y=1.00, active card y=0.80 (closest to the camera).
    slab("tv_body", (0, 1.55, 1.45), (2.9, 0.9, 2.6), mat("s1_tv", srgb("#2e221b"), rough=0.55),
         bevel=0.03)
    plane("glass", (0, 1.05, 1.45), (math.radians(90), 0, 0), (2.55, 2.4),
          mat("s1_glass", srgb("#0b0908"), emit=0.05, rough=0.2))

    # Three "channels". A phone app on a landscape CRT pillarboxes, so the tube
    # surround stays almost unlit -- bright glass just read as an empty screen.
    chans = ["01_crt_channels", "03_ballot", "04_fund_hero"]
    cards = []
    for i, nm in enumerate(chans):
        p = shot(nm)
        if p:
            cards.append(shot_plane("chan%d" % i, p, (0, 0.80, 1.45),
                                    (math.radians(90), 0, 0), height=2.15, emit=1.25))

    # Hard channel cuts at f25 and f47.
    if cards:
        ys, ems = chan_keys(len(cards), {25: 1, 47: 2})
        for i, c in enumerate(cards):
            for f, y in ys[i]:
                kf(c, "location", f, (0.0, y, 1.45))
            key_socket(emit_socket(c), ems[i])

    # Projector-warm key light with a breath of flicker. Energies are high
    # because an area light falls off with distance: 260W at ~6m left the whole
    # room almost black.
    lamp = key_light((0, -3.2, 4.4), 1500, color=AMBER[:3])
    for f, e in [(1, 1500), (12, 1290), (23, 1640), (34, 1350), (45, 1550),
                 (58, 1320), (FPE, 1470)]:
        kf(lamp.data, "energy", f, e)
    key_light((4.5, 3.0, 2.2), 420, color=(0.5, 0.7, 1.0))    # cool rim
    key_light((0, -6.5, 2.4), 380, color=(0.9, 0.95, 1.0))    # camera-side fill

    # Straight-on dolly with a small lateral drift. v4 also yawed 7 degrees,
    # which swung the cabinet off-centre and cropped it off the right edge.
    cam = camera("cam1", (0, -8.6, 1.55), (math.radians(90), 0, math.radians(1.6)))
    cam.data.lens = 50
    kf(cam, "location", 1, (-0.35, -8.6, 1.52))
    kf(cam, "location", FPE, (0.25, -7.4, 1.45))
    kf(cam, "rotation_euler", 1, math.radians(1.6), index=2)
    kf(cam, "rotation_euler", FPE, math.radians(-1.2), index=2)
    render_to(os.path.join(OUT, "clip1.mp4"))


# ---------- scene 2: phone profile rack-focus ----------------------------

def scene2_profile():
    reset_scene()
    plane("floor", (0, 0, 0), (0, 0, 0), (30, 30), mat("s2_floor", srgb("#12100e"), rough=0.9))
    plane("wall", (0, 2.6, 0), (math.radians(90), 0, 0), (30, 16),
          mat("s2_wall", srgb("#1b1512"), rough=1.0))

    # Phone body + stand; the screenshot goes on the -Y face.
    slab("phone", (0, 1.25, 1.85), (1.2, 0.13, 2.45), mat("s2_body", srgb("#241b16"), rough=0.3),
         bevel=0.055)
    slab("stand", (0, 1.9, 0.28), (1.7, 1.1, 0.5), mat("s2_stand", srgb("#1e1713"), rough=0.7))
    p = shot("02_profile")
    scr = None
    if p:
        scr = shot_plane("phone_scr", p, (0, 1.175, 1.85), (math.radians(90), 0, 0),
                         height=2.1, emit=1.20)

    # Foreground ticket stub for the rack focus to pull off. Offset in +X so it
    # frames the phone instead of covering it.
    FG_LOC = (0.85, -0.5, 1.15)
    FG_ROT = (math.radians(74), 0, math.radians(20))
    fg = plane("fg_ticket", FG_LOC, FG_ROT, (1.15, 0.66),
               mat("s2_fg", TICKET, emit=0.35, rough=0.55))
    # Without a word on it the stub read as a random orange panel in the render,
    # so it carries the app's own ADMIT ONE wording (api/fund route.tsx:72).
    fg_txt = txt("fg_admit", "ADMIT ONE",
                 (FG_LOC[0], FG_LOC[1] - 0.02, FG_LOC[2] + 0.02),
                 FG_ROT, 0.11, CREAM, extrude=0.004)

    key_light((0, -3.0, 4.0), 1100, color=AMBER[:3])
    key_light((-3.5, 0.5, 2.0), 340, color=(0.6, 0.75, 1.0))
    key_light((0.8, -5.2, 1.7), 260, color=(0.9, 0.95, 1.0))   # camera-side fill

    # Framing: a 45mm lens at 6.0 units sees ~2.70 tall, so the 2.45-tall phone
    # fits with margin. An 85mm here would have cropped it badly (it sees only
    # ~1.13 tall at this distance).
    cam = camera("cam2", (0, -6.0, 1.9), (math.radians(90), 0, 0))
    cam.data.lens = 45
    cam.data.dof.use_dof = True
    cam.data.dof.aperture_fstop = 1.4
    # Rack: start on the stub (5.5 away), settle on the screen (7.25 away).
    kf(cam.data.dof, "focus_distance", 1, 5.5)
    kf(cam.data.dof, "focus_distance", 34, 7.25)
    kf(cam.data.dof, "focus_distance", FPE, 7.25)
    kf(cam, "location", 1, (0.25, -6.0, 1.9))
    kf(cam, "location", FPE, (-0.15, -5.7, 1.84))

    if scr:                                  # gentle tilt as the shot settles
        kf(scr, "rotation_euler", 1, math.radians(-4), index=2)
        kf(scr, "rotation_euler", FPE, math.radians(3), index=2)
    kf(fg, "location", 1, FG_LOC)
    kf(fg, "location", FPE, (1.15, -0.35, 1.05))
    kf(fg_txt, "location", 1, (FG_LOC[0], FG_LOC[1] - 0.02, FG_LOC[2] + 0.02))
    kf(fg_txt, "location", FPE, (1.15, -0.37, 1.07))
    render_to(os.path.join(OUT, "clip2.mp4"))


# ---------- scene 3: fund ballot + ADMIT ONE stamp + credits crawl --------

def scene3_ballot():
    reset_scene()
    plane("floor", (0, 0, 0), (0, 0, 0), (30, 30), mat("s3_floor", srgb("#12100e"), rough=0.95))
    plane("wall", (0, 2.4, 0), (math.radians(90), 0, 0), (30, 16),
          mat("s3_wall", srgb("#1b1512"), rough=1.0))

    # The ballot itself, as a lit card on the right of frame.
    p = shot("03_ballot")
    if p:
        shot_plane("ballot", p, (1.45, 1.2, 1.8), (math.radians(90), 0, 0),
                   height=2.7, emit=1.45)

    # "ADMIT ONE" is the app's own ticket wording (api/fund route.tsx:58,72).
    # It drops in like a rubber stamp and settles with a tiny overshoot.
    stamp = txt("admit_one", "ADMIT ONE", (-1.15, 0.55, 7.0),
                (math.radians(90), 0, math.radians(-14)), 0.4, AMBER, extrude=0.045)
    kf(stamp, "location", 1, (-1.15, 0.55, 7.0))
    kf(stamp, "location", 16, (-1.15, 0.55, 1.34))      # slight overshoot
    kf(stamp, "location", 21, (-1.15, 0.55, 1.5))       # settle
    kf(stamp, "rotation_euler", 1, math.radians(-14), index=2)
    kf(stamp, "rotation_euler", 18, math.radians(0), index=2)
    kf(stamp, "rotation_euler", FPE, math.radians(0), index=2)

    # Credits crawl. Every line is real app copy in its real casing -- no
    # invented claims and no re-casing of the app's own sentences.
    # A font curve does not lay out "\n" reliably -- a probe on 4.5.10 returned
    # 0 splines for a two-line body -- so each crawl line is its own text object
    # rising in step.
    for j, line in enumerate(("YOU PICK THE NEXT ONE", "THE INDIE FILM FUND", "ADMIT ONE")):
        z0 = 0.30 - j * 0.22
        ln = txt("crawl%d" % j, line, (0.1, 0.35, z0),
                 (math.radians(90), 0, 0), 0.13, CREAM, extrude=0.012)
        kf(ln, "location", 1, (0.1, 0.35, z0))
        kf(ln, "location", FPE, (0.1, 0.35, z0 + 0.65))

    key_light((0, -3.4, 3.8), 1300, color=AMBER[:3])
    key_light((3.0, 1.0, 2.4), 320, color=(0.6, 0.7, 1.0))
    key_light((-0.4, -6.4, 1.9), 300, color=(0.9, 0.95, 1.0))   # camera-side fill

    # 50mm at 8.7 units sees ~6.3 x 3.5, which holds the card and the stamp.
    cam = camera("cam3", (0, -7.5, 1.85), (math.radians(90), 0, math.radians(-4)))
    cam.data.lens = 50
    kf(cam, "location", 1, (-0.5, -7.5, 1.85))
    kf(cam, "location", FPE, (0.25, -6.9, 1.78))
    kf(cam, "rotation_euler", 1, math.radians(-7), index=2)
    kf(cam, "rotation_euler", FPE, math.radians(-2), index=2)
    render_to(os.path.join(OUT, "clip3.mp4"))


# ---------- scene 4: "$1 = 1 vote." marquee closer -----------------------

def bulb(name, loc, color, emit=6.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.062, location=loc, segments=16, ring_count=8)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat(name + "_m", color, emit=emit, rough=0.2))
    return o


def scene4_marquee():
    reset_scene()
    # Marquee frame: 24 chasing bulbs around the edge of frame.
    ring = []
    for i in range(10):
        x = -2.35 + i * (4.7 / 9.0)
        ring.append(bulb("bT%d" % i, (x, 0.35, 1.38), AMBER))
        ring.append(bulb("bB%d" % i, (x, 0.35, -1.28), AMBER))
    for j, z in enumerate((-0.40, 0.40)):
        ring.append(bulb("bL%d" % j, (-2.35, 0.35, z), AMBER))
        ring.append(bulb("bR%d" % j, (2.35, 0.35, z), AMBER))

    # Chase: bulb i is lit when (frame//2 + i) % 3 == 0. Keys land every 2 frames,
    # which is the pattern's own granularity.
    for i, b in enumerate(ring):
        sock = emit_socket(b)
        for f in range(1, FPE + 1, 2):
            sock.default_value = 9.0 if ((f // 2 + i) % 3 == 0) else 0.7
            sock.keyframe_insert("default_value", frame=f)

    # Hierarchy mirrors the app: eyebrow, then the DEEP CUT wordmark, then the rule.
    # All three strings are verbatim app copy (fund/page.tsx:41,94; page.tsx:164).
    # NB: a font object sits ON its baseline, so these z values are baselines and
    # the caps grow upward from them (verified in a render: an object centred at
    # z=0.50 drew caps from z=0.49 to 1.07). Hence the generous gaps here.
    eyebrow = txt("s4_eyebrow", "THE INDIE FILM FUND", (0, 0.6, 1.26),
                  (math.radians(90), 0, 0), 0.1, CREAM, extrude=0.01)
    mark = txt("s4_mark", "DEEP CUT", (3.6, 0.6, 0.50), (math.radians(90), 0, 0), 0.78,
               AMBER, extrude=0.06)
    rule = txt("s4_rule", "$1 = 1 vote.", (0, 0.55, -0.30), (math.radians(90), 0, 0), 0.22,
               CREAM, extrude=0.02)

    # Wordmark slides in from the right and overshoots slightly before settling.
    kf(mark, "location", 1, (3.6, 0.6, 0.50))
    kf(mark, "location", 15, (0.0, 0.6, 0.50))
    kf(mark, "location", 19, (-0.07, 0.6, 0.50))
    kf(mark, "location", 24, (0.0, 0.6, 0.50))
    kf(mark, "location", FPE, (0.0, 0.6, 0.50))

    # Fade the two support lines in via their emission.
    for o, hi in ((eyebrow, 2.5), (rule, 2.5)):
        sock = emit_socket(o)
        sock.default_value = 0.0
        sock.keyframe_insert("default_value", frame=1)
        sock.default_value = hi
        sock.keyframe_insert("default_value", frame=14)

    key_light((0, -3.2, 3.6), 1300, color=AMBER[:3])
    key_light((-3.2, 1.0, 2.2), 320, color=(0.6, 0.72, 1.0))
    key_light((0, -6.0, 0.4), 300, color=(0.9, 0.95, 1.0))   # camera-side fill

    # 50mm at 8.2 units from the text plane sees ~5.7 x 3.2, so the bulb ring
    # (4.7 x 2.5) fits with margin. v5 had the camera at z=0.1, which cropped the
    # eyebrow off the top of frame entirely.
    cam = camera("cam4", (0, -7.6, 0.0), (math.radians(90), 0, 0))
    cam.data.lens = 50
    kf(cam, "location", 1, (0, -7.6, 0.0))
    kf(cam, "location", FPE, (0, -6.9, -0.04))
    render_to(os.path.join(OUT, "clip4.mp4"))


# ---------- dispatch ------------------------------------------------------

SCENES = {1: scene1_crt, 2: scene2_profile, 3: scene3_ballot, 4: scene4_marquee}


def main():
    print("engine=%s samples=%d" % (ENGINE, SAMPLES))
    print("shots  =%s" % SHOTS)
    missing = [n for n in ("01_crt_channels", "02_profile", "03_ballot", "04_fund_hero")
               if shot(n) is None]
    if missing:
        print("WARNING: missing screenshots -> %s" % ", ".join(missing))
    for n in sorted(SCENES):
        if ONLY is not None and n != ONLY:
            continue
        print("=== scene %d -> clip%d.mp4 ===" % (n, n))
        SCENES[n]()
    print("DONE (clips in %s)" % OUT)


if __name__ == "__main__":
    main()
