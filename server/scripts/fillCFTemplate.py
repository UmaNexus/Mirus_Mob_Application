import sys
import json
import os
import fitz  # PyMuPDF

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

def fill_cf_template(template_path, fields_path, out_path):
    with open(fields_path, 'r', encoding='utf-8') as f:
        fields = json.load(f)

    doc = fitz.open(template_path)
    font_regular, font_bold = get_font_paths()
    font_obj = fitz.Font(fontfile=font_regular) if font_regular else None
    font_kwargs_reg = {'fontname': 'trebuc', 'fontfile': font_regular} if font_regular else {'fontname': 'helv'}
    font_kwargs_bd = {'fontname': 'trebuc_bd', 'fontfile': font_bold} if font_bold else {'fontname': 'helv'}

    # Key resolution dictionary with canonical and alias support
    party_name = fields.get('partyName') or fields.get('NamedAgent') or 'C&F Agency'
    party_pan = fields.get('partyPan') or fields.get('PAN1') or '—'
    party_addr = fields.get('partyAddress') or fields.get('RegisteredOffice') or '—'
    partner_name = fields.get('partnerName') or fields.get('Partner') or '—'
    partner_pan = fields.get('partnerPan') or fields.get('PAN2') or '—'
    territory = fields.get('territory') or fields.get('State') or '—'
    effective_from = fields.get('effectiveFrom') or fields.get('Dateofappointment') or '—'
    effective_to = fields.get('effectiveTo') or fields.get('Endofappointment') or '—'
    witness = fields.get('companyWitness') or fields.get('witness') or fields.get('agentWitness') or '—'

    # Helper for tight transparent redaction of phrases
    def redact_phrase_transparent(page, phrase):
        rects = page.search_for(phrase)
        for r in rects:
            tight_r = fitz.Rect(r.x0, r.y0 + 0.8, r.x1, r.y1 - 0.8)
            page.add_redact_annot(tight_r, fill=None)
        return rects

    # --- 1. PAGE 1: PREAMBLE & CLAUSES SEAMLESS REDRAWING ---
    p1 = doc[0]

    # Clean Preamble zone (white background, no watermark)
    p1.add_redact_annot(fitz.Rect(25, 202, 580, 280), fill=(1, 1, 1))

    # Redact Clause B with fill=None (TRANSPARENT, watermark preserved)
    r_cl_b = redact_phrase_transparent(p1, 'in the State of {{State}} and the') or \
             redact_phrase_transparent(p1, 'in the State of {{territory}} and the')

    # Redact Clause 1 line 1 with fill=None
    r_cl_1 = redact_phrase_transparent(p1, 'for the State of {{State}} upon the terms and conditions hereinafter') or \
             redact_phrase_transparent(p1, 'for the State of {{territory}} upon the terms and conditions hereinafter')

    # Redact Clause 2 lines with fill=None
    r_cl_2a = redact_phrase_transparent(p1, 'effective from {{Dateofappointment}} and shall be in force for a') or \
              redact_phrase_transparent(p1, 'effective from {{effectiveFrom}} and shall be in force for a')

    r_cl_2b = redact_phrase_transparent(p1, 'period up to {{Endofappointment}}, unless earlier determined by the Company in the manner hereinafter set') or \
              redact_phrase_transparent(p1, 'period up to {{effectiveTo}}, unless earlier determined by the Company in the manner hereinafter set')

    # Redact stray 111 on Page 1
    for r in p1.search_for('111'):
        if r.y0 < 770:
            p1.add_redact_annot(fitz.Rect(r.x0, r.y0, r.x1, r.y1), fill=(1, 1, 1))

    p1.apply_redactions()

    # Redraw Preamble as continuous, justified legal paragraph matching First Party
    preamble_full = (
        f"M/s. {party_name} (PAN: {party_pan}) having its Registered Office at {party_addr} "
        f"duly represented by its Partner, {partner_name} (PAN: {partner_pan}) "
        "(hereinafter referred to as the 'Agent' (which expression shall unless it be repugnant to the context or "
        "meaning thereof will mean and include its successors and assigns) of the Other Part;"
    )
    words = preamble_full.split()
    p_lines = []
    cur = ''
    for w in words:
        test = f"{cur} {w}" if cur else w
        w_len = font_obj.text_length(test, fontsize=11.039) if font_obj else len(test) * 6.2
        if w_len > 548 and cur:
            p_lines.append(cur)
            cur = w
        else:
            cur = test
    if cur:
        p_lines.append(cur)

    cur_y = 217.5
    for ln in p_lines:
        p1.insert_text(fitz.Point(27.12, cur_y), ln, fontsize=11.039, color=(0, 0, 0), **font_kwargs_reg)
        cur_y += 12.72

    # Redraw Clause B seamlessly over watermark
    if r_cl_b:
        p1.insert_text(fitz.Point(r_cl_b[0].x0, r_cl_b[0].y1 - 2.89), f"in the State of {territory} and the", fontsize=11.039, color=(0, 0, 0), **font_kwargs_reg)

    # Redraw Clause 1 seamlessly over watermark
    if r_cl_1:
        p1.insert_text(fitz.Point(r_cl_1[0].x0, r_cl_1[0].y1 - 2.89), f"for the State of {territory} upon the terms and conditions hereinafter", fontsize=11.039, color=(0, 0, 0), **font_kwargs_reg)

    # Redraw Clause 2 seamlessly over watermark
    if r_cl_2a:
        p1.insert_text(fitz.Point(r_cl_2a[0].x0, r_cl_2a[0].y1 - 2.89), f"effective from {effective_from} and shall be in force for a", fontsize=11.039, color=(0, 0, 0), **font_kwargs_reg)
    if r_cl_2b:
        p1.insert_text(fitz.Point(r_cl_2b[0].x0, r_cl_2b[0].y1 - 2.89), f"period up to {effective_to}, unless earlier determined by the Company in the manner hereinafter set", fontsize=11.039, color=(0, 0, 0), **font_kwargs_reg)

    # --- 2. FALLBACK INLINE REPLACEMENTS FOR PAGES 1 TO 9 ---
    inline_map = {
        '{{territory}}': territory,
        '{{State}}': territory,
        '{{Dateofappointment}}': effective_from,
        '{{effectiveFrom}}': effective_from,
        '{{Endofappointment}}': effective_to,
        '{{effectiveTo}}': effective_to,
        '{{partyName}}': party_name,
        '{{partyPan}}': party_pan,
        '{{partyAddress}}': party_addr,
        '{{partnerName}}': partner_name,
        '{{partnerPan}}': partner_pan,
    }

    for page_idx in range(len(doc) - 1):
        page = doc[page_idx]
        found_any = False
        for ph, val in inline_map.items():
            rects = page.search_for(ph)
            for r in rects:
                tight_r = fitz.Rect(r.x0, r.y0 + 0.8, r.x1, r.y1 - 0.8)
                page.add_redact_annot(tight_r, fill=None)
                found_any = True
        if found_any:
            page.apply_redactions()

    # --- 3. PAGE 10: ELEGANT EXECUTION BLOCK WITH AMPLE SIGNATURE SPACE ---
    p10 = doc[9]

    # Resolve witnesses for company and agent
    company_witness = fields.get('companyWitness') or fields.get('witness') or 'Mr. K. S. Narayanan (VP Operations)'
    agent_witness = fields.get('agentWitness') or fields.get('witness') or 'Mr. P. R. Deshmukh'

    # Transparent redaction of old execution block (watermark preserved completely!)
    p10.add_redact_annot(fitz.Rect(40, 200, 560, 470), fill=None)

    # Footer stray 111 on Page 10
    for r in p10.search_for('111'):
        if r.y0 >= 770:
            p10.add_redact_annot(r, fill=(22/255, 55/255, 94/255))
        else:
            p10.add_redact_annot(r, fill=(1, 1, 1))

    p10.apply_redactions()

    # Intro line
    p10.insert_text(fitz.Point(50, 215), "IN WITNESS WHEREOF THE parties hereto have duly executed these presents on the date first above mentioned.", fontsize=10.5, color=(0, 0, 0), **font_kwargs_reg)

    # --- COMPANY TIER ---
    y = 252
    p10.insert_text(fitz.Point(50, y), "Signed and Delivered on behalf of Company:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)
    p10.insert_text(fitz.Point(330, y), "In the presence of Witness:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)

    y += 16
    p10.insert_text(fitz.Point(50, y), "M/s. MIRUS MED SCIENCES (OPC) PVT LTD", fontsize=10.0, color=(0, 0, 0), **font_kwargs_bd)
    cw_str = company_witness if company_witness.startswith("Mr.") else f"Mr. {company_witness}"
    p10.insert_text(fitz.Point(330, y), cw_str, fontsize=10.0, color=(0, 0, 0), **font_kwargs_reg)

    y += 48
    p10.draw_line(fitz.Point(50, y), fitz.Point(280, y), color=(0.35, 0.35, 0.35), width=0.7)
    p10.draw_line(fitz.Point(330, y), fitz.Point(540, y), color=(0.35, 0.35, 0.35), width=0.7)

    y += 14
    p10.insert_text(fitz.Point(50, y), "Through its Managing Director: Mr. U. MAHIPAL REDDY", fontsize=9.5, color=(0.1, 0.1, 0.1), **font_kwargs_reg)
    p10.insert_text(fitz.Point(330, y), "Signature of Witness", fontsize=9.0, color=(0.4, 0.4, 0.4), **font_kwargs_reg)

    # --- AGENT TIER ---
    y += 50
    p10.insert_text(fitz.Point(50, y), "Signed and Delivered on behalf of Agent:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)
    p10.insert_text(fitz.Point(330, y), "In the presence of Witness:", fontsize=10.5, color=(0.08, 0.20, 0.38), **font_kwargs_bd)

    y += 16
    p10.insert_text(fitz.Point(50, y), f"M/s. {party_name}", fontsize=10.0, color=(0, 0, 0), **font_kwargs_bd)
    aw_str = agent_witness if agent_witness.startswith("Mr.") else f"Mr. {agent_witness}"
    p10.insert_text(fitz.Point(330, y), aw_str, fontsize=10.0, color=(0, 0, 0), **font_kwargs_reg)

    y += 48
    p10.draw_line(fitz.Point(50, y), fitz.Point(280, y), color=(0.35, 0.35, 0.35), width=0.7)
    p10.draw_line(fitz.Point(330, y), fitz.Point(540, y), color=(0.35, 0.35, 0.35), width=0.7)

    y += 14
    p_str = partner_name if partner_name.startswith("Mr.") else f"Mr. {partner_name}"
    p10.insert_text(fitz.Point(50, y), f"Through its Partner: {p_str}", fontsize=9.5, color=(0.1, 0.1, 0.1), **font_kwargs_reg)
    p10.insert_text(fitz.Point(330, y), "Signature of Witness", fontsize=9.0, color=(0.4, 0.4, 0.4), **font_kwargs_reg)

    # --- 4. APPEND SCHEDULE I (PAGE 11) IN TREBUCHET MS ---
    sched_page = doc.new_page(width=595.28, height=841.89)

    # Header
    sched_page.insert_text(fitz.Point(48, 50), "MIRUS MED SCIENCES (OPC) PVT LTD — CLEARING & FORWARDING AGENCY AGREEMENT", fontsize=7.5, color=(0.35, 0.35, 0.38), **font_kwargs_reg)
    sched_page.draw_line(fitz.Point(48, 56), fitz.Point(547.28, 56), color=(0.8, 0.8, 0.85), width=0.5)

    sched_page.insert_text(fitz.Point(48, 85), "SCHEDULE I: APPOINTMENT PARTICULARS & COMMERCIAL TERMS", fontsize=13, color=(0.12, 0.22, 0.45), **font_kwargs_bd)
    sched_page.insert_text(fitz.Point(48, 102), "C&F Agency Agreement — Executed Particulars", fontsize=9.5, color=(0.3, 0.3, 0.3), **font_kwargs_reg)

    execution_date = " ".join(filter(None, [str(fields.get('agreementDay', '')), str(fields.get('agreementMonth', '')), f"20{fields.get('agreementYear')}" if fields.get('agreementYear') else ''])).strip() or "As Executed"

    particulars = [
        ("C&F Agency Name", party_name),
        ("Agency PAN", party_pan),
        ("Authorized Partner / Signatory", partner_name),
        ("Partner PAN", partner_pan),
        ("Registered Office / Address", party_addr),
        ("Assigned Territory", territory),
        ("Effective Period", f"{effective_from} to {effective_to}"),
        ("Agreement Execution Date", execution_date),
        ("Place of Execution", fields.get("agreementPlace", "Hyderabad")),
        ("Minimum Warehouse Space", fields.get("warehouseArea", "1,000 sq. ft.")),
        ("Token / Security Deposit", fields.get("securityDeposit", "50 LAKH (@ 5% p.a.)")),
        ("Agency Commission Rate", fields.get("commission", "1.40% / Rs 1 Lakh")),
        ("Witness 1 (Company)", fields.get("companyWitness", witness)),
        ("Witness 2 (Agent)", fields.get("agentWitness", witness))
    ]

    cur_y = 130
    for lbl, val in particulars:
        val_str = str(val)
        val_lines = []
        if font_obj and font_obj.text_length(val_str, fontsize=9) > 310:
            words = val_str.split()
            cur = ''
            for w in words:
                t = f"{cur} {w}" if cur else w
                if font_obj.text_length(t, fontsize=9) > 310 and cur:
                    val_lines.append(cur)
                    cur = w
                else:
                    cur = t
            if cur:
                val_lines.append(cur)
        else:
            val_lines = [val_str]

        row_h = max(22, 10 + len(val_lines) * 12)
        rect = fitz.Rect(48, cur_y, 547.28, cur_y + row_h)
        sched_page.draw_rect(rect, color=None, fill=(0.96, 0.97, 0.99))
        sched_page.insert_text(fitz.Point(56, cur_y + 14), lbl, fontsize=9, color=(0.15, 0.2, 0.3), **font_kwargs_bd)

        vy = cur_y + 14
        for vln in val_lines:
            sched_page.insert_text(fitz.Point(230, vy), vln, fontsize=9, color=(0.1, 0.1, 0.1), **font_kwargs_reg)
            vy += 12

        cur_y += (row_h + 3)

    cur_y += 25
    company_name = "MIRUS MED SCIENCES (OPC) PVT LTD"
    sched_page.insert_text(fitz.Point(48, cur_y), f"For {company_name}", fontsize=10, color=(0.1, 0.1, 0.1), **font_kwargs_bd)
    sched_page.insert_text(fitz.Point(330, cur_y), f"For {party_name}", fontsize=10, color=(0.1, 0.1, 0.1), **font_kwargs_bd)
    cur_y += 40
    sched_page.draw_line(fitz.Point(48, cur_y), fitz.Point(230, cur_y), color=(0.5, 0.5, 0.5), width=0.8)
    sched_page.draw_line(fitz.Point(330, cur_y), fitz.Point(512, cur_y), color=(0.5, 0.5, 0.5), width=0.8)
    cur_y += 14
    sched_page.insert_text(fitz.Point(48, cur_y), "Authorized Signatory", fontsize=9, color=(0.3, 0.3, 0.3), **font_kwargs_reg)
    sched_page.insert_text(fitz.Point(330, cur_y), "Authorized Signatory / Partner", fontsize=9, color=(0.3, 0.3, 0.3), **font_kwargs_reg)

    # Footer
    sched_page.draw_line(fitz.Point(48, 800), fitz.Point(547.28, 800), color=(0.8, 0.8, 0.85), width=0.5)
    sched_page.insert_text(fitz.Point(48, 814), "Mirus MedSciences Private Limited | Sainagar, Changicherla, Hyderabad - 500092 | CIN: U46497TS2026OPC212119", fontsize=6.5, color=(0.35, 0.35, 0.38), **font_kwargs_reg)
    sched_page.insert_text(fitz.Point(500, 814), f"Page {len(doc)} of {len(doc)}", fontsize=7, color=(0.35, 0.35, 0.38), **font_kwargs_reg)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    doc.save(out_path)
    doc.close()
    print(f"Successfully generated filled C&F agreement at: {out_path}")

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python fillCFTemplate.py <template_path> <fields_json_path> <out_path>")
        sys.exit(1)
    fill_cf_template(sys.argv[1], sys.argv[2], sys.argv[3])
