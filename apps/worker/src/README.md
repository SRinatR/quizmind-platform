# Worker scope

This worker app will run:

- billing webhook processing;
- email and notification jobs;
- queue processing status tracking in domain events (including email delivery outcomes);
- quota resets and entitlement refreshes;
- remote config propagation;
- audit/log export pipelines.
