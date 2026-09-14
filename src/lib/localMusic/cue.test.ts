import {
  applyCueDurations,
  cueIndexToSeconds,
  decodeCueBytes,
  joinCueDir,
  parseCueSheet,
  pathKey,
} from "./cue";

const ZHANG_QIANG_CUE = `FILE "张蔷.-.1985-12-01.-.再来一次春天.-.山西音像.flac" WAVE
REM DURATION 0000000.000 milliseconds
  TRACK 01 AUDIO
    TITLE "再来一次春天"
    PERFORMER "张蔷"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "当你飞过那方"
    PERFORMER "张蔷"
    INDEX 01 03:13:63
  TRACK 03 AUDIO
    TITLE "遥远的钟声"
    PERFORMER "张蔷"
    INDEX 01 06:15:70
  TRACK 04 AUDIO
    TITLE "就要挥别"
    PERFORMER "张蔷"
    INDEX 01 09:26:44
  TRACK 05 AUDIO
    TITLE "想思好比小蚂蚁"
    PERFORMER "张蔷"
    INDEX 01 12:38:10
  TRACK 06 AUDIO
    TITLE "就这样让你流走"
    PERFORMER "张蔷"
    INDEX 01 15:32:10
  TRACK 07 AUDIO
    TITLE "你的眼，你的泪"
    PERFORMER "张蔷"
    INDEX 01 20:08:74
  TRACK 08 AUDIO
    TITLE "快乐今宵"
    PERFORMER "张蔷"
    INDEX 01 22:34:06
  TRACK 09 AUDIO
    TITLE "阳光在照耀"
    PERFORMER "张蔷"
    INDEX 01 25:31:67
  TRACK 10 AUDIO
    TITLE "街头"
    PERFORMER "张蔷"
    INDEX 01 28:59:18
  TRACK 11 AUDIO
    TITLE "离我远去"
    PERFORMER "张蔷"
    INDEX 01 32:56:56
  TRACK 12 AUDIO
    TITLE "流云，轻烟"
    PERFORMER "张蔷"
    INDEX 01 36:29:60
  TRACK 13 AUDIO
    TITLE "请你别忘记"
    PERFORMER "张蔷"
    INDEX 01 40:43:50
`;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

export function runCueParserTests() {
  assert(
    Math.abs(cueIndexToSeconds("03:13:63") - (3 * 60 + 13 + 63 / 75)) < 1e-9,
    "INDEX 01 03:13:63 should use CD frames (75 fps)",
  );
  assert(
    Number.isNaN(cueIndexToSeconds("03:13:75")),
    "frame 75 is invalid",
  );

  const sheet = parseCueSheet(ZHANG_QIANG_CUE);
  assert(sheet.files.length === 1, "one FILE group");
  assert(sheet.files[0]?.tracks.length === 13, "13 AUDIO tracks");
  assert(sheet.files[0]?.tracks[0]?.title === "再来一次春天", "track 1 title");
  assert(sheet.files[0]?.tracks[1]?.performer === "张蔷", "track 2 performer");
  assert(
    Math.abs((sheet.files[0]?.tracks[1]?.index01 ?? 0) - (3 * 60 + 13 + 63 / 75)) <
      1e-9,
    "track 2 start",
  );

  const fileName = sheet.files[0]!.fileName;
  const filePath = joinCueDir("D:/album", fileName);
  const pending = sheet.files[0]!.tracks.map((track, i, all) => ({
    id: `t${track.trackNo}`,
    filePath,
    cueSheetPath: "D:/album/a.cue",
    trackNo: track.trackNo,
    title: track.title,
    performer: track.performer,
    albumTitle: sheet.albumTitle,
    start: track.index01,
    nextStart: all[i + 1]?.index01 ?? Number.POSITIVE_INFINITY,
    multi: true,
  }));
  const duration = 44 * 60 + 10;
  const tracks = applyCueDurations(
    pending,
    new Map([[pathKey(filePath), duration]]),
  );
  assert(tracks.length === 13, "all tracks kept");
  assert(tracks[0]?.clipStart === 0, "first clip starts at 0");
  assert(
    Math.abs((tracks[0]?.clipEnd ?? 0) - (3 * 60 + 13 + 63 / 75)) < 1e-9,
    "first clip ends at track 2 INDEX 01",
  );
  assert(
    Math.abs((tracks[12]?.clipEnd ?? 0) - duration) < 1e-9,
    "last clip ends at file duration",
  );

  const decoded = decodeCueBytes(new TextEncoder().encode(ZHANG_QIANG_CUE));
  assert(parseCueSheet(decoded).files[0]?.tracks.length === 13, "utf-8 decode");

  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("TITLE \"A\"\n")]);
  assert(parseCueSheet(decodeCueBytes(bom)).albumTitle === "A", "utf-8 bom");
}

runCueParserTests();
