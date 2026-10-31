# Hard limits fail loudly instead of truncating

Rich syntax can hang or exhaust memory (`d1!`, `rr` on an always-true condition, huge dice counts). v2 enforces fixed caps: 1,000 dice per term, 100 explosions or rerolls per die, 10,000 dice per expression, nesting depth 32, repeat count 100. Hitting a cap is an error naming the cap and the term, never silent truncation, and obviously infinite cases are rejected at parse time. Silent truncation was rejected because it yields wrong-looking results that players would trust.
