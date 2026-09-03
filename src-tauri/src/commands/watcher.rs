use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;
use crate::utils::{normalize_path, paths_match};
use crate::watcher::{FileWatcherState, WatcherContext};

#[tauri::command]
pub fn watch_active_files(
    paths: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<FileWatcherState>,
) -> Result<(), String> {
    let mut ctx_lock = state.context.lock().map_err(|e| e.to_string())?;

    // 監視対象のPathBufリストを生成（正規化）
    let new_active_paths: HashSet<PathBuf> = paths
        .into_iter()
        .filter(|p| !p.trim().is_empty())
        .map(|p| normalize_path(Path::new(&p)))
        .collect();

    // 必要な親ディレクトリの集合（アトミック保存対応）
    let mut new_dirs: HashSet<PathBuf> = HashSet::new();
    for p in &new_active_paths {
        if let Some(parent) = p.parent() {
            if parent.exists() && parent.is_dir() {
                new_dirs.insert(normalize_path(parent));
            }
        }
    }

    if ctx_lock.is_none() {
        let active_paths_arc = Arc::new(Mutex::new(new_active_paths.clone()));
        let last_emitted_arc = Arc::new(Mutex::new(HashMap::new()));

        let active_paths_cb = active_paths_arc.clone();
        let last_emitted_cb = last_emitted_arc.clone();
        let app_handle = app.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    match event.kind {
                        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Any => {
                            let targets = match active_paths_cb.lock() {
                                Ok(t) => t.clone(),
                                Err(_) => return,
                            };
                            let mut last_emit = match last_emitted_cb.lock() {
                                Ok(l) => l,
                                Err(_) => return,
                            };
                            let now = Instant::now();

                            for event_path in &event.paths {
                                let norm_event_path = normalize_path(event_path);
                                for target in &targets {
                                    if paths_match(target, &norm_event_path) {
                                        let should_emit = match last_emit.get(target) {
                                            Some(&prev) => now.duration_since(prev) > std::time::Duration::from_millis(150),
                                            None => true,
                                        };
                                        if should_emit {
                                            last_emit.insert(target.clone(), now);
                                            let target_str = target.to_string_lossy().to_string();
                                            let _ = app_handle.emit("active-file-changed", target_str);
                                        }
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| e.to_string())?;

        for dir in &new_dirs {
            let _ = watcher.watch(dir, RecursiveMode::NonRecursive);
        }

        *ctx_lock = Some(WatcherContext {
            active_paths: active_paths_arc,
            watched_dirs: new_dirs,
            watcher,
        });
    } else if let Some(ref mut ctx) = *ctx_lock {
        // active_paths を更新
        if let Ok(mut paths_guard) = ctx.active_paths.lock() {
            *paths_guard = new_active_paths;
        }

        // 不要になった親ディレクトリの監視解除
        for old_dir in &ctx.watched_dirs {
            if !new_dirs.contains(old_dir) {
                let _ = ctx.watcher.unwatch(old_dir);
            }
        }

        // 新規親ディレクトリの監視登録
        for new_dir in &new_dirs {
            if !ctx.watched_dirs.contains(new_dir) {
                let _ = ctx.watcher.watch(new_dir, RecursiveMode::NonRecursive);
            }
        }

        ctx.watched_dirs = new_dirs;
    }

    Ok(())
}
