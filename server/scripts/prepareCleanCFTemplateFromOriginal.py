import fitz
import os

def get_font_paths():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    bundled_reg = os.path.join(base_dir, 'assets', 'fonts', 'trebuc.ttf')
    bundled_bd = os.path.join(base_dir, 'assets', 'fonts', 'trebucbd.ttf')
    if os.path.exists(bundled_reg):
        return bundled_reg, (bundled_bd if os.path.exists(bundled_bd) else bundled_reg)

    win_regular = 'C:/Windows/Fonts/trebuc.ttf'
    win_bold = 'C:/Windows/Fonts/trebucbd.ttf'
    if os.path.exists(win_regular):
        return win_regular, (win_bold if os.path.exists(win_bold) else win_regular)
    linux_regular = '/usr/share/fonts/truetype/msttcorefonts/Trebuchet_MS.ttf'
    linux_bold = '/usr/share/fonts/truetype/msttcorefonts/Trebuchet_MS_Bold.ttf'
    if os.path.exists(linux_regular):
        return linux_regular, (linux_bold if os.path.exists(linux_bold) else linux_regular)
    return None, None

def prepare_template():
    orig_path = os.path.abspath('server/seed/cf-examples/cf-agent-original.pdf')
    dest_path = os.path.abspath('server/seed/cf-examples/cf-agent.pdf')

    doc = fitz.open(orig_path)
    blue_bg = (22/255, 55/255, 94/255)
    font_regular, font_bold = get_font_paths()

    # 1. Page 1 Preamble Clean Redaction
    p1 = doc[0]
    preamble_rect = fitz.Rect(25, 202, 580, 280)
    p1.add_redact_annot(preamble_rect, fill=(1, 1, 1))

    # Redact stray 111 on Page 1 (white background)
    for r in p1.search_for('111'):
        if r.y0 < 770:
            p1.add_redact_annot(fitz.Rect(r.x0, r.y0, r.x1, r.y1), fill=(1, 1, 1))

    p1.apply_redactions()

    # Insert clean placeholder text in Trebuchet MS 11.039pt, pure black
    font_kwargs = {'fontname': 'trebuc', 'fontfile': font_regular} if font_regular else {'fontname': 'helv'}
    font_kwargs_bd = {'fontname': 'trebuc_bd', 'fontfile': font_bold} if font_bold else font_kwargs
    p1.insert_text(fitz.Point(27.12, 218), "M/s. {{partyName}} (PAN: {{partyPan}}), having its Registered Office at:", fontsize=11.039, color=(0, 0, 0), **font_kwargs)
    p1.insert_text(fitz.Point(27.12, 230.7), "{{partyAddress}}", fontsize=11.039, color=(0, 0, 0), **font_kwargs)
    p1.insert_text(fitz.Point(27.12, 243.4), "duly represented by its Partner, {{partnerName}} (PAN: {{partnerPan}})", fontsize=11.039, color=(0, 0, 0), **font_kwargs)
    p1.insert_text(fitz.Point(27.12, 256.1), "(hereinafter referred to as the 'Agent' (which expression shall unless it be repugnant to the context or", fontsize=11.039, color=(0, 0, 0), **font_kwargs)
    p1.insert_text(fitz.Point(27.12, 268.8), "meaning thereof will mean and include its successors and assigns) of the Other Part;", fontsize=11.039, color=(0, 0, 0), **font_kwargs)

    # 2. Redact stray 111 and footer splices on remaining pages
    splices = {
        1: "111 Mirus",
        2: "111 Mirus MedSciences Private Limited,",
        3: "111 Mirus",
        4: "111 Mirus MedSciences Private",
        7: "111 Mirus"
    }

    for page_idx, query in splices.items():
        page = doc[page_idx]
        for r in page.search_for(query):
            if r.y0 < 770:
                pad_rect = fitz.Rect(r.x0 - 2, r.y0 - 2, min(570, r.x1 + 10), r.y1 + 2)
                page.add_redact_annot(pad_rect, fill=(1, 1, 1))
        page.apply_redactions()

    # 3. Page 10: Clean Appealing Execution Block with Dedicated Signature Space
    p10 = doc[9]
    p10.add_redact_annot(fitz.Rect(40, 200, 560, 470), fill=None)
    for r in p10.search_for("111"):
        if r.y0 >= 770:
            p10.add_redact_annot(r, fill=blue_bg)
        else:
            p10.add_redact_annot(r, fill=(1, 1, 1))
    p10.apply_redactions()

    p10.insert_text(fitz.Point(50, 215), "IN WITNESS WHEREOF THE parties hereto have duly executed these presents on the date first above mentioned.", fontsize=10.5, color=(0, 0, 0), **font_kwargs)

    # Company Tier
    p10.insert_text(fitz.Point(50, 252), "Signed and Delivered on behalf of Company:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)
    p10.insert_text(fitz.Point(330, 252), "In the presence of Witness:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)

    p10.insert_text(fitz.Point(50, 268), "M/s. MIRUS MED SCIENCES (OPC) PVT LTD", fontsize=10.0, color=(0, 0, 0), **font_kwargs_bd)
    p10.insert_text(fitz.Point(330, 268), "Mr. {{companyWitness}}", fontsize=10.0, color=(0, 0, 0), **font_kwargs)

    p10.draw_line(fitz.Point(50, 316), fitz.Point(280, 316), color=(0.35, 0.35, 0.35), width=0.7)
    p10.draw_line(fitz.Point(330, 316), fitz.Point(540, 316), color=(0.35, 0.35, 0.35), width=0.7)

    p10.insert_text(fitz.Point(50, 330), "Through its Managing Director: Mr. U. MAHIPAL REDDY", fontsize=9.5, color=(0.1, 0.1, 0.1), **font_kwargs)
    p10.insert_text(fitz.Point(330, 330), "Signature of Witness", fontsize=9.0, color=(0.4, 0.4, 0.4), **font_kwargs)

    # Agent Tier
    p10.insert_text(fitz.Point(50, 380), "Signed and Delivered on behalf of Agent:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)
    p10.insert_text(fitz.Point(330, 380), "In the presence of Witness:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)

    p10.insert_text(fitz.Point(50, 396), "M/s. {{partyName}}", fontsize=10.0, color=(0, 0, 0), **font_kwargs_bd)
    p10.insert_text(fitz.Point(330, 396), "Mr. {{agentWitness}}", fontsize=10.0, color=(0, 0, 0), **font_kwargs)

    p10.draw_line(fitz.Point(50, 444), fitz.Point(280, 444), color=(0.35, 0.35, 0.35), width=0.7)
    p10.draw_line(fitz.Point(330, 444), fitz.Point(540, 444), color=(0.35, 0.35, 0.35), width=0.7)

    p10.insert_text(fitz.Point(50, 458), "Through its Partner: Mr. {{partnerName}}", fontsize=9.5, color=(0.1, 0.1, 0.1), **font_kwargs)
    p10.insert_text(fitz.Point(330, 458), "Signature of Witness", fontsize=9.0, color=(0.4, 0.4, 0.4), **font_kwargs)

    # 4. Handle footer 111 on blue banners for pages 6, 7, 9 (indices 5, 6, 8)
    for page_idx in [5, 6, 8]:
        page = doc[page_idx]
        for r in page.search_for("111"):
            if r.y0 >= 770:
                page.add_redact_annot(r, fill=blue_bg)
            else:
                page.add_redact_annot(r, fill=(1, 1, 1))
        page.apply_redactions()

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    doc.save(dest_path)
    doc.close()
    print("Successfully prepared clean 10-page master template at:", dest_path)

if __name__ == '__main__':
    prepare_template()
