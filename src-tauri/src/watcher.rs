use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use notify::RecommendedWatcher;

pub struct WatcherContext {
    pub active_paths: Arc<Mutex<HashSet<PathBuf>>>,
    pub watched_dirs: HashSet<PathBuf>,
    pub watcher: RecommendedWatcher,
}

pub struct FileWatcherState {
    pub context: Arc<Mutex<Option<WatcherContext>>>,
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self {
            context: Arc::new(Mutex::new(None)),
        }
    }
}
