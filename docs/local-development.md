# Local Development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill local values.
3. Run the API with `pnpm --filter @shareus/api dev`.
4. Run the web app with `pnpm --filter @shareus/web dev`.
5. Open `http://localhost:3000`.

For full GCS and Firestore behavior, use a Google Cloud project with Application Default Credentials:

```bash
gcloud auth application-default login
```

Manual video upload:

1. Open Google Cloud Console.
2. Upload `mp4`, `mov`, or `mkv` files to `gs://<bucket>/uploads/`.
3. In the admin page, import the object path such as `uploads/movie.mp4`.

## Smoke Test

- Admin login accepts the configured password.
- Import rejects `videos/movie.mp4`.
- Import accepts `uploads/sample.mp4` when the object exists.
- Transcode changes status to `processing`.
- A ready video can create a room.
- Two browser windows can join the same room.
- Play, pause, seek, and chat appear in the second window.
