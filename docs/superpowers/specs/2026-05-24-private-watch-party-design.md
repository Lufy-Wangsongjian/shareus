# Private Watch Party Design

## Goal

Build a private web app for two people to watch uploaded local movie files together. The first version prioritizes low operational complexity, Google Cloud deployment, manual video maintenance, and reliable synchronized playback over public sharing or large-scale usage.

## Confirmed Scope

The app is a responsive web application, optimized for desktop browsers and usable on mobile browsers. It does not include user registration or social login. An administrator uses a shared admin password to access management actions. Guests enter rooms through invite links and room passwords.

The first version supports local video files uploaded manually through the Google Cloud Console into a private Google Cloud Storage bucket. The supported source formats are `mp4`, `mov`, and `mkv`. The application does not upload files from the browser in the first version.

The app supports:

- Importing a manually uploaded GCS object path into the app.
- Starting a transcode job for imported videos.
- Listing videos and their processing status.
- Manually deleting videos when the administrator chooses.
- Creating private two-person watch rooms from ready videos.
- Joining rooms by invite link and room password.
- Playing HLS video in desktop and mobile browsers.
- Synchronizing play, pause, seek, and periodic playback position between two viewers.
- Simple in-room text chat.

The app explicitly does not support:

- Downloading, parsing, proxying, or re-streaming third-party video websites.
- Public video search.
- Browser-based large file upload.
- Accounts, billing, public rooms, or large-room moderation.
- Automatic expiration or deletion of videos.

## Product Model

### Administrator

The administrator enters an admin password on the management page. After successful verification, the frontend receives a short-lived admin session token. The token authorizes importing GCS paths, starting transcodes, creating rooms, closing rooms, and deleting video records and generated HLS assets.

The administrator manually uploads source files to GCS under `uploads/` using the Google Cloud Console. In the app, they paste or select the uploaded object path, create a video record, and start transcoding.

### Guest

A guest opens a room invite link, enters the room password, and joins the watch room. The room is designed for two active viewers. Either viewer can control playback unless a later version adds host-only controls.

### Manual Deletion

Videos remain available until the administrator deletes them. In the first version, application deletion removes video metadata and generated HLS output. The original source object under `uploads/` is deleted manually in the GCS console, matching the manual maintenance model and avoiding accidental source loss.

## Architecture

### Frontend

Use Next.js with TypeScript and Tailwind CSS. The frontend contains:

- Admin login page.
- Admin video library page.
- Video import/transcode status view.
- Room creation controls.
- Watch room page.

Playback uses the native `video` element. Safari can play HLS natively. Other modern browsers use `hls.js`.

The layout is responsive:

- Desktop: video as the primary area, with room state and chat beside it.
- Mobile portrait: video at the top, controls/status/chat below it.
- Mobile landscape: prioritize the video area and fullscreen behavior.

### API Service

Use a lightweight TypeScript backend, preferably Fastify, deployed to Cloud Run. The API handles:

- Admin password verification.
- Short-lived admin token issuance and verification.
- Room password hashing and verification.
- Video metadata CRUD.
- Playback playlist generation that rewrites HLS segment references to short-lived GCS signed URLs.
- Cloud Run Job invocation for transcoding.
- Socket.IO real-time room synchronization and chat.

The admin password is stored in Google Secret Manager or injected as a Cloud Run environment variable. Room passwords are stored only as hashes.

### Storage

Use one private Google Cloud Storage bucket.

Recommended object layout:

- `uploads/{filename}` for manually uploaded source videos.
- `videos/{videoId}/hls/` for generated HLS playlists and media segments.

The bucket is not public. For playback, the frontend requests the HLS playlist through the API after joining a room. The API validates the room session, reads the stored playlist, rewrites segment references to short-lived GCS signed URLs, and returns the rewritten playlist. Segment files are then downloaded directly from GCS through those signed URLs.

### Database

Use Firestore for metadata and room state.

Collections:

- `videos`: source object path, status, title, optional `durationSec` from `ffprobe`, HLS prefix, timestamps, and failure message.
- `rooms`: room password hash, video id, status, current playback state, timestamps.
- `roomMessages`: chat messages scoped by room id.

### Transcoding

Use Cloud Run Jobs with `ffmpeg`. The API starts a job after the admin imports a source object path and requests transcoding.

The job:

1. Downloads or streams the source object from GCS.
2. Converts the file to HLS output.
3. Uploads the HLS playlist and segments to `videos/{videoId}/hls/`.
4. Updates the video status in Firestore to `ready` or `failed`.

Initial HLS output can use one rendition to keep the MVP simple. Adaptive bitrate ladders can be added later.

Video statuses:

- `imported`: metadata exists, source file is known.
- `processing`: transcode job has started.
- `ready`: HLS output is available for playback.
- `failed`: transcode failed, with a stored error summary.
- `deleted`: metadata is retained only if needed for audit; otherwise records can be removed.

## Playback Synchronization

The server is the authority for room playback state:

```json
{
  "videoId": "video_123",
  "isPlaying": true,
  "positionSec": 583.2,
  "updatedAt": "2026-05-24T12:00:00.000Z",
  "updatedBy": "socket_id"
}
```

Clients emit events when a viewer plays, pauses, or seeks. The server validates room membership, updates authoritative state, and broadcasts the event to the other viewer.

When a client receives a remote state:

- If paused, set the local player near `positionSec`.
- If playing, compute `positionSec + elapsedTimeSinceUpdatedAt` and seek if drift is above a small threshold.
- Avoid aggressive seeking for tiny drift so playback does not feel jittery.

Clients send periodic sync pings every 5-10 seconds while connected. On reconnect, the client requests the current authoritative state and resynchronizes.

Mobile browsers can suspend sockets in the background, so reconnect and state recovery are required.

## Security

The MVP is private but should still avoid obvious leaks:

- Admin password never ships to the frontend.
- Admin requests require a short-lived token.
- Room passwords are hashed before storage.
- GCS bucket is private.
- HLS access is granted through short-lived signed access.
- The API checks video readiness before creating playable rooms.
- Destructive delete actions require admin authorization.

This app is not designed to provide DRM. Anyone who can legitimately watch a video in a browser can potentially capture it. The security goal is private access control, not anti-copy protection.

## Error Handling

Video import validates:

- GCS object path starts with `uploads/`.
- Extension is `mp4`, `mov`, or `mkv`.
- Object exists in the configured bucket.

Transcode failures surface as `failed` status with a concise error summary. The admin can retry transcoding.

Room join failures show clear errors for invalid room links, closed rooms, wrong password, missing video, or unavailable video.

Playback errors distinguish between browser HLS support issues, expired signed URLs, and video assets that are not ready.

Socket disconnects show a reconnecting state. On reconnect, the client fetches room state before resuming sync.

## Testing Strategy

Unit tests cover:

- Password hashing and verification.
- Admin token creation and validation.
- Video object path validation.
- Playback state drift calculation.
- Room state transitions.

Integration tests cover:

- Admin login.
- Importing a valid GCS object path with mocked GCS.
- Starting a mocked transcode job.
- Creating and joining a room.
- Socket.IO play, pause, seek, reconnect, and chat events.

Frontend tests cover:

- Admin page state transitions.
- Room password entry.
- Watch room playback state rendering.
- Mobile-friendly layout behavior where practical.

Manual acceptance tests cover:

- Upload a sample video to GCS console.
- Import it in the app.
- Transcode it.
- Create a room.
- Join from two browser sessions.
- Verify play, pause, seek, reconnect, and chat.
- Delete the video and confirm the room can no longer play it.

## Deployment

Deploy to Google Cloud:

- Cloud Run service for the web/API app.
- Cloud Run Job for ffmpeg transcoding.
- Firestore in Native mode.
- Private GCS bucket for source and HLS assets.
- Secret Manager or Cloud Run environment variables for admin password and token secret.

The first deployment can run frontend and API in one service to reduce setup. If needed later, split frontend hosting from the API/socket service.

## Future Extensions

Later versions can add:

- Browser direct upload with signed URLs.
- Google login for administrator access.
- Host-only playback controls.
- Multiple friends per room.
- Automatic video cleanup policies.
- Adaptive bitrate HLS.
- Subtitles.
- Watch history.
- Better library metadata and poster images.
