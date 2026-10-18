// 資料のフォルダの監視。外(Claude Code など)が本文や画像を書き換えたら画面に知らせる。
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

use crate::{io_err, parent_dir};

/// 現在開いている資料のウォッチャ。開き直したら差し替える(古いものは drop で止まる)。
pub(crate) struct WatchState(pub(crate) Mutex<Option<RecommendedWatcher>>);

/// 資料のフォルダを監視する。本文が書き換わったら "deck-changed"、
/// 中の画像・ウィジェット(assets/ や widgets/ など)が書き換わったら、そのパスの一覧を付けて "assets-changed" を emit する。
/// 本文のファイルではなくフォルダを見るのは、atomic rename(別名で書いて置き換える)でも拾えるようにするため。
/// .history/(書き換え前の控え)と、書き込み中の一時ファイル(.tmp)は知らせない
#[tauri::command]
pub(crate) fn watch_deck(app: AppHandle, state: State<WatchState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = parent_dir(&target)?.to_path_buf();
    let file_name = target.file_name().ok_or_else(|| io_err(&target, "ファイル名がありません"))?.to_os_string();

    let root = dir.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        if !matches!(ev.kind, EventKind::Modify(_) | EventKind::Create(_)) {
            return;
        }
        let is_deck = |p: &PathBuf| p.parent() == Some(root.as_path()) && p.file_name() == Some(file_name.as_os_str());
        if ev.paths.iter().any(is_deck) {
            #[cfg(debug_assertions)]
            println!("deck-changed: {}", path);
            let _ = app.emit("deck-changed", &path);
        }
        let in_history = |p: &Path| p.strip_prefix(&root).is_ok_and(|rel| rel.components().any(|c| c.as_os_str() == ".history"));
        let assets: Vec<String> = ev
            .paths
            .iter()
            .filter(|p| !is_deck(p) && p.is_file())
            .filter(|p| !p.extension().is_some_and(|e| e == "tmp"))
            .filter(|p| !in_history(p))
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        if !assets.is_empty() {
            let _ = app.emit("assets-changed", assets);
        }
    })
    .map_err(|e| e.to_string())?;
    watcher.watch(&dir, RecursiveMode::Recursive).map_err(|e| io_err(&dir, e))?;

    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}
