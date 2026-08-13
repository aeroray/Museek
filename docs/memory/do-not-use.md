# Do Not Use

## Sibling download cover temp files

Do not write `*.museek-cover.tmp` next to downloaded audio, and do not stage covers through frontend `tempDir()` + plugin-fs. Frontend remove may lack scope, and a failed temp write was reported as a tag-write failure. Send cover bytes in the embed command instead.

## MP3/FLAC-only download tag writing

Do not refuse tag embedding just because the file is not MPEG or FLAC. lx-music sources often return M4A (`ftyp`) for 320k and even "FLAC" requests; those files play, but ID3-only writing always fails.

## Lofty work files with a `.tmp` extension

Do not copy audio to `*.tmp` before `lofty::read_from_path`. Probe::open() uses only the path extension, so `.tmp` becomes "failed to parse file" even for a valid MP3. Keep the original audio extension, or call `guess_file_type()` from content.

## Tag a file plugin-fs just wrote

Do not let Rust `std::fs` open or overwrite a file that plugin-fs just wrote — AppData staging failed the same way as Downloads (Windows os error 5; macOS can hit the same lock or TCC race). Tag in a lofty memory cursor and write the user file once with plugin-fs.

