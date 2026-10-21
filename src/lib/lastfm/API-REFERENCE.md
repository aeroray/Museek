# Last.fm API — Implementation Reference

Compiled from the official docs at `www.last.fm/api` on 2026-09-28. Every claim below is
sourced; anything the docs do not state is explicitly marked **NOT DOCUMENTED**.

**Sources fetched:**
[API root](https://www.last.fm/api) ·
[Auth Spec](https://www.last.fm/api/authspec) ·
[Desktop How-To](https://www.last.fm/api/desktopauth) ·
[Web How-To](https://www.last.fm/api/webauth) ·
[Scrobbling 2.0](https://www.last.fm/api/scrobbling) ·
[REST Requests](https://www.last.fm/api/rest) ·
[Introduction](https://www.last.fm/api/intro) ·
[Error Codes](https://www.last.fm/api/errorcodes) ·
[track.scrobble](https://www.last.fm/api/show/track.scrobble) ·
[track.updateNowPlaying](https://www.last.fm/api/show/track.updateNowPlaying) ·
[user.getRecentTracks](https://www.last.fm/api/show/user.getRecentTracks) ·
[user.getTopArtists](https://www.last.fm/api/show/user.getTopArtists) ·
[user.getTopTracks](https://www.last.fm/api/show/user.getTopTracks) ·
[user.getInfo](https://www.last.fm/api/show/user.getInfo) ·
[auth.getToken](https://www.last.fm/api/show/auth.getToken) ·
[auth.getSession](https://www.last.fm/api/show/auth.getSession) ·
[API ToS](https://www.last.fm/api/tos)

> **Note on doc URLs:** `https://www.last.fm/api/auth` is **not** a documentation page — it is the
> live user-authorization endpoint and redirects anonymous visitors to a login page. The auth
> documentation lives at `/api/authentication`, `/api/authspec`, `/api/desktopauth`, and
> `/api/webauth`. `/api/scrobbling` is a real doc page.

---

## 1. Base URLs and transport

| Item | Value | Source |
|---|---|---|
| API root (as documented) | `http://ws.audioscrobbler.com/2.0/` | [REST](https://www.last.fm/api/rest), [Intro](https://www.last.fm/api/intro) |
| API root over TLS | `https://ws.audioscrobbler.com/2.0/` — **works**, but is never shown in the docs | empirical, see below |
| User authorization page | `http://www.last.fm/api/auth/?api_key=…&token=…` | [Auth Spec §4.2](https://www.last.fm/api/authspec) |
| Web auth page | `http://www.last.fm/api/auth/?api_key=…` | [Auth Spec §3.1](https://www.last.fm/api/authspec) |
| Auth page, custom callback | `http://www.last.fm/api/auth/?api_key=xxx&cb=http://example.com` | [Web How-To §2.1](https://www.last.fm/api/webauth) |

**HTTPS:** the docs only ever print `http://` for the API root — a scan of every fetched page found
zero occurrences of `https://ws.audioscrobbler.com`. HTTPS is nonetheless live: a request to
`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=rj&api_key=INVALID&format=json`
returned `HTTP/1.1 403` with `server: openresty`, `Alt-Svc: h3=":443"`, and a valid JSON error body.
The docs do not state a policy on HTTP vs HTTPS, so this is **empirical, not documented** — use HTTPS.

**Transport rules** ([REST](https://www.last.fm/api/rest), [Scrobbling 2.0](https://www.last.fm/api/scrobbling)):
- Read methods: HTTP `GET` against the root with query-string params.
- **All write methods** (`track.scrobble`, `track.updateNowPlaying`, `track.love`, `track.unlove`, tag methods): HTTP `POST` to the root, with **all parameters — including `method` — in the POST body**.
- Content type: form-urlencoded (`application/x-www-form-urlencoded`), **UTF-8** encoded.
- `api_key` and `method` are required on every call.
- Docs explicitly recommend an identifiable `User-Agent` header: *"This helps our logging and reduces the risk of you getting banned."* ([Intro](https://www.last.fm/api/intro))

**Response formats:**
- Default is Last.fm-idiom XML. `format=json` requests JSON; `callback=<name>` wraps it as JSONP (`text/javascript` instead of `application/json`). ([REST](https://www.last.fm/api/rest))
- XML is wrapped in `<lfm status="ok|failed">`. `raw=true` strips the wrapper.
- **JSON error shape is different from success** — it is a flat object:
  ```json
  { "error": 10, "message": "Invalid API Key" }
  ```
  confirmed live (the test request above returned exactly this shape).
- JSON success conversion rules: XML attributes become string members keyed by attribute name; if an
  element has both attributes and text, the text goes in `#text`; repeated children become arrays.
  All values are **strings** (e.g. `"playcount": "1337"`) — expect to parse numbers yourself.

---

## 2. Authentication

### 2.1 Desktop flow, step by step

Sources: [Auth Spec §4](https://www.last.fm/api/authspec), [Desktop How-To](https://www.last.fm/api/desktopauth).

**Step 0 — credentials.** Apply for an API account. You get a 32-character **API key** and a
**shared secret**. The desktop how-to (§1) also says *"You will also need to set up a callback url
which our authentication service will redirect to in Section 4"* — but the desktop flow in §3–§4
never redirects anywhere. Treat that sentence as boilerplate copied from the web how-to; see §2.5.

**Step 1 — fetch a request token** — `auth.getToken`

| Param | Required | Meaning |
|---|---|---|
| `api_key` | yes | Your 32-character API key |
| `api_sig` | yes | Signature (see §2.2) |

Auth required: **no** ("This service does not require authentication"). Response:

```xml
<lfm status="ok">
  <token>cf45fe5a3e3cebe168480a086d7fe481</token>
</lfm>
```

The token is a 32-character lowercase hex MD5-shaped string. At this stage it is **not authorized**
and cannot create a session.

**Step 2 — send the user to authorize** (HTTP `GET`, open a browser):

```
http://www.last.fm/api/auth/?api_key=xxxxxxxxxxx&token=xxxxxxxx
```

If the user is not logged in they are redirected to the login page first. They see your app name,
description, and logo. After granting permission the docs say *"the browser-based process is over
and the user is asked to close their browser and return to your application."*

**Step 3 — exchange the token for a session** — `auth.getSession`

| Param | Required | Meaning |
|---|---|---|
| `token` | yes | The token from step 1, now authorized |
| `api_key` | yes | Your API key |
| `api_sig` | yes | Signature (see §2.2) |

Auth required: **no** ("This service does not require authentication").

### 2.2 The `api_sig` algorithm

Source: [Auth Spec §8](https://www.last.fm/api/authspec) (identical text in [Desktop How-To §6](https://www.last.fm/api/desktopauth) and [Web How-To §6](https://www.last.fm/api/webauth)).

1. Take **all the parameters sent in your call**.
2. **Order them alphabetically by parameter name.**
3. Concatenate into one string using a `<name><value>` scheme — no separators, no `=`, no `&`.
4. Ensure the parameters are **UTF-8** encoded.
5. **Append your shared secret** to the end of that string.
6. **MD5** the result → a **32-character hexadecimal** hash, lowercase.

Worked example straight from the docs, for `auth.getSession` with secret `ilovecher`:

```
api_keyxxxxxxxxxxmethodauth.getSessiontokenyyyyyy
```

```
api signature = md5("api_keyxxxxxxxxxxmethodauth.getSessiontokenyyyyyyilovecher")
```

Note that `method` **is** part of the signed string — it is a parameter you send.

### 2.3 Parameters excluded from the signature

- **`format` — excluded.** Auth Spec §8: *"You must not include the format and callback parameters."*
- **`callback` — excluded.** Same sentence.
- **`api_sig` itself — excluded.** The spec does not state this in words, but it is self-referential
  (you cannot hash the hash) and every documented example omits it: the `auth.getSession` example
  signs only `api_key`, `method`, `token` even though `api_sig` is a listed required parameter.

No other exclusions are documented.

### 2.4 Array notation and signature ordering (critical for batch scrobbles)

Source: [track.scrobble](https://www.last.fm/api/show/track.scrobble).

> *"Extra care should be taken while calculating the signature when using array notation as the
> parameter names MUST be sorted according to the ASCII table (i.e., `artist[10]` comes before
> `artist[1]`)."*

This is **ASCII/lexicographic** ordering, not numeric. A naive numeric sort of indices produces a
different string and therefore an invalid signature (error 13) for any batch of 11+ scrobbles.
Also note *"Parameter names are case sensitive."*

### 2.5 Callback URL — can a desktop app avoid hosting one?

- **Web applications:** a callback URL is required. The user is redirected to
  `<callback_url>/?token=xxxxxxx`, or `<callback_url>&token=xxxxxxx` if the callback already has a
  query string. `cb=<url>` may override the configured callback per-request.
  ([Auth Spec §2.1, §3.2](https://www.last.fm/api/authspec), [Web How-To §2.1, §3](https://www.last.fm/api/webauth))
- **Desktop applications: effectively yes.** The documented desktop flow has no redirect step. Your
  app holds the token from `auth.getToken`, sends the user to `/api/auth` in a browser, the user
  authorizes, and your app then calls `auth.getSession` with the token it already has. Nothing is
  ever delivered to a callback URL.
- **Polling:** the docs **do not** describe polling `auth.getSession` in a loop, and do not describe
  a deep-link or loopback-listener pattern. However `auth.getSession` documents
  **error 14: "This token has not been authorized"**, which is the signal a polling implementation
  would branch on. The polling pattern is therefore **inferred, not documented** — treat it as an
  implementation choice the docs permit but do not specify.

### 2.6 Token expiry and reusability

| Property | Value | Source |
|---|---|---|
| Token lifetime | **60 minutes** from granting | [Auth Spec §6.1](https://www.last.fm/api/authspec), [Desktop §2.1](https://www.last.fm/api/desktopauth), [Web §3.1](https://www.last.fm/api/webauth) |
| Token reuse | **Single use** — consumed when the session is created | [Auth Spec §6.1](https://www.last.fm/api/authspec), [Desktop §4](https://www.last.fm/api/desktopauth) |
| Token scope | "API account specific" (Auth Spec/Desktop); "user **and** API account specific" (Web) | conflicting wording across pages |
| Session key lifetime | **Infinite by default** | [Auth Spec §6.2](https://www.last.fm/api/authspec), [Desktop §4.1](https://www.last.fm/api/desktopauth) |
| Revocation | Users can revoke your app on their Last.fm settings screen, invalidating session keys | [Auth Spec §6.2](https://www.last.fm/api/authspec) |

Store the session key securely — the docs recommend exactly that.

### 2.7 What `auth.getSession` returns

Source: [auth.getSession](https://www.last.fm/api/show/auth.getSession).

```xml
<lfm status="ok">
  <session>
    <name>MyLastFMUsername</name>
    <key>d580d57f32848f5dcf574d1ce18d78b2</key>
    <subscriber>0</subscriber>
  </session>
</lfm>
```

- `name` — the username.
- `key` — the **session key**, used as the `sk` parameter on authenticated calls.
- `subscriber` — `0`/`1` flag for Last.fm Pro.

The page does not document additional session fields.

### 2.8 Authenticated calls

Send all three on every authenticated call ([Auth Spec §7](https://www.last.fm/api/authspec)):

- `sk` — session key from `auth.getSession`
- `api_key` — your API key
- `api_sig` — signature computed over the call's parameters

`auth.getMobileSession` (username + plaintext password → session) exists but **must be a POST over
HTTPS** ([Auth Spec §5](https://www.last.fm/api/authspec)). Do not use it for a desktop app; it
requires handling the user's raw password.

---

## 3. Scrobbling

### 3.1 When a play counts as a scrobble

Source: [Scrobbling 2.0 §When is a scrobble a scrobble?](https://www.last.fm/api/scrobbling). Verbatim:

> A track should only be scrobbled when the following conditions have been met:
> - The track must be longer than 30 seconds.
> - And the track has been played for at least half its duration, or for 4 minutes (whichever occurs earlier.)

Additional documented rules:
- The scrobble request may be sent **as soon as** those conditions are met; *"It is often most
  convenient to send a scrobble request when a track has finished playing."*
- **Timestamp semantics:** `timestamp` is *"The time the track started playing, in UNIX timestamp
  format … This must be in the UTC time zone."* So it is playback **start**, not completion.
  ([track.scrobble](https://www.last.fm/api/show/track.scrobble))
- *"Do not attempt to determine a track's meta data from its filename. Please only use meta data
  from well-structured sources such as ID3 tags."*
- *"Do not use the corrections returned by the now playing service as input for the scrobble
  request, unless they have been explicitly approved by the user."*

**`chosenByUser` guidance** ([Scrobbling 2.0](https://www.last.fm/api/scrobbling)): ignore it when
the user is scrobbling their own music. Set it to `"false"` when the music is effectively chosen by
someone else (Last.fm radio, a recommendation service, a DJ-hosted radio show). *"If there is any
ambiguity or doubt then don't send this value."*

> **Doc inconsistency:** the prose says set it to `"false"`, while the method page says
> *"Set to 1 if the user chose this song, or 0 if the song was chosen by someone else… Assumes 1 if
> not specified."* For a normal desktop player, simply omit the parameter.

### 3.2 `track.scrobble`

Source: [track.scrobble](https://www.last.fm/api/show/track.scrobble).

**HTTP:** `POST http://ws.audioscrobbler.com/2.0/` (or the HTTPS equivalent), form-urlencoded,
UTF-8, **all parameters including `method` in the POST body**. Authentication **required**.

**Per-scrobble parameters** (index `i`):

| Param | Required | Meaning |
|---|---|---|
| `artist[i]` | **yes** | The artist name |
| `track[i]` | **yes** | The track name |
| `timestamp[i]` | **yes** | When the track **started** playing, UNIX epoch seconds, **UTC** |
| `album[i]` | no | The album name |
| `context[i]` | no | Sub-client version (not public, only enabled for certain API keys) |
| `streamId[i]` | no | Stream id from `radio.getPlaylist`, when scrobbling Last.fm radio |
| `chosenByUser[i]` | no | `1` if the user chose the song, `0` if chosen by someone else. Defaults to `1` |
| `trackNumber[i]` | no | Track number on the album |
| `mbid[i]` | no | The MusicBrainz **Track** ID |
| `albumArtist[i]` | no | Album artist, if it differs from the track artist |
| `duration[i]` | no | Length of the track **in seconds** |

**Global parameters:** `api_key` (required), `api_sig` (required), `sk` (required).
`method=track.scrobble` is required and goes in the POST body.

**Batching:**
- Up to **50 scrobbles per batch**, indices `[0<=i<=49]`.
- Array notation *"may be ommited"* [sic] when sending a single scrobble.
- Batch signing must use **ASCII-sorted** parameter names — see §2.4.
- Docs recommend batching when flushing cached scrobbles. *"Scrobbles should be sent in order,
  therefore cached scrobbles should be sent before new scrobbles."*

**Response (single scrobble):**

```xml
<?xml version='1.0' encoding='utf-8'?>
<lfm status="ok">
  <scrobbles accepted="1" ignored="0">
    <scrobble>
      <track corrected="0">Test Track</track>
      <artist corrected="0">Test Artist</artist>
      <album corrected="0"></album>
      <albumArtist corrected="0"></albumArtist>
      <timestamp>1287140447</timestamp>
      <ignoredMessage code="0"></ignoredMessage>
    </scrobble>
  </scrobbles>
</lfm>
```

**Response attributes:**
- `accepted` — number of accepted scrobbles (on `<scrobbles>`)
- `ignored` — number of ignored scrobbles (on `<scrobbles>`)
- `corrected` — `'1'` if the track/artist/album name was auto-corrected, `'0'` otherwise
- `ignoredMessage code` — per-scrobble ignore reason

**Ignored message codes** (identical on both the method page and the scrobbling guide):
`0` None (passed all filters) · `1` Filtered artist · `2` Filtered track ·
`3` Timestamp too far in the past · `4` Timestamp too far in the future ·
`5` Max daily scrobbles exceeded. *"We may add additional ignored codes in the future."*

> **Casing inconsistency:** the method page's sample uses camelCase `ignoredMessage` and
> `albumArtist`; the scrobbling guide's samples use lowercase `ignoredmessage` and `albumartist`.
> Parse case-insensitively. `accepted`/`ignored` are lowercase on both.

**Filtering is not an error:** a filtered scrobble still returns `status="ok"`. In a batch, *"each
scrobble is filtered separately"* — one bad scrobble does not invalidate the rest.

**Corrections:** returned with `corrected="1"` and the corrected value as the element text. Docs say
these may optionally be surfaced to the user as suggested ID3 fixes but *"should not be applied
automatically. Most clients will simply ignore corrections."*

### 3.3 `track.updateNowPlaying`

Source: [track.updateNowPlaying](https://www.last.fm/api/show/track.updateNowPlaying).

**HTTP:** `POST`, form-urlencoded, UTF-8, parameters in the body. Authentication **required**.
*"This is a write service and must be accessed with an HTTP POST request."*

| Param | Required | Meaning |
|---|---|---|
| `artist` | **yes** | The artist name |
| `track` | **yes** | The track name |
| `album` | no | The album name |
| `trackNumber` | no | Track number on the album |
| `context` | no | Sub-client version (not public, only enabled for certain API keys) |
| `mbid` | no | The MusicBrainz Track ID |
| `duration` | no | Length of the track in seconds |
| `albumArtist` | no | Album artist, if it differs from the track artist |
| `api_key` | **yes** | A Last.fm API key |
| `api_sig` | **yes** | Signature |
| `sk` | **yes** | Session key |

Note there is **no `timestamp`** — Now Playing is inherently "now". There is also no array notation.

**When to call it:** *"Requests should be sent as soon as a user starts listening to a track."* The
call is **optional but recommended** for scrobbling clients. It does not affect charts; it features
the current track on the profile along with the player name.

**Failure handling:** *"Now Playing requests that fail should not be retried."*

Response:

```xml
<lfm status="ok">
  <nowplaying>
    <track corrected="0">Test Track</track>
    <artist corrected="0">Test Artist</artist>
    <album corrected="0"></album>
    <albumArtist corrected="0"></albumArtist>
    <ignoredMessage code="0"></ignoredMessage>
  </nowplaying>
</lfm>
```

Same `code` (1–5) and `corrected` semantics as scrobbles.

### 3.4 Error handling and retry policy for writes

Source: [Scrobbling 2.0 §Error handling](https://www.last.fm/api/scrobbling).

Check **both** the HTTP status **and** the body: *"No matter what the HTTP status code is, you must
inspect the content of the response… a HTTP status of 200 OK does not mean the request was
successful."* Log failed requests with headers and body.

| Error | Action |
|---|---|
| `11` Service Offline | **Retry** |
| `16` Service temporarily unavailable | **Retry** |
| `9` Invalid session key | **Re-authenticate** for a new session key, then retry |
| all others | Request was malformed — **do not retry** |

**Offline cache:** keep unsubmitted scrobbles in a local cache that **survives client restarts**.
Send in order, oldest first, in batches of up to 50.

### 3.5 `track.love` / `track.unlove`

Sources: [track.love](https://www.last.fm/api/show/track.love),
[track.unlove](https://www.last.fm/api/show/track.unlove).

**HTTP:** `POST`, form-urlencoded, parameters in the body. Authentication **required** (signed).

| Param | Required | Meaning |
|---|---|---|
| `artist` | **yes** | The artist name |
| `track` | **yes** | The track name |
| `api_key` | **yes** | A Last.fm API key |
| `api_sig` | **yes** | Signature |
| `sk` | **yes** | Session key |

Two methods rather than one with a flag, and **neither is a toggle**: loving an already-loved track
and unloving a track that was never loved are both accepted. A retry therefore cannot corrupt the
account's state, which is what makes these safe to send without reading the current state first.
There is **no `timestamp`** — a love is a statement about the track, not about a play, so it does not
appear in the recent-tracks feed or affect charts.

Both answer with an empty body (`<lfm status="ok">`), so the only usable signal is the `error` field
described in §5.2. Failures are not retried on a backoff the way scrobbles are: the action is
repeatable and the user's next attempt performs it again.

---

## 4. Reading user data

All four methods below are **`api_key`-only — no session and no `api_sig` required**; each page
states *"This service does not require authentication."* They are `GET` requests.

### 4.1 `user.getRecentTracks`

Source: [user.getRecentTracks](https://www.last.fm/api/show/user.getRecentTracks).

| Param | Required | Meaning |
|---|---|---|
| `user` | **yes** | Last.fm username |
| `limit` | no | Results per page. **Default 50, maximum 200** |
| `page` | no | Page number, defaults to first page |
| `from` | no | UNIX timestamp (UTC) — only scrobbles after this time |
| `to` | no | UNIX timestamp (UTC) — only scrobbles before this time |
| `extended` | no | `0\|1` — extended artist data and whether the user has loved each track |
| `api_key` | **yes** | API key |

Includes the currently-playing track with `nowplaying="true"` when applicable.

Sample response (trimmed):

```xml
<recenttracks user="RJ" page="1" perPage="10" totalPages="3019">
  <track nowplaying="true">
    <artist mbid="2f9ecbed-27be-40e6-abca-6de49d50299e">Aretha Franklin</artist>
    <name>Sisters Are Doing It For Themselves</name>
    <mbid/>
    <album mbid=""/>
    <url>www.last.fm/music/Aretha+Franklin/_/Sisters+Are+Doing+It+For+Themselves</url>
    <date uts="1213031819">9 Jun 2008, 17:16</date>
    <streamable>1</streamable>
  </track>
</recenttracks>
```

UI-relevant fields: container attrs `user`, `page`, `perPage`, `totalPages`; per track
`nowplaying` (attr, present only when playing), `artist` (+ `mbid` attr), `name`, `mbid`,
`album` (+ `mbid` attr), `url`, `date` (+ `uts` attr), `streamable`.
In JSON, container attributes appear under `@attr` — see the caveat in §4.5.

### 4.2 `user.getTopArtists`

Source: [user.getTopArtists](https://www.last.fm/api/show/user.getTopArtists).

| Param | Required | Meaning |
|---|---|---|
| `user` | **yes** | Username to fetch top artists for |
| `period` | no | `overall \| 7day \| 1month \| 3month \| 6month \| 12month`. Defaults to `overall` |
| `limit` | no | Results per page. **Defaults to 50** |
| `page` | no | Page number |
| `api_key` | **yes** | API key |

No maximum `limit` is documented for this method (unlike `getRecentTracks`).

```xml
<topartists user="RJ" type="overall">
  <artist rank="1">
    <name>Dream Theater</name>
    <playcount>1337</playcount>
    <mbid>28503ab7-8bf2-4666-a7bd-2644bfc7cb1d</mbid>
    <url>http://www.last.fm/music/Dream+Theater</url>
    <streamable>1</streamable>
    <image size="small">...</image>
    <image size="medium">...</image>
    <image size="large">...</image>
  </artist>
</topartists>
```

### 4.3 `user.getTopTracks`

Source: [user.getTopTracks](https://www.last.fm/api/show/user.getTopTracks). Identical parameter set
to `user.getTopArtists` (`user` required; `period`, `limit`, `page`, `api_key`).

```xml
<toptracks user="RJ" type="overall">
  <track rank="1">
    <name>Learning to Live</name>
    <playcount>42</playcount>
    <mbid/>
    <url>http://www.last.fm/music/Dream+Theater/_/Learning+to+Live</url>
    <streamable fulltrack="0">1</streamable>
    <artist>
      <name>Dream Theater</name>
      <mbid>28503ab7-8bf2-4666-a7bd-2644bfc7cb1d</mbid>
      <url>http://www.last.fm/music/Dream+Theater</url>
    </artist>
    <image size="small">...</image>
    <image size="medium">...</image>
    <image size="large">...</image>
  </track>
</toptracks>
```

### 4.4 `user.getInfo`

Source: [user.getInfo](https://www.last.fm/api/show/user.getInfo).

| Param | Required | Meaning |
|---|---|---|
| `user` | no | User to fetch info for. **Defaults to the authenticated user** |
| `api_key` | **yes** | API key |

Note the oddity: `user` is optional, yet the method requires **no** authentication — so omitting it
without a session has no defined subject. Always pass `user` explicitly.

```xml
<user>
  <id>1000002</id>
  <name>RJ</name>
  <realname>Richard Jones </realname>
  <url>http://www.last.fm/user/RJ</url>
  <image>http://userserve-ak.last.fm/serve/126/8270359.jpg</image>
  <country>UK</country>
  <age>27</age>
  <gender>m</gender>
  <subscriber>1</subscriber>
  <playcount>54189</playcount>
  <playlists>4</playlists>
  <bootstrap>0</bootstrap>
  <registered unixtime="1037793040">2002-11-20 11:50</registered>
</user>
```

### 4.5 Image sizes and JSON shape — documented limits

- **Image sizes:** the only sizes appearing anywhere in the fetched docs are **`small`, `medium`,
  `large`**. The commonly used `extralarge` and `mega` sizes are **NOT DOCUMENTED** on these pages.
  Do not depend on them without verifying against a live response.
- **`@attr`:** the string `@attr` **never appears** in the Last.fm docs. The REST page documents the
  general rule (*"Attributes are expressed as string member values with the attribute name as key"*),
  which implies container attributes like `page`/`perPage`/`totalPages`/`nowplaying` land under
  `@attr` in JSON, but that specific key is **not documented** — verify empirically.
- **`nowplaying`** is an attribute, not an element, and is **absent** (not `"false"`) on
  non-now-playing tracks. In JSON it appears as the string `"true"` under `@attr`.
- All JSON scalar values are **strings**, including `playcount`, `uts`, `subscriber`.

### 4.6 `user.getLovedTracks`

Source: [user.getLovedTracks](https://www.last.fm/api/show/user.getLovedTracks).

**HTTP:** `GET`, `api_key`-only — no session and no `api_sig`.

| Param | Required | Meaning |
|---|---|---|
| `user` | **yes** | The username |
| `limit` | no | Number of results per page. Default **50** |
| `page` | no | The page number |

Same envelope as the other list methods, wrapped in `lovedtracks`:

```xml
<lovedtracks user="RJ" page="1" perPage="50" totalPages="3" total="120">
  <track>
    <artist><name>...</name><mbid>...</mbid><url>...</url></artist>
    <date uts="1234567890">...</date>
    <name>...</name>
    <streamable fulltrack="0">0</streamable>
    <mbid>...</mbid>
    <url>...</url>
    <image size="small">...</image>
  </track>
</lovedtracks>
```

Two shape traps, both shared with the other list methods: `track` is an **object rather than an
array** when there is exactly one loved track, and every scalar (including `uts` and `total`) arrives
as a **string**. The list carries **no platform identifier** — an artist and a title is all it is — so
it cannot be played without first finding the track on a platform.

---

## 5. Rate limits and error codes

### 5.1 Rate limits

**There is no documented numeric rate limit.** Specifically:

- [Error Codes](https://www.last.fm/api/errorcodes): `29 : Rate Limit Exceded [sic] - Your IP has
  made too many requests in a short period, exceeding our API guidelines`. The "guidelines" are not
  linked or quantified.
- [Intro](https://www.last.fm/api/intro): *"Be reasonable in your usage of the API and ensure you
  don't make an excessive number of calls… Your account may be suspended if your application is
  continuously making several calls per second or if you're making excessive calls."* The only
  concrete number anywhere is the phrase **"several calls per second"** as a suspension trigger.
- [API ToS](https://www.last.fm/api/tos), Rate Limit clause: *"Last.fm sets and enforces limits on
  use of the API to prevent abuse and ensure reliability of service (e.g. limiting the number of API
  requests that you may make or the number of users you may serve), in our sole discretion."*
  Exceeding them requires express consent via `partners@last.fm`.

**Documented backoff guidance:**
- Retry only errors `11` and `16`; on `9`, re-authenticate first. All other write errors are
  permanent. ([Scrobbling 2.0](https://www.last.fm/api/scrobbling))
- Do not retry failed Now Playing requests.
- Keep a restart-surviving local scrobble cache and flush in order.
- For reads, the Intro advises not hitting the API on page load and using an identifiable
  `User-Agent`.

No exponential-backoff algorithm, no `Retry-After` contract, and no per-endpoint quota is
documented. (A `Retry-After: 0` header was observed on a live 406 from the *website* front end, not
from the API host — it is not a documented API behavior.)

### 5.2 Error codes

Source: [Error Codes](https://www.last.fm/api/errorcodes) — the authoritative list.

| Code | Meaning |
|---|---|
| 1 | This error does not exist |
| 2 | Invalid service — this service does not exist |
| 3 | Invalid Method — no method with that name in this package |
| 4 | Authentication Failed — you do not have permissions to access the service |
| 5 | Invalid format — this service doesn't exist in that format |
| 6 | Invalid parameters — your request is missing a required parameter |
| 7 | Invalid resource specified |
| 8 | Operation failed — most likely the backend service failed. Please try again. |
| 9 | Invalid session key — please re-authenticate |
| 10 | Invalid API key — you must be granted a valid key by last.fm |
| 11 | Service Offline — this service is temporarily offline. Try again later. |
| 12 | Subscribers Only — this station is only available to paid last.fm subscribers |
| 13 | Invalid method signature supplied |
| 14 | Unauthorized Token — this token has not been authorized |
| 15 | This item is not available for streaming. |
| 16 | The service is temporarily unavailable, please try again. |
| 17 | Login: User requires to be logged in |
| 18 | Trial Expired — this user has no free radio plays left. Subscription required. |
| 19 | This error does not exist |
| 20 | Not Enough Content — there is not enough content to play this station |
| 21 | Not Enough Members — this group does not have enough members for radio |
| 22 | Not Enough Fans — this artist does not have enough fans for radio |
| 23 | Not Enough Neighbours — there are not enough neighbours for radio |
| 24 | No Peak Radio — this user is not allowed to listen to radio during peak usage |
| 25 | Radio Not Found — radio station not found |
| 26 | API Key Suspended — this application is not allowed to make requests to the web services |
| 27 | Deprecated — this type of request is no longer supported |
| 29 | Rate Limit Exceded — your IP has made too many requests in a short period |

Codes **28** and **30+** are absent from the list.

**Per-method pages add or contradict these.** Where they differ:

| Code | Method-page wording | Conflict |
|---|---|---|
| 4 | `auth.getSession`: "Invalid authentication token supplied" | vs. "Authentication Failed" |
| 8 | `auth.getToken`: "There was an error granting the request token. Please try again later" | vs. "Operation failed"; also listed twice on that page |
| 15 | `auth.getSession`: "**This token has expired**" | vs. "This item is not available for streaming." on the canonical list |
| 26 | Method pages: "Suspended API key — access for your account has been suspended" | vs. "API Key Suspended — this application is not allowed…" |

Code `15` is the one that matters for this integration: `auth.getSession` treats it as an **expired
auth token**, while the global list describes a streaming restriction. Handle it as expired-token in
the auth flow. **15 is not listed on `auth.getToken`'s page.**

Every method page repeats the same tail of codes 2–11, 13, 16, 26, 29 regardless of relevance, so
treat method-page error lists as boilerplate rather than method-specific truth.

---

## 6. CORS — can a browser/WebView call the API directly?

**The docs never mention CORS, `Origin`, or `Access-Control-*` anywhere.** There is no documented
policy. However, the API host **does** send permissive CORS headers — verified live on 2026-09-28:

`OPTIONS https://ws.audioscrobbler.com/2.0/` with `Origin: http://localhost:1420` and
`Access-Control-Request-Method: POST` returned:

```
HTTP/1.1 200 OK
access-control-allow-methods: POST, GET, OPTIONS
access-control-allow-origin: *
access-control-max-age: 86400
access-control-allow-headers: content-type
```

A `GET` with an `Origin` header returned the same `access-control-allow-origin: *` alongside the
API response.

**Practical reading:**
- A browser or WebView **can** call the API cross-origin today, including `POST` with
  `content-type: application/x-www-form-urlencoded`, without a preflight-blocking issue.
- These headers are **undocumented and unguaranteed** — Last.fm could change them without notice.
- **Architectural caveat, independent of CORS:** the `api_sig` scheme requires the **shared secret**
  in the client. Any secret shipped to a browser/WebView is extractable. For a desktop app, keep
  request construction (and therefore the secret) in the native Rust/Tauri layer and expose a narrow
  IPC surface to the webview. The same applies to the session key.
- The auth page at `www.last.fm/api/auth` is a normal web page and is opened in the user's system
  browser, so it is not subject to your WebView's CORS policy.

---

## 7. Gaps — things the docs do not state

Listed explicitly so they are not mistaken for verified facts:

1. No numeric rate limit, quota, or `Retry-After` contract.
2. No documented backoff algorithm.
3. No CORS policy (headers observed, but undocumented).
4. No explicit statement that HTTPS is supported for the API root — only `http://` is printed.
5. No documented `extralarge`/`mega` image sizes, and no `@attr` key in JSON.
6. No documented polling loop for the desktop auth flow (error 14 implies the mechanism).
7. No documented maximum `limit` for `user.getTopArtists` / `user.getTopTracks` (only for
   `getRecentTracks`: 200).
8. No documented `format=json` sample for the scrobble/now-playing responses — only XML is shown.
9. No documented behavior for `user.getInfo` when `user` is omitted and no session is supplied.
10. The desktop how-to's instruction to configure a callback URL is inconsistent with its own flow,
    which never uses one.
