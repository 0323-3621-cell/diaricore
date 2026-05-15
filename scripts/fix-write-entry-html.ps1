$file = Resolve-Path (Join-Path $PSScriptRoot '..\templates\write-entry.html')
$text = [System.IO.File]::ReadAllText($file)

$gallery = @'
                <div class="entry-gallery-pane write-entry-photos-panel" id="writeEntryPhotosPanel">
                    <p class="write-entry-photos-panel__label">Photos</p>
                    <div class="entry-gallery-pane__stack">
                        <motion class="entry-gallery-scroll" id="entryGalleryScroll">
                            <div class="entry-gallery diari-scrollbar" id="entryGallery"></motion>
                        </motion>
                        <div class="entry-gallery-pane__sticky">
                            <div class="entry-gallery-toolbar" id="entryGalleryToolbar" hidden>
                                <button type="button" class="entry-gallery-toolbar__btn" id="addPhotosBtn">
                                    <i class="bi bi-images"></i>
                                    <span>Add Photos</span>
                                </button>
                            </motion>
                            <button type="button" class="entry-gallery-add-sticky" id="entryGalleryStickyAdd" hidden>
                                <i class="bi bi-plus-lg" aria-hidden="true"></i>
                                <span>Add more photos</span>
                            </button>
                        </motion>
                    </motion>
                </motion>
'@

# Normalize any accidental tag typos to div
$gallery = $gallery -replace '<motion\b', '<div' -replace '</motion>', '</div>'

$startMarker = '                        <div class="entry-gallery-pane">'
$endMarker = '                    <div class="journal-footer">'
$start = $text.IndexOf($startMarker)
$end = $text.IndexOf($endMarker)
if ($start -lt 0 -or $end -lt 0) {
    throw "Markers not found (start=$start end=$end)"
}

$text = $text.Remove($start, $end - $start)

# After journal-container closes, insert gallery then close write-entry-stack
$journalClose = "                </div>`r`n            </motion>"
$journalClose = "                </div>`r`n            </div>"
$pos = $text.IndexOf($journalClose)
if ($pos -lt 0) {
    $journalClose = "                </div>`n            </div>"
    $pos = $text.IndexOf($journalClose)
}
if ($pos -lt 0) { throw 'journal-container close not found' }

$insertAt = $pos + "                </div>".Length
$nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
$chunk = $nl + $gallery + $nl + "                </div>" + $nl
$text = $text.Insert($insertAt, $chunk)

[System.IO.File]::WriteAllText($file, $text)
Write-Host "OK: restructured write-entry photos panel"
