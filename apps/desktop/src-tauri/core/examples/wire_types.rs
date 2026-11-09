//! Prints the generated TypeScript module; `just types` redirects it.

fn main() {
    print!("{}", rollin_desktop_core::wire::typescript());
}
