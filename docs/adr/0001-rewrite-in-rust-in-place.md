# Rewrite v2 in Rust, replacing the Python code in place

v2 is a Rust rewrite for speed and low resource use. The Python v1 is tagged `v1.0` and removed from `main`, rather than kept in a subdirectory or a new repo, because v1 is small (about 250 lines of logic), has one user, and keeping two implementations would double CI for no benefit. The Python tests serve as the behavior spec for the port.
