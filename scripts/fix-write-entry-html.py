from pathlib import Path

p = Path(__file__).resolve().parent.parent / "templates" / "write-entry.html"
text = p.read_text(encoding="utf-8")

tag = "div"

gallery = f"""
                <{tag} class="entry-gallery-pane write-entry-photos-panel" id="writeEntryPhotosPanel">
                    <p class="write-entry-photos-panel__label">Photos</p>
                    <{tag} class="entry-gallery-pane__stack">
                        <{tag} class="entry-gallery-scroll" id="entryGalleryScroll">
                            <{tag} class="entry-gallery diari-scrollbar" id="entryGallery"></{tag}>
                        </{tag}>
                        <{tag} class="entry-gallery-pane__sticky">
                            <{tag} class="entry-gallery-toolbar" id="entryGalleryToolbar" hidden>
                                <button type="button" class="entry-gallery-toolbar__btn" id="addPhotosBtn">
                                    <i class="bi bi-images"></i>
                                    <span>Add Photos</span>
                                </button>
                            </{tag}>
                            <button type="button" class="entry-gallery-add-sticky" id="entryGalleryStickyAdd" hidden>
                                <i class="bi bi-plus-lg" aria-hidden="true"></i>
                                <span>Add more photos</span>
                            </button>
                        </{tag}>
                    </{tag}>
                </{tag}>
"""

topbar_marker = '                <div class="entry-gallery-pane write-entry-photos-panel" id="writeEntryPhotosPanel">'
if topbar_marker in text:
    start = text.index(topbar_marker)
    end = text.index('            <div class="mobile-app-topbar__search-expand"', start)
    text = text[:start] + text[end:]

insert_marker = "                </div>\n            </div>\n            \n            <!-- Action Buttons -->"
if insert_marker not in text:
    raise SystemExit("insert marker not found")

replacement = (
    "                </div>\n"
    + gallery
    + "\n                </div>\n"
    "            </div>\n"
    "\n            <!-- Action Buttons -->"
)
text = text.replace(insert_marker, replacement, 1)

p.write_text(text, encoding="utf-8", newline="\r\n")
print("fixed", p)
