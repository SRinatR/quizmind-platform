# Remote Config Flow

The repo now includes a first pass at the remote-config publish workflow.

## API layer

- `previewRemoteConfig` resolves layered config for an arbitrary context before publication.
- `publishRemoteConfigVersion` returns a publish result plus an audit log event describing who published what.

## Worker layer

- `propagateRemoteConfigPublish` represents the asynchronous side of publication, where a worker would fan out the new config version and emit a domain log event.

## Intended future path

1. save draft layers in PostgreSQL;
2. preview the merged result for one or more contexts;
3. publish a version and write audit logs;
4. propagate it through a worker queue;
5. let extension bootstrap endpoints consume the active version.
