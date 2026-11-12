"""Builds small but realistic PDFs for tests (headings in a larger font, body paragraphs)."""

import pymupdf

BACKPROP = [
    "Backpropagation computes the gradient of the loss function with respect to every weight of a neural "
    "network. It applies the chain rule of calculus layer by layer, starting from the output layer and moving "
    "backwards towards the input.",
    "The chain rule states that the derivative of a composed function is the product of the derivatives of its "
    "parts. In a network, each layer is one function in that composition, which is why gradients can be "
    "propagated backwards efficiently.",
    "Computing gradients and updating weights are separate steps. Backpropagation only computes the gradients; "
    "an optimizer such as gradient descent then uses them to update the weights.",
]
PHOTOSYNTHESIS = [
    "Photosynthesis is the process by which green plants convert light energy into chemical energy. Chlorophyll "
    "in the chloroplasts absorbs sunlight, mostly in the blue and red wavelengths.",
    "During the light-dependent reactions, water molecules are split and oxygen is released. The Calvin cycle "
    "then fixes carbon dioxide into glucose using ATP and NADPH.",
]
MARKETS = [
    "In a competitive market, the price of a good is set where supply equals demand. When demand rises and "
    "supply stays fixed, the equilibrium price increases.",
    "Price elasticity of demand measures how strongly the quantity demanded reacts to a change in price.",
]


def make_pdf(path, sections: list[tuple[str, list[str]]], *, blank_pages: int = 0, toc: bool = False) -> str:
    doc = pymupdf.open()
    toc_entries = []
    for title, paragraphs in sections:
        page = doc.new_page()
        y = 72
        page.insert_text((72, y), title, fontsize=20)
        toc_entries.append([1, title, doc.page_count])
        y += 36
        for para in paragraphs:
            rect = pymupdf.Rect(72, y, 520, y + 160)
            page.insert_textbox(rect, para, fontsize=11)
            y += 120
    for _ in range(blank_pages):
        doc.new_page()
    if toc:
        doc.set_toc(toc_entries)
    doc.save(str(path))
    doc.close()
    return str(path)


def course_pdf(path, **kwargs) -> str:
    return make_pdf(path, [("Backpropagation", BACKPROP), ("Photosynthesis", PHOTOSYNTHESIS),
                           ("Supply and demand", MARKETS)], **kwargs)
