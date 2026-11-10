-- Audit finding #6: sync_trip_data() had no server-side validation on
-- expenses.amount, so a client (or anyone calling the RPC directly via
-- devtools) could push a zero/negative amount. The client-side guards in
-- saveReceiptExp/saveMenuExp were also found to accept negative totals
-- (fixed separately in public/index.html: `if(!total)` -> `if(!total||total<=0)`,
-- since `!(-50)` is false in JS). A negative expense corrupts every
-- participant's balance (acts as a phantom credit).
--
-- Fix: a table-level CHECK constraint. This protects every write path
-- (sync_trip_data RPC now and any future code), not just one function.
-- Verified against production first: 0 of 85 existing expense rows violate
-- amount>0, so this migration is safe to apply immediately.

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0);
