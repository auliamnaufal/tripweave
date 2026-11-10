-- The full priced catalog a plan was chosen from, and the deal-hunt inputs
-- (comparisons, market benchmarks, sources). Swapping one item for another
-- option then rebuilds the plan from this snapshot instantly, at the same
-- searched prices, instead of searching every platform again.
alter table plan_quotes add column if not exists catalog jsonb;
alter table plan_quotes add column if not exists insights jsonb;
