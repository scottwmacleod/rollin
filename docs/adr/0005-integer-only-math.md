# Integer-only math and integer-only variables

All arithmetic and variables are integers. Division truncates toward zero, and overflow is an error via checked arithmetic. Variables hold numbers only, never dice expressions, which avoids recursion and cycle detection. Floating-point and dice-valued variables were rejected as scope the game systems targeted do not need; revisit only for a concrete use case.
