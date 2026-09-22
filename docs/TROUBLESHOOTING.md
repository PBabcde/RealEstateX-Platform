# Troubleshooting

## API does not start

- Confirm `PORT` is set to a valid positive number.
- Check the process log for a missing dependency or invalid build artifact.
- Run `pnpm --filter @workspace/api-server run build`.

## Health endpoint fails

```bash
curl -i http://127.0.0.1:8080/api/healthz
```

If the process is running but the endpoint fails, inspect reverse-proxy
forwarding and confirm that `/api` is not being stripped incorrectly.

## Browser reports a CORS error

Set `CORS_ORIGINS` to the exact origin, including scheme and port when
applicable. Separate origins must be comma-separated. Same-origin requests do
not need a CORS entry.

## Data is missing

Check the API working directory and the `storage/realestateX` path. Do not
delete or recreate files. Stop the process, copy the directory, inspect JSON,
and restore the latest verified backup if required.

## Storage JSON is invalid

The API now fails closed instead of silently replacing malformed JSON. Restore
the affected file from a verified backup, validate it, then restart the API.

## Frontend is blank

- Check that the web workflow is running.
- Check the browser console for a failed API request.
- Check that `/api` is forwarded to the API service.
- Confirm the SPA fallback serves `index.html` for `/suite`,
  `/properties`, `/calculators`, and `/market`.

## Phase 2 module is marked online but unavailable

The Suite registry is currently a connected-module overview. Most Phase 2
domain services and routers exist in the Python reference layer but are not
yet mounted in the active Express API. Treat that as an implementation gap,
not a transient health issue.