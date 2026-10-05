"""
Google Play Store Listing Graphics Generator for MIRUS Field Force
Generates:
1. App Icon (512x512 PNG, 32-bit with alpha, square)
2. Feature Graphic (1024x500 PNG, 24-bit RGB, safe zone compliant)
3. 4x Phone Screenshots (1080x1920 PNG, 9:16 aspect ratio)
   - Screenshot 1: Attendance & Shift Punch
   - Screenshot 2: Daily Call Reporting (DCR)
   - Screenshot 3: Monthly Tour Planning (MTP)
   - Screenshot 4: Field Expenses & Receipts
"""

import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Determine repository root
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Output directories
OUTPUT_DIRS = [
    os.path.join(REPO_ROOT, 'store-assets'),
    os.path.join(REPO_ROOT, 'mobile', 'assets', 'play-store')
]

for d in OUTPUT_DIRS:
    os.makedirs(d, exist_ok=True)

# Color tokens
BRAND_ORANGE = (232, 144, 0)        # #E89000
BRAND_ORANGE_DARK = (179, 109, 0)   # #B36D00
BRAND_ORANGE_SOFT = (255, 243, 224) # #FFF3E0
INK = (45, 45, 45)                  # #2D2D2D
MUTED = (112, 112, 112)             # #707070
LIGHT_MUTED = (160, 160, 160)
BG_SURFACE = (245, 245, 245)        # #F5F5F5
CARD_BG = (255, 255, 255)           # Card White
BORDER_LINE = (224, 224, 224)       # Line
SUCCESS_GREEN = (22, 163, 74)       # #16A34A
SUCCESS_SOFT = (220, 252, 231)
WARNING_AMBER = (217, 119, 6)       # #D97706
WARNING_SOFT = (254, 243, 199)
DANGER_RED = (220, 38, 38)
DANGER_SOFT = (254, 226, 226)
INFO_BLUE = (14, 165, 233)
INFO_SOFT = (224, 242, 254)

PHONE_BEZEL = (30, 33, 40)
PHONE_SHADOW = (0, 0, 0, 45)

def get_font(size, bold=False):
    font_path = "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"
    if not os.path.exists(font_path):
        font_path = "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"
    return ImageFont.truetype(font_path, size)

def save_both(img, filename):
    for d in OUTPUT_DIRS:
        dest = os.path.join(d, filename)
        # Convert RGBA to RGB if saving JPEG or requested
        if filename.endswith('.jpg') or filename.endswith('.jpeg'):
            rgb_img = img.convert('RGB')
            rgb_img.save(dest, quality=95, optimize=True)
        else:
            img.save(dest, optimize=True)
        size_kb = os.path.getsize(dest) / 1024
        print(f"Saved: {dest} ({img.size[0]}x{img.size[1]}, {size_kb:.1f} KB)")

# ==========================================
# 1. APP ICON (512x512 PNG)
# ==========================================
def generate_app_icon():
    print("Generating App Icon (512x512)...")
    size = 512
    icon = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    
    # Load brand mark
    mark_path = os.path.join(REPO_ROOT, 'mobile', 'assets', 'logo-mirus-mark.png')
    mark = Image.open(mark_path).convert('RGBA')
    
    # Google Play squircle safe zone: content should occupy ~68% of canvas
    target_w = int(size * 0.68)
    aspect = mark.size[1] / mark.size[0]
    target_h = int(target_w * aspect)
    mark_resized = mark.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    x = (size - target_w) // 2
    y = (size - target_h) // 2 - 28
    
    # Add subtle soft shadow behind logo mark
    shadow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_mask = mark_resized.split()[3]
    shadow_solid = Image.new("RGBA", mark_resized.size, (0, 0, 0, 30))
    shadow_layer.paste(shadow_solid, (x, y + 8), shadow_mask)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(12))
    icon = Image.alpha_composite(icon, shadow_layer)
    
    # Composite resized mark
    icon.paste(mark_resized, (x, y), mark_resized)
    
    # Bottom brand label pill "FIELD FORCE"
    draw = ImageDraw.Draw(icon)
    font_sub = get_font(22, bold=True)
    text = "FIELD FORCE"
    bbox = draw.textbbox((0, 0), text, font=font_sub)
    text_w = bbox[2] - bbox[0]
    
    pill_w = text_w + 48
    pill_h = 42
    cx = size // 2
    cy = size - 64
    
    pill_rect = [cx - pill_w // 2, cy - pill_h // 2, cx + pill_w // 2, cy + pill_h // 2]
    draw.rounded_rectangle(pill_rect, radius=14, fill=BRAND_ORANGE_SOFT, outline=BRAND_ORANGE, width=2)
    # Using anchor="mm" centers the text glyphs mathematically in the pill
    draw.text((cx, cy), text, font=font_sub, fill=BRAND_ORANGE_DARK, anchor="mm")
    
    save_both(icon, "app_icon_512x512.png")

# ==========================================
# 1B. LAUNCHER & ADAPTIVE ICONS (1024x1024 PNG)
# ==========================================
def generate_launcher_icons():
    print("Generating Launcher & Adaptive Icons (1024x1024)...")
    import numpy as np
    
    mark_path = os.path.join(REPO_ROOT, 'mobile', 'assets', 'logo-mirus-mark.png')
    mark = Image.open(mark_path).convert('RGBA')
    bbox = mark.getbbox()
    cropped = mark.crop(bbox)
    
    # Scale mark to comfortably fit within 66% safe zone diameter (~676px)
    target_w = 540
    aspect = cropped.size[1] / cropped.size[0]
    target_h = int(target_w * aspect)
    mark_resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    offset_x = (1024 - target_w) // 2
    offset_y = (1024 - target_h) // 2
    
    # 1. Master Icon (iOS / general Expo icon: solid white background)
    master = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
    master.paste(mark_resized, (offset_x, offset_y), mark_resized)
    master_dest = os.path.join(REPO_ROOT, 'mobile', 'assets', 'icon.png')
    master.convert('RGB').save(master_dest, optimize=True)
    print(f"Saved: {master_dest}")
    
    # 2. Android Adaptive Icon Foreground (transparent background)
    adaptive = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    adaptive.paste(mark_resized, (offset_x, offset_y), mark_resized)
    adaptive_dest = os.path.join(REPO_ROOT, 'mobile', 'assets', 'adaptive-icon.png')
    adaptive.save(adaptive_dest, optimize=True)
    print(f"Saved: {adaptive_dest}")
    
    # 3. Android 13+ Themed / Monochromatic Icon (transparent background)
    arr = np.array(mark_resized)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    is_orange = (r > 180) & (a > 20)
    is_gray = (r <= 180) & (a > 20)
    
    mono_arr = np.zeros_like(arr)
    mono_arr[:, :, 0] = 255
    mono_arr[:, :, 1] = 255
    mono_arr[:, :, 2] = 255
    mono_arr[is_orange, 3] = a[is_orange]
    mono_arr[is_gray, 3] = (a[is_gray].astype(float) * 0.65).astype(np.uint8)
    
    mono_img = Image.fromarray(mono_arr, 'RGBA')
    adaptive_mono = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    adaptive_mono.paste(mono_img, (offset_x, offset_y), mono_img)
    mono_dest = os.path.join(REPO_ROOT, 'mobile', 'assets', 'adaptive-icon-monochrome.png')
    adaptive_mono.save(mono_dest, optimize=True)
    print(f"Saved: {mono_dest}")

# ==========================================
# 2. FEATURE GRAPHIC (1024x500 PNG)
# ==========================================
def generate_feature_graphic():
    print("Generating Feature Graphic (1024x500)...")
    width, height = 1024, 500
    
    # Create rich dark modern gradient background
    bg = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    draw = ImageDraw.Draw(bg)
    
    # Draw horizontal/diagonal dark slate gradient
    for x in range(width):
        ratio = x / width
        r = int(24 + (38 - 24) * ratio)
        g = int(28 + (44 - 28) * ratio)
        b = int(34 + (52 - 34) * ratio)
        draw.line([(x, 0), (x, height)], fill=(r, g, b, 255))
    
    # Decorative warm ambient glow on left-bottom and right-top
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([-100, 250, 450, 750], fill=(232, 144, 0, 35))
    glow_draw.ellipse([700, -150, 1150, 300], fill=(232, 144, 0, 25))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    bg = Image.alpha_composite(bg, glow)
    
    draw = ImageDraw.Draw(bg)
    
    # Safe zone margins: Left 60px
    left_x = 64
    
    # 1. Category Tag Pill
    tag_text = "ENTERPRISE WORKFORCE & PHARMA"
    tag_font = get_font(13, bold=True)
    tbbox = draw.textbbox((0, 0), tag_text, font=tag_font)
    tw = tbbox[2] - tbbox[0]
    draw.rounded_rectangle([left_x, 58, left_x + tw + 24, 86], radius=8, fill=(232, 144, 0, 45), outline=BRAND_ORANGE, width=1)
    draw.text((left_x + 12, 64), tag_text, font=tag_font, fill=BRAND_ORANGE)
    
    # 2. Main Title & Logo
    # Load MIRUS logo
    logo_path = os.path.join(REPO_ROOT, 'mobile', 'assets', 'logo-mirus.png')
    logo = Image.open(logo_path).convert('RGBA')
    logo_w = 260
    logo_h = int(logo_w * (logo.size[1] / logo.size[0]))
    logo_resized = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    bg.paste(logo_resized, (left_x, 102), logo_resized)
    
    # Subtitle / Value Proposition
    font_hero = get_font(34, bold=True)
    draw.text((left_x, 184), "Field Force & HRMS Hub", font=font_hero, fill=(255, 255, 255))
    
    font_sub = get_font(16, bold=False)
    draw.text((left_x, 232), "Real-Time Attendance • DCR • MTP Tour Plans • Expenses", font=font_sub, fill=(195, 202, 212))
    
    # Feature checklist pills
    features = [
        "✓ One-Tap Attendance & Shift Tracking",
        "✓ Doctor Calls & Chemist Coverage (DCR)",
        "✓ Monthly Tour Route Planning (MTP)",
        "✓ Digital Receipt Claims & Approvals"
    ]
    font_feat = get_font(14, bold=True)
    fy = 274
    for feat in features:
        draw.text((left_x, fy), feat, font=font_feat, fill=(240, 240, 240))
        fy += 26
    
    # Security & Compliance Badge
    font_badge = get_font(12, bold=False)
    draw.rounded_rectangle([left_x, 396, left_x + 360, 432], radius=6, fill=(35, 40, 48), outline=(60, 68, 80), width=1)
    draw.text((left_x + 16, 406), "🔒 Enterprise Multi-Tenant • Encrypted Data Safety", font=font_badge, fill=(160, 175, 195))
    
    # 3. Right Side: Modern Slanted / Angled App Preview Card
    card_w, card_h = 330, 430
    cx = 640
    cy = 45
    
    # Shadow behind card
    c_shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cs_draw = ImageDraw.Draw(c_shadow)
    cs_draw.rounded_rectangle([cx - 4, cy + 8, cx + card_w + 4, cy + card_h + 16], radius=24, fill=(0, 0, 0, 90))
    c_shadow = c_shadow.filter(ImageFilter.GaussianBlur(16))
    bg = Image.alpha_composite(bg, c_shadow)
    
    # Phone card body
    phone_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(phone_layer)
    pdraw.rounded_rectangle([cx, cy, cx + card_w, cy + card_h], radius=24, fill=BG_SURFACE, outline=(55, 62, 74), width=3)
    
    # Top phone header
    pdraw.rounded_rectangle([cx, cy, cx + card_w, cy + 70], radius=24, fill=BRAND_ORANGE)
    pdraw.rectangle([cx, cy + 45, cx + card_w, cy + 70], fill=BRAND_ORANGE)
    pdraw.text((cx + 18, cy + 18), "Rajesh Sharma", font=get_font(16, bold=True), fill=(255, 255, 255))
    pdraw.text((cx + 18, cy + 40), "BDM · North Zone (Delhi)", font=get_font(12), fill=(255, 240, 215))
    
    # Punch Card inside phone
    pcard_y = cy + 82
    pdraw.rounded_rectangle([cx + 14, pcard_y, cx + card_w - 14, pcard_y + 95], radius=12, fill=(255, 255, 255), outline=BORDER_LINE, width=1)
    pdraw.text((cx + 26, pcard_y + 12), "ATTENDANCE", font=get_font(10, bold=True), fill=MUTED)
    pdraw.text((cx + 26, pcard_y + 30), "Punched In at 09:15 AM", font=get_font(14, bold=True), fill=SUCCESS_GREEN)
    pdraw.text((cx + 26, pcard_y + 54), "Status: On Duty · 7h 24m", font=get_font(11), fill=MUTED)
    pdraw.rounded_rectangle([cx + card_w - 95, pcard_y + 46, cx + card_w - 24, pcard_y + 80], radius=8, fill=DANGER_RED)
    pdraw.text((cx + card_w - 87, pcard_y + 54), "Punch Out", font=get_font(11, bold=True), fill=(255, 255, 255))
    
    # DCR Progress Card inside phone
    dcard_y = pcard_y + 107
    pdraw.rounded_rectangle([cx + 14, dcard_y, cx + card_w - 14, dcard_y + 90], radius=12, fill=(255, 255, 255), outline=BORDER_LINE, width=1)
    pdraw.text((cx + 26, dcard_y + 12), "DCR SUBMISSIONS", font=get_font(10, bold=True), fill=MUTED)
    pdraw.text((cx + 26, dcard_y + 30), "18 / 22 Working Days", font=get_font(14, bold=True), fill=INK)
    pdraw.text((cx + card_w - 60, dcard_y + 30), "82%", font=get_font(14, bold=True), fill=BRAND_ORANGE)
    # Progress bar
    pdraw.rounded_rectangle([cx + 26, dcard_y + 58, cx + card_w - 26, dcard_y + 68], radius=5, fill=(230, 230, 230))
    pdraw.rounded_rectangle([cx + 26, dcard_y + 58, cx + 26 + int((card_w - 52) * 0.82), dcard_y + 68], radius=5, fill=BRAND_ORANGE)
    
    # Quick Actions inside phone
    qcard_y = dcard_y + 102
    btn_w = (card_w - 28 - 20) // 3
    actions = [("DCR", BRAND_ORANGE), ("MTP", INFO_BLUE), ("Claims", SUCCESS_GREEN)]
    for i, (act, col) in enumerate(actions):
        bx = cx + 14 + i * (btn_w + 10)
        pdraw.rounded_rectangle([bx, qcard_y, bx + btn_w, qcard_y + 40], radius=8, fill=(255, 255, 255), outline=BORDER_LINE, width=1)
        pdraw.text((bx + 18, qcard_y + 12), act, font=get_font(12, bold=True), fill=INK)
        pdraw.ellipse([bx + 8, qcard_y + 16, bx + 14, qcard_y + 22], fill=col)
    
    bg = Image.alpha_composite(bg, phone_layer)
    
    # Convert to standard RGB 24-bit (Google Play requirement: RGB, no transparency for feature graphic)
    final_rgb = bg.convert("RGB")
    save_both(final_rgb, "feature_graphic_1024x500.png")

# ==========================================
# 3. PHONE SCREENSHOT HELPER
# ==========================================
def create_phone_frame(screen_content_func, banner_title, banner_sub, category_tag):
    """
    Renders a 1080x1920 (9:16) phone screenshot with:
    - Top marketing banner
    - Centered sleek smartphone frame
    - In-app interface drawn via screen_content_func
    """
    width, height = 1080, 1920
    canvas = Image.new("RGBA", (width, height), (242, 244, 248, 255))
    draw = ImageDraw.Draw(canvas)
    
    # Subtle background gradient
    for y in range(height):
        r = int(242 - (y / height) * 12)
        g = int(245 - (y / height) * 10)
        b = int(250 - (y / height) * 8)
        draw.line([(0, y), (width, y)], fill=(r, g, b, 255))
        
    # Top Marketing Banner
    # Category Pill
    pill_font = get_font(20, bold=True)
    pbbox = draw.textbbox((0, 0), category_tag, font=pill_font)
    pw = pbbox[2] - pbbox[0]
    px = (width - pw) // 2
    draw.rounded_rectangle([px - 20, 50, px + pw + 20, 92], radius=10, fill=BRAND_ORANGE_SOFT, outline=BRAND_ORANGE, width=2)
    draw.text((px, 58), category_tag, font=pill_font, fill=BRAND_ORANGE_DARK)
    
    # Main Headline
    title_font = get_font(46, bold=True)
    tbbox = draw.textbbox((0, 0), banner_title, font=title_font)
    tx = (width - (tbbox[2] - tbbox[0])) // 2
    draw.text((tx, 114), banner_title, font=title_font, fill=INK)
    
    # Subtitle
    sub_font = get_font(24, bold=False)
    sbbox = draw.textbbox((0, 0), banner_sub, font=sub_font)
    sx = (width - (sbbox[2] - sbbox[0])) // 2
    draw.text((sx, 176), banner_sub, font=sub_font, fill=MUTED)
    
    # Phone Bezel Dimensions
    phone_w, phone_h = 860, 1620
    phone_x = (width - phone_w) // 2
    phone_y = 240
    screen_padding = 16
    screen_w = phone_w - (screen_padding * 2)
    screen_h = phone_h - (screen_padding * 2)
    screen_x = phone_x + screen_padding
    screen_y = phone_y + screen_padding
    
    # Phone outer shadow
    shadow_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_img)
    sdraw.rounded_rectangle([phone_x - 10, phone_y + 16, phone_x + phone_w + 10, phone_y + phone_h + 30], radius=68, fill=(0, 0, 0, 55))
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(28))
    canvas = Image.alpha_composite(canvas, shadow_img)
    
    # Phone Bezel
    p_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(p_layer)
    pdraw.rounded_rectangle([phone_x, phone_y, phone_x + phone_w, phone_y + phone_h], radius=64, fill=PHONE_BEZEL, outline=(60, 66, 78), width=3)
    
    # Screen background
    pdraw.rounded_rectangle([screen_x, screen_y, screen_x + screen_w, screen_y + screen_h], radius=48, fill=BG_SURFACE)
    
    # Call screen_content_func to draw the app UI inside the screen
    screen_img = Image.new("RGBA", (screen_w, screen_h), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(screen_img)
    
    # Draw Status Bar (09:41, Wi-Fi, 5G, Battery)
    status_font = get_font(22, bold=True)
    s_draw.text((44, 20), "09:41", font=status_font, fill=INK)
    # Icons on right
    s_draw.text((screen_w - 140, 20), "5G  📶  🔋", font=get_font(18), fill=INK)
    # Camera hole
    hole_w = 120
    s_draw.rounded_rectangle([(screen_w - hole_w) // 2, 16, (screen_w + hole_w) // 2, 42], radius=14, fill=(15, 15, 18))
    
    # Populate custom screen UI
    screen_content_func(s_draw, screen_w, screen_h)
    
    # Mask screen with rounded rectangle
    mask = Image.new("L", (screen_w, screen_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, screen_w, screen_h], radius=48, fill=255)
    
    p_layer.paste(screen_img, (screen_x, screen_y), mask)
    canvas = Image.alpha_composite(canvas, p_layer)
    
    return canvas

# ==========================================
# 4. SCREENSHOT 1: ATTENDANCE & PUNCH
# ==========================================
def draw_screen_attendance(draw, w, h):
    # App Bar
    draw.rounded_rectangle([20, 64, w - 20, 160], radius=18, fill=BRAND_ORANGE)
    draw.text((40, 84), "Rajesh Sharma", font=get_font(26, bold=True), fill=(255, 255, 255))
    draw.text((40, 118), "BDM · North Zone · MIRUS Pharma", font=get_font(18), fill=(255, 240, 220))
    # Bell icon circle
    draw.ellipse([w - 80, 94, w - 44, 130], fill=(255, 255, 255, 60))
    draw.text((w - 70, 98), "🔔", font=get_font(18), fill=(255, 255, 255))
    
    # 1. PUNCH CARD
    py = 180
    draw.rounded_rectangle([20, py, w - 20, py + 230], radius=18, fill=CARD_BG, outline=BORDER_LINE, width=1)
    draw.text((44, py + 20), "ATTENDANCE", font=get_font(16, bold=True), fill=MUTED)
    
    # Status tag Present
    draw.rounded_rectangle([w - 140, py + 16, w - 44, py + 48], radius=8, fill=SUCCESS_SOFT)
    draw.text((w - 124, py + 22), "PRESENT", font=get_font(14, bold=True), fill=SUCCESS_GREEN)
    
    draw.text((44, py + 60), "Punched in at 09:15 AM", font=get_font(24, bold=True), fill=SUCCESS_GREEN)
    draw.text((44, py + 98), "Shift Duration: 07h 45m  •  Normal Shift", font=get_font(18), fill=INK)
    
    # Punch out button
    draw.rounded_rectangle([44, py + 144, w - 44, py + 204], radius=12, fill=DANGER_RED)
    btn_text = "Punch Out"
    draw.text((w // 2 - 50, py + 160), btn_text, font=get_font(22, bold=True), fill=(255, 255, 255))
    
    # 2. LEAVE STATUS CARD
    ly = py + 250
    draw.rounded_rectangle([20, ly, w - 20, ly + 90], radius=18, fill=CARD_BG, outline=BORDER_LINE, width=1)
    draw.text((44, ly + 20), "🌴  Apply Leave", font=get_font(20, bold=True), fill=INK)
    draw.text((44, ly + 52), "Annual / Casual / Sick leave balance: 14 days", font=get_font(16), fill=MUTED)
    draw.rounded_rectangle([w - 130, ly + 24, w - 44, ly + 66], radius=10, fill=BRAND_ORANGE_SOFT, outline=BRAND_ORANGE, width=1)
    draw.text((w - 110, ly + 34), "Apply", font=get_font(16, bold=True), fill=BRAND_ORANGE_DARK)
    
    # 3. DCR STATUS CARD
    dy = ly + 110
    draw.rounded_rectangle([20, dy, w - 20, dy + 180], radius=18, fill=CARD_BG, outline=BORDER_LINE, width=1)
    draw.text((44, dy + 20), "DCR SUBMISSION STATUS", font=get_font(16, bold=True), fill=MUTED)
    draw.text((w - 180, dy + 20), "October 2026", font=get_font(16, bold=True), fill=INK)
    
    draw.text((44, dy + 62), "Submitted: 18 / 22 Working days", font=get_font(20, bold=True), fill=INK)
    draw.text((w - 110, dy + 60), "82%", font=get_font(26, bold=True), fill=BRAND_ORANGE)
    
    # Progress Bar
    draw.rounded_rectangle([44, dy + 110, w - 44, dy + 130], radius=10, fill=(230, 230, 230))
    fill_w = int((w - 88) * 0.82)
    draw.rounded_rectangle([44, dy + 110, 44 + fill_w, dy + 130], radius=10, fill=BRAND_ORANGE)
    draw.text((44, dy + 142), "✓ 4 pending calls to reach monthly 100% target", font=get_font(15), fill=MUTED)
    
    # 4. QUICK ACTIONS
    qy = dy + 200
    draw.text((24, qy), "QUICK ACTIONS", font=get_font(16, bold=True), fill=MUTED)
    
    actions = [("📋 DCR Calls", BRAND_ORANGE), ("📅 MTP Tour", INFO_BLUE), ("💳 Expenses", SUCCESS_GREEN), ("📝 Work Type", WARNING_AMBER)]
    col_w = (w - 60) // 2
    for i, (title, color) in enumerate(actions):
        bx = 20 + (i % 2) * (col_w + 20)
        by = qy + 30 + (i // 2) * 80
        draw.rounded_rectangle([bx, by, bx + col_w, by + 68], radius=14, fill=CARD_BG, outline=BORDER_LINE, width=1)
        draw.text((bx + 20, by + 22), title, font=get_font(18, bold=True), fill=INK)
        
    # 5. DOCTOR BIRTHDAY ALERT CARD
    ay = qy + 204
    draw.rounded_rectangle([20, ay, w - 20, ay + 115], radius=18, fill=WARNING_SOFT, outline=WARNING_AMBER, width=1)
    draw.text((44, ay + 18), "🎂  TODAY'S DOCTOR BIRTHDAY", font=get_font(15, bold=True), fill=WARNING_AMBER)
    draw.text((44, ay + 48), "Dr. Priya Deshmukh (Cardiologist)", font=get_font(20, bold=True), fill=INK)
    draw.text((44, ay + 80), "Apollo Hospital · Morning visit scheduled", font=get_font(16), fill=MUTED)
    draw.rounded_rectangle([w - 140, ay + 38, w - 44, ay + 86], radius=10, fill=SUCCESS_GREEN)
    draw.text((w - 124, ay + 50), "📞 Call", font=get_font(18, bold=True), fill=(255, 255, 255))
    
    # Bottom Tab Bar
    draw_tab_bar(draw, w, h, active_idx=0)

def draw_tab_bar(draw, w, h, active_idx=0):
    tab_y = h - 110
    draw.rectangle([0, tab_y, w, h], fill=(255, 255, 255), outline=BORDER_LINE, width=1)
    tabs = ["Home", "DCR", "MTP", "Doctors", "More"]
    icons = ["🏠", "📋", "📅", "🩺", "•••"]
    tw = w // len(tabs)
    for i, (t, icon) in enumerate(zip(tabs, icons)):
        tx = i * tw + tw // 2
        color = BRAND_ORANGE if i == active_idx else MUTED
        draw.text((tx - 12, tab_y + 18), icon, font=get_font(22), fill=color)
        draw.text((tx - 18, tab_y + 60), t, font=get_font(15, bold=(i == active_idx)), fill=color)

# ==========================================
# 5. SCREENSHOT 2: DAILY CALL REPORTS (DCR)
# ==========================================
def draw_screen_dcr(draw, w, h):
    # App Bar
    draw.rectangle([0, 64, w, 150], fill=(255, 255, 255))
    draw.text((28, 86), "Daily Call Report (DCR)", font=get_font(26, bold=True), fill=INK)
    draw.text((28, 122), "Today · 12 October 2026", font=get_font(16), fill=MUTED)
    
    # Submit Day DCR button in header
    draw.rounded_rectangle([w - 180, 84, w - 24, 134], radius=10, fill=BRAND_ORANGE)
    draw.text((w - 164, 96), "Submit DCR", font=get_font(16, bold=True), fill=(255, 255, 255))
    
    # Summary Counters (Total: 12, Completed: 9, Pending: 3)
    cy = 168
    box_w = (w - 56) // 3
    counters = [("Total Calls", "12", INK), ("Completed", "9", SUCCESS_GREEN), ("Pending", "3", WARNING_AMBER)]
    for i, (label, val, col) in enumerate(counters):
        bx = 20 + i * (box_w + 8)
        draw.rounded_rectangle([bx, cy, bx + box_w, cy + 90], radius=14, fill=CARD_BG, outline=BORDER_LINE, width=1)
        draw.text((bx + 16, cy + 14), label, font=get_font(14, bold=True), fill=MUTED)
        draw.text((bx + 16, cy + 40), val, font=get_font(32, bold=True), fill=col)
        
    # Filter Tabs (All, Individual, Joint, Camp)
    fy = cy + 106
    filters = ["All Calls (12)", "Individual (8)", "Joint (3)", "Camp (1)"]
    fx = 20
    for i, f in enumerate(filters):
        fw = len(f) * 11 + 24
        bg_col = BRAND_ORANGE if i == 0 else CARD_BG
        txt_col = (255, 255, 255) if i == 0 else INK
        draw.rounded_rectangle([fx, fy, fx + fw, fy + 44], radius=22, fill=bg_col, outline=BORDER_LINE, width=1)
        draw.text((fx + 16, fy + 12), f, font=get_font(15, bold=(i == 0)), fill=txt_col)
        fx += fw + 10
        
    # Doctor Call Rows
    ry = fy + 60
    calls = [
        ("Dr. Rajiv Malhotra", "Cardiologist", "Apex Hospital, Ward 4", "COMPLETED", SUCCESS_GREEN, SUCCESS_SOFT, "Promoted Cardil-10 • Sample 2 pkts given"),
        ("Dr. Sneha Kulkarni", "Pediatrician", "City Child Clinic", "COMPLETED", SUCCESS_GREEN, SUCCESS_SOFT, "Discussed syrup dosage • Follow-up next week"),
        ("Dr. Amit Verma", "Diabetologist", "Verma Diabetes Care", "COMPLETED", SUCCESS_GREEN, SUCCESS_SOFT, "Joint visit with ASM • Chemist PO confirmed"),
        ("Dr. Ananya Sen", "Gynecologist", "Mother Care Nursing Home", "PENDING", WARNING_AMBER, WARNING_SOFT, "Scheduled: 04:30 PM • Literature presentation"),
        ("Dr. Vikram Rathore", "General Physician", "Rathore Clinic, Sector 12", "PENDING", WARNING_AMBER, WARNING_SOFT, "Scheduled: 05:45 PM • Focus on Antibiotic line")
    ]
    
    for doc, spec, clinic, st_label, st_col, st_soft, notes in calls:
        draw.rounded_rectangle([20, ry, w - 20, ry + 155], radius=16, fill=CARD_BG, outline=BORDER_LINE, width=1)
        
        # Doctor initial circle
        draw.ellipse([36, ry + 18, 92, ry + 74], fill=BRAND_ORANGE_SOFT)
        initials = "".join([part[0] for part in doc.replace("Dr. ", "").split()[:2]])
        draw.text((48, ry + 32), initials, font=get_font(20, bold=True), fill=BRAND_ORANGE_DARK)
        
        # Doctor Info
        draw.text((106, ry + 16), doc, font=get_font(20, bold=True), fill=INK)
        draw.text((106, ry + 44), f"{spec} · {clinic}", font=get_font(15), fill=MUTED)
        
        # Status Badge
        draw.rounded_rectangle([w - 160, ry + 16, w - 36, ry + 50], radius=8, fill=st_soft)
        draw.text((w - 146, ry + 22), st_label, font=get_font(13, bold=True), fill=st_col)
        
        # Divider & Notes
        draw.line([(36, ry + 82), (w - 36, ry + 82)], fill=BORDER_LINE, width=1)
        draw.text((36, ry + 94), f"📝  {notes}", font=get_font(15), fill=INK)
        draw.text((36, ry + 124), "🕒 25 mins duration • Chemist attached", font=get_font(13), fill=MUTED)
        
        ry += 170
        if ry > h - 140:
            break
            
    draw_tab_bar(draw, w, h, active_idx=1)

# ==========================================
# 6. SCREENSHOT 3: MONTHLY TOUR PLANS (MTP)
# ==========================================
def draw_screen_mtp(draw, w, h):
    # App Bar
    draw.rectangle([0, 64, w, 150], fill=(255, 255, 255))
    draw.text((28, 86), "Monthly Tour Plan (MTP)", font=get_font(26, bold=True), fill=INK)
    draw.text((28, 122), "October 2026 · Planning & Schedule", font=get_font(16), fill=MUTED)
    
    # + Create New Tour button
    draw.rounded_rectangle([w - 200, 84, w - 24, 134], radius=10, fill=BRAND_ORANGE)
    draw.text((w - 186, 96), "+ New Tour", font=get_font(16, bold=True), fill=(255, 255, 255))
    
    # Month Selector Bar
    my = 166
    draw.rounded_rectangle([20, my, w - 20, my + 60], radius=14, fill=CARD_BG, outline=BORDER_LINE, width=1)
    draw.text((44, my + 18), "◀   September", font=get_font(16, bold=True), fill=MUTED)
    draw.text((w // 2 - 64, my + 16), "OCTOBER 2026", font=get_font(18, bold=True), fill=INK)
    draw.text((w - 150, my + 18), "November   ▶", font=get_font(16, bold=True), fill=MUTED)
    
    # Tour Overview Card
    oy = my + 76
    draw.rounded_rectangle([20, oy, w - 20, oy + 150], radius=18, fill=CARD_BG, outline=BORDER_LINE, width=1)
    draw.text((44, oy + 20), "TOUR ADHERENCE & TARGETS", font=get_font(16, bold=True), fill=MUTED)
    
    draw.rounded_rectangle([w - 160, oy + 16, w - 44, oy + 48], radius=8, fill=SUCCESS_SOFT)
    draw.text((w - 146, oy + 22), "APPROVED", font=get_font(14, bold=True), fill=SUCCESS_GREEN)
    
    # 3 Stat metrics
    draw.text((44, oy + 64), "24 Days", font=get_font(26, bold=True), fill=INK)
    draw.text((44, oy + 104), "Planned Field Days", font=get_font(14), fill=MUTED)
    
    draw.text((w // 2 - 40, oy + 64), "142 Calls", font=get_font(26, bold=True), fill=BRAND_ORANGE)
    draw.text((w // 2 - 40, oy + 104), "Target Doctor Visits", font=get_font(14), fill=MUTED)
    
    draw.text((w - 180, oy + 64), "94.2%", font=get_font(26, bold=True), fill=SUCCESS_GREEN)
    draw.text((w - 180, oy + 104), "MTP Adherence", font=get_font(14), fill=MUTED)
    
    # Tour Itinerary Cards
    ty = oy + 170
    draw.text((24, ty), "SCHEDULED TOUR BLOCKS", font=get_font(16, bold=True), fill=MUTED)
    
    tour_blocks = [
        ("Tour 1: Central Metro Territory", "01 Oct - 07 Oct (6 Days)", "Connaught Place, Karol Bagh, Pusa Road", "APPROVED", SUCCESS_GREEN, SUCCESS_SOFT, "38 Doctors • 12 Chemists • 2 Joint Calls with ASM"),
        ("Tour 2: South District Specialty Clinics", "09 Oct - 15 Oct (6 Days)", "Hauz Khas, Saket, Greater Kailash", "APPROVED", SUCCESS_GREEN, SUCCESS_SOFT, "42 Doctors • Super-specialty cardiology focus"),
        ("Tour 3: West Zone Nursing Homes", "17 Oct - 23 Oct (6 Days)", "Janakpuri, Rajouri Garden, Dwarka", "APPROVED", SUCCESS_GREEN, SUCCESS_SOFT, "35 Doctors • Pediatric and Ortho network"),
        ("Tour 4: Outstation Upcountry Tour", "25 Oct - 30 Oct (5 Days)", "Meerut & Ghaziabad Ex-HQ", "PENDING", WARNING_AMBER, WARNING_SOFT, "28 Doctors • Secondary sales review")
    ]
    
    by = ty + 30
    for name, dates, areas, st_lbl, st_col, st_soft, desc in tour_blocks:
        draw.rounded_rectangle([20, by, w - 20, by + 160], radius=16, fill=CARD_BG, outline=BORDER_LINE, width=1)
        
        # Left color bar
        draw.rounded_rectangle([20, by, 30, by + 160], radius=8, fill=st_col)
        
        draw.text((44, by + 16), name, font=get_font(19, bold=True), fill=INK)
        draw.text((44, by + 46), f"📅  {dates}  ·  📍 {areas}", font=get_font(15), fill=MUTED)
        
        draw.rounded_rectangle([w - 150, by + 16, w - 36, by + 48], radius=8, fill=st_soft)
        draw.text((w - 138, by + 22), st_lbl, font=get_font(13, bold=True), fill=st_col)
        
        draw.line([(44, by + 82), (w - 36, by + 82)], fill=BORDER_LINE, width=1)
        draw.text((44, by + 94), f"🎯  {desc}", font=get_font(15), fill=INK)
        draw.text((44, by + 124), "✓ Approved by ASM: Sanjay Verma", font=get_font(14, bold=True), fill=MUTED)
        
        by += 175
        if by > h - 140:
            break
            
    draw_tab_bar(draw, w, h, active_idx=2)

# ==========================================
# 7. SCREENSHOT 4: FIELD EXPENSES & CLAIMS
# ==========================================
def draw_screen_expenses(draw, w, h):
    # App Bar
    draw.rectangle([0, 64, w, 150], fill=(255, 255, 255))
    draw.text((28, 86), "Expenses & Reimbursements", font=get_font(26, bold=True), fill=INK)
    draw.text((28, 122), "October 2026 · Claim Summary", font=get_font(16), fill=MUTED)
    
    # + Add Expense button
    draw.rounded_rectangle([w - 180, 84, w - 24, 134], radius=10, fill=BRAND_ORANGE)
    draw.text((w - 168, 96), "+ Add Expense", font=get_font(16, bold=True), fill=(255, 255, 255))
    
    # Total Claim Card
    ey = 168
    draw.rounded_rectangle([20, ey, w - 20, ey + 130], radius=18, fill=CARD_BG, outline=BORDER_LINE, width=1)
    draw.text((44, ey + 18), "OCTOBER CLAIMS TOTAL", font=get_font(15, bold=True), fill=MUTED)
    draw.text((44, ey + 50), "₹18,450", font=get_font(38, bold=True), fill=INK)
    draw.text((44, ey + 98), "Approved: ₹14,200  •  Pending Review: ₹4,250", font=get_font(16), fill=MUTED)
    
    draw.rounded_rectangle([w - 150, ey + 44, w - 44, ey + 86], radius=10, fill=SUCCESS_SOFT)
    draw.text((w - 132, ey + 56), "ACTIVE", font=get_font(16, bold=True), fill=SUCCESS_GREEN)
    
    # Category Pills Filter
    py = ey + 148
    categories = ["All (14)", "Travel (6)", "Food/DA (5)", "Stay (2)", "Misc (1)"]
    px = 20
    for i, c in enumerate(categories):
        cw = len(c) * 11 + 24
        bg_col = BRAND_ORANGE if i == 0 else CARD_BG
        txt_col = (255, 255, 255) if i == 0 else INK
        draw.rounded_rectangle([px, py, px + cw, py + 44], radius=22, fill=bg_col, outline=BORDER_LINE, width=1)
        draw.text((px + 16, py + 12), c, font=get_font(15, bold=(i == 0)), fill=txt_col)
        px += cw + 10
        
    # Expense List Items
    ly = py + 60
    draw.text((24, ly), "RECENT CLAIMS WITH RECEIPTS", font=get_font(16, bold=True), fill=MUTED)
    
    claims = [
        ("Inter-City Travel (Train 3AC)", "11 Oct 2026", "Delhi ➔ Meerut (HQ to Outstation)", "₹1,850", "APPROVED", SUCCESS_GREEN, SUCCESS_SOFT, "IRCTC_Ticket_11Oct.pdf"),
        ("Daily Food & Allowance (DA)", "11 Oct 2026", "Outstation Metro Daily Allowance", "₹750", "APPROVED", SUCCESS_GREEN, SUCCESS_SOFT, "Standard Entitlement"),
        ("Hotel Accommodation", "10 Oct 2026", "Hotel Grand Residency (1 Night)", "₹2,600", "PENDING", WARNING_AMBER, WARNING_SOFT, "Hotel_Bill_TaxInvoice.jpg"),
        ("Local Territory Travel", "09 Oct 2026", "Auto / Own Vehicle (84 km @ ₹9/km)", "₹756", "APPROVED", SUCCESS_GREEN, SUCCESS_SOFT, "Odometer_Reading_09Oct.jpg"),
        ("Doctor Conference Stationery", "08 Oct 2026", "CME Meeting Materials Printout", "₹890", "APPROVED", SUCCESS_GREEN, SUCCESS_SOFT, "Receipt_Stationery.pdf")
    ]
    
    ry = ly + 30
    for title, dt, route, amt, st_lbl, st_col, st_soft, receipt in claims:
        draw.rounded_rectangle([20, ry, w - 20, ry + 138], radius=16, fill=CARD_BG, outline=BORDER_LINE, width=1)
        
        # Category icon
        draw.ellipse([36, ry + 18, 86, ry + 68], fill=BRAND_ORANGE_SOFT)
        draw.text((48, ry + 28), "🧾", font=get_font(20), fill=BRAND_ORANGE)
        
        # Claim info
        draw.text((98, ry + 16), title, font=get_font(19, bold=True), fill=INK)
        draw.text((98, ry + 44), f"{dt}  ·  {route}", font=get_font(14), fill=MUTED)
        
        # Amount on right
        draw.text((w - 180, ry + 16), amt, font=get_font(22, bold=True), fill=INK)
        
        # Status Badge
        draw.rounded_rectangle([w - 170, ry + 50, w - 36, ry + 80], radius=8, fill=st_soft)
        draw.text((w - 156, ry + 56), st_lbl, font=get_font(13, bold=True), fill=st_col)
        
        # Divider & Attached receipt file
        draw.line([(36, ry + 88), (w - 36, ry + 88)], fill=BORDER_LINE, width=1)
        draw.text((36, ry + 102), f"📎 Attached Receipt: {receipt}", font=get_font(14, bold=True), fill=INFO_BLUE)
        
        ry += 152
        if ry > h - 140:
            break
            
    draw_tab_bar(draw, w, h, active_idx=4)

# ==========================================
# RUN ALL GENERATIONS
# ==========================================
def main():
    print("==========================================")
    print("MIRUS FIELD FORCE - STORE ASSET GENERATOR")
    print("==========================================")
    
    # 1. App Icon (512x512)
    generate_app_icon()
    
    # 1B. Launcher & Adaptive Icons (1024x1024)
    generate_launcher_icons()
    
    # 2. Feature Graphic (1024x500)
    generate_feature_graphic()
    
    # 3. Screenshot 1: Attendance
    print("Generating Screenshot 1: Attendance & Shift Punch (1080x1920)...")
    s1 = create_phone_frame(
        draw_screen_attendance,
        "ATTENDANCE & DUTY TRACKING",
        "One-tap Punch In / Punch Out with real-time shift verification",
        "WORKFORCE ATTENDANCE"
    )
    save_both(s1, "screenshot_1_attendance_punch.png")
    
    # 4. Screenshot 2: DCR
    print("Generating Screenshot 2: Daily Call Reporting (1080x1920)...")
    s2 = create_phone_frame(
        draw_screen_dcr,
        "DAILY CALL REPORTING (DCR)",
        "Log doctor visits, chemist interactions & sample distribution",
        "FIELD FORCE ACTIVITIES"
    )
    save_both(s2, "screenshot_2_daily_call_reports.png")
    
    # 5. Screenshot 3: MTP
    print("Generating Screenshot 3: Monthly Tour Plans (1080x1920)...")
    s3 = create_phone_frame(
        draw_screen_mtp,
        "MONTHLY TOUR PLANS (MTP)",
        "Schedule field itineraries & track manager approval status",
        "TOUR & ROUTE PLANNING"
    )
    save_both(s3, "screenshot_3_monthly_tour_plans.png")
    
    # 6. Screenshot 4: Expenses
    print("Generating Screenshot 4: Field Expenses & Receipts (1080x1920)...")
    s4 = create_phone_frame(
        draw_screen_expenses,
        "EXPENSE CLAIMS & RECEIPTS",
        "Submit travel, food & stay claims with digital receipt attachments",
        "REIMBURSEMENTS & EXPENSES"
    )
    save_both(s4, "screenshot_4_field_expenses.png")
    
    print("All store assets successfully created!")

if __name__ == '__main__':
    main()
