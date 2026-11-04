# AI transport and forward-evidence repair — 4 November 2026

Production diagnostics showed HTTP 429 cooldowns on both external AI services and no qualified models. This change repairs client behavior; it does not establish the upstream cause of throttling or improve measured predictive accuracy by itself.

- Inference, readiness and warmup share a per-origin cooldown through process-global state. Retry-After supports seconds and HTTP dates and is never shortened to five minutes. Repeated throttling increases the fallback interval up to 15 minutes. A late successful response cannot clear a still-active cooldown. Separate processes/instances still have separate budgets.
- ML concurrent requests only share a result for identical, valid, closed-candle inputs. Inputs are copied before asynchronous inference. Corrections to an earlier candle cannot inherit another in-flight result.
- Neural operator disable takes precedence over an already-running request for new callers. Health summaries preserve transport errors rather than overwriting them with absent prediction fields.
- Forward outcomes reject observations at/before prediction creation. Prices arriving after expiry cannot inflate favorable/adverse excursion statistics. Existing history is not retroactively rewritten.

Validation: transport integration regression, warmup, readiness, ML data quality, neural opt-out, forward cooldown/time-order regression and model certification tests; TypeScript no-emit check. Production recovery must be verified separately after deployment. No model qualification threshold, execution permission or trading rule was relaxed.
