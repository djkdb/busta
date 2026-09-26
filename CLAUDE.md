@AGENTS.md

# BUSTA project rules (for AI collaborators)

- Product principle: never fabricate numbers. No invented accuracy/probability; any non-real data must carry a `DataSourceInfo` with `isRealData: false` so the UI shows the 🟡 notice.
- Dates are `YYYY-MM-DD` strings and times are minutes-since-midnight (`lib/utils/time.ts`). Do not use `new Date(dateString)` for calendar math.
- UI depends only on `PredictionEngine` (`lib/prediction/types.ts`); data sources plug in via `lib/data/types.ts`; wiring lives only in `lib/services.ts`.
- Before finishing: `npm test && npm run typecheck && npm run lint && npm run build`.
- Record real prompt iterations in `docs/prompt-log.md` and real failures in `docs/troubleshooting.md` — do not delete past entries.
- Commit messages: conventional (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), one feature per commit.
