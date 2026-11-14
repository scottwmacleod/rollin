//! A recording die source: captures every face the engine draws, in draw
//! order, so a roll can be replayed elsewhere without the RNG.
//!
//! The TypeScript port replays these faces through a scripted die source
//! instead of re-implementing ChaCha8 (see `tests/fixtures/parity/README.md`).
//! Recording only observes: the RNG is read exactly as it is without it, so
//! no roll result changes.
//!
//! The record sits beside the evaluator (one note per die, in
//! [`crate::eval`]) rather than inside the RNG, because the engine's public
//! functions take any `impl Rng` and a face is only known once the die's
//! sides are. It is per thread and idle unless a [`Recording`] is live.

use serde::Serialize;
use std::cell::RefCell;

thread_local! {
    static ACTIVE: RefCell<Option<Vec<Draw>>> = const { RefCell::new(None) };
}

/// One die the engine drew: how many sides it asked for, and the face it got
/// (1 to `sides`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Draw {
    pub sides: u32,
    pub face: u32,
}

/// Records the faces drawn on this thread while it is alive. Dropping it
/// without calling [`Recording::finish`] discards what it caught.
///
/// Only one recording per thread can be live at a time.
#[derive(Debug)]
pub struct Recording(());

impl Recording {
    /// Starts recording on this thread.
    ///
    /// # Panics
    ///
    /// If this thread is already recording.
    pub fn start() -> Recording {
        ACTIVE.with(|active| {
            let mut active = active.borrow_mut();
            assert!(active.is_none(), "this thread is already recording");
            *active = Some(Vec::new());
        });
        Recording(())
    }

    /// Stops recording and returns the faces drawn, in draw order.
    pub fn finish(self) -> Vec<Draw> {
        ACTIVE
            .with(|active| active.borrow_mut().take())
            .unwrap_or_default()
    }
}

impl Drop for Recording {
    fn drop(&mut self) {
        ACTIVE.with(|active| active.borrow_mut().take());
    }
}

/// Notes one drawn die if this thread is recording.
pub(crate) fn note(sides: u32, face: u32) {
    ACTIVE.with(|active| {
        if let Some(draws) = active.borrow_mut().as_mut() {
            draws.push(Draw { sides, face });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_faces_in_draw_order_and_stops_when_finished() {
        let recording = Recording::start();
        note(6, 4);
        note(20, 17);
        assert_eq!(
            recording.finish(),
            vec![
                Draw { sides: 6, face: 4 },
                Draw {
                    sides: 20,
                    face: 17
                }
            ]
        );
        note(6, 1);
        assert_eq!(Recording::start().finish(), vec![]);
    }

    #[test]
    fn a_dropped_recording_frees_the_thread() {
        drop(Recording::start());
        Recording::start().finish();
    }
}
