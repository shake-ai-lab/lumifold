// Rust 側はファイル・OS・ネットワークだけを担当する。画面の都合(レイアウト・描画)は知らない。
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;

mod package;
mod watch;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;
/// .history/ に残す控えの数(新しい方から)
const HISTORY_KEEP: usize = 30;

/// 失敗したパスを付けたエラー文(画面にそのまま出す)
fn io_err(path: &Path, e: impl std::fmt::Display) -> String {
    format!("{}: {}", path.display(), e)
}

fn parent_dir(path: &Path) -> Result<&Path, String> {
    path.parent().ok_or_else(|| io_err(path, "親ディレクトリがありません"))
}

/// UNIX 時刻(1970-01-01 からの経過)。時計が狂っていても 0 にするだけで止めない
fn since_epoch() -> Duration {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
}

/// 小文字にした拡張子(無ければ空)
fn extension_lower(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default()
}

/// path の後ろに suffix を足したパス(拡張子を置き換えずに `資料.deck.tmp` のようにする)
fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

/// 一時ファイル(`<target>.tmp`)に write で書いてから target に置き換える(途中の状態を読ませない)。失敗したら一時ファイルを消す。
/// Windows では、置き換え先を他のプログラム(ウイルス対策・同期ソフト・開いている PowerPoint など)が開いていると
/// rename が一時的に失敗するので、少し待って何回かやり直す。
/// 一時ファイルの名前は監視が知らせない(.tmp で終わる)
fn replace_via_temp<T>(target: &Path, write: impl FnOnce(&Path) -> Result<T, String>) -> Result<T, String> {
    let tmp = with_suffix(target, ".tmp");
    let value = match write(&tmp) {
        Ok(v) => v,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
    };
    let mut attempt = 0;
    loop {
        match std::fs::rename(&tmp, target) {
            Ok(()) => return Ok(value),
            Err(_) if attempt < 5 => {
                attempt += 1;
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                return Err(io_err(target, e));
            }
        }
    }
}

/// 起動時に開くデッキ。コマンドライン引数 1 つ目、なければ環境変数 DECK_STUDIO_OPEN。
/// `lumifold.exe path\to\資料.deck` や、エクスプローラーの「プログラムから開く」に対応する。
/// 相対パスは絶対パスにして返す(監視は本文のフォルダを見るので、フォルダが分からないと始められない)
#[tauri::command]
fn initial_deck() -> Option<String> {
    std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .filter(|p| matches!(extension_lower(p).as_str(), "json" | "deck"))
        .or_else(|| std::env::var_os("DECK_STUDIO_OPEN").map(PathBuf::from))
        .filter(|p| p.is_file())
        .map(|p| std::path::absolute(&p).unwrap_or(p).to_string_lossy().into_owned())
}

/// テキストファイル(資料の本文・ウィジェットの HTML)を読む
#[tauri::command]
fn read_deck(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| io_err(Path::new(&path), e))
}

/// 資料の本文を書き戻す。一時ファイルに書いてから置き換える
#[tauri::command]
fn write_deck(path: String, text: String) -> Result<(), String> {
    replace_via_temp(Path::new(&path), |tmp| std::fs::write(tmp, text.as_bytes()).map_err(|e| io_err(tmp, e)))
}

/// デッキの assets/ の中で、まだ使われていないファイル名を決める(同名があれば -1, -2 … を付ける)
fn unique_asset_path(deck_dir: &Path, name: &str) -> Result<(PathBuf, String), String> {
    let assets = deck_dir.join("assets");
    std::fs::create_dir_all(&assets).map_err(|e| io_err(&assets, e))?;
    // パス区切りや危険な文字を取り除く
    let clean: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let clean = if clean.is_empty() { "image.png".to_string() } else { clean };
    let p = Path::new(&clean);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("image").to_string();
    let ext = p.extension().and_then(|s| s.to_str()).map(|s| format!(".{}", s)).unwrap_or_default();
    for i in 0..10_000 {
        let file = if i == 0 { format!("{}{}", stem, ext) } else { format!("{}-{}{}", stem, i, ext) };
        let full = assets.join(&file);
        if !full.exists() {
            return Ok((full, format!("assets/{}", file)));
        }
    }
    Err("ファイル名を決められません".into())
}

/// 手元の画像をデッキの assets/ にコピーする。戻り値はデッキからの相対パス
#[tauri::command]
fn import_asset(deck_dir: String, src: String) -> Result<String, String> {
    let src_path = PathBuf::from(&src);
    let name = src_path.file_name().and_then(|s| s.to_str()).unwrap_or("image.png");
    let (dest, rel) = unique_asset_path(Path::new(&deck_dir), name)?;
    std::fs::copy(&src_path, &dest).map_err(|e| io_err(&src_path, e))?;
    Ok(rel)
}

/// 貼り付けた画像(base64)を assets/ に書く。戻り値はデッキからの相対パス
#[tauri::command]
fn write_asset(deck_dir: String, name: String, data_base64: String) -> Result<String, String> {
    let bytes = B64.decode(data_base64.as_bytes()).map_err(|e| e.to_string())?;
    let (dest, rel) = unique_asset_path(Path::new(&deck_dir), &name)?;
    std::fs::write(&dest, bytes).map_err(|e| io_err(&dest, e))?;
    Ok(rel)
}

/// 画像などのバイナリを data URL で返す。WebView からローカルファイルを直接読ませないための窓口。
#[tauri::command]
fn read_asset(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    let bytes = std::fs::read(&path).map_err(|e| io_err(&path, e))?;
    let mime = match extension_lower(&path).as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, B64.encode(bytes)))
}

/// 書き出したファイル(pptx など)を書く。base64 で受け取り、一時ファイルに書いてから置き換える。
#[tauri::command]
fn write_binary(path: String, data_base64: String) -> Result<(), String> {
    let bytes = B64.decode(data_base64.as_bytes()).map_err(|e| e.to_string())?;
    replace_via_temp(Path::new(&path), |tmp| std::fs::write(tmp, &bytes).map_err(|e| io_err(tmp, e)))
}

/// `<stem>-<数字>.json`(backup_deck が書いた控え)か。`x-copy-<数字>.json` など別の資料の控えは含めない
fn is_backup_of(file_name: &str, stem: &str) -> bool {
    file_name
        .strip_prefix(stem)
        .and_then(|rest| rest.strip_prefix('-'))
        .and_then(|rest| rest.strip_suffix(".json"))
        .is_some_and(|millis| !millis.is_empty() && millis.bytes().all(|b| b.is_ascii_digit()))
}

/// 外から書き換えられる直前の本文を、同じフォルダの .history/ に世代として残す(新しい方から HISTORY_KEEP 個)。
/// 監視は .history/ の中の変更を知らせないので、ここへの書き込みでは読み直さない。
#[tauri::command]
fn backup_deck(path: String, text: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    let dir = parent_dir(&target)?.join(".history");
    std::fs::create_dir_all(&dir).map_err(|e| io_err(&dir, e))?;
    let stem = target.file_stem().and_then(|s| s.to_str()).unwrap_or("deck");
    let file = dir.join(format!("{}-{}.json", stem, since_epoch().as_millis()));
    std::fs::write(&file, text.as_bytes()).map_err(|e| io_err(&file, e))?;
    // 古い世代を消す(名前に時刻が入っているので、同じ桁数なら名前順 = 古い順)
    let mut olds: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|e| io_err(&dir, e))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| is_backup_of(n, stem)))
        .collect();
    olds.sort();
    let excess = olds.len().saturating_sub(HISTORY_KEEP);
    for old in olds.into_iter().take(excess) {
        let _ = std::fs::remove_file(old);
    }
    Ok(file.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(watch::WatchState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            initial_deck,
            read_deck,
            write_deck,
            read_asset,
            import_asset,
            write_asset,
            backup_deck,
            write_binary,
            watch::watch_deck,
            package::prepare_deck,
            package::pack_deck
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_names_match_only_this_deck() {
        assert!(is_backup_of("x-1700000000000.json", "x"));
        assert!(!is_backup_of("x-copy-1700000000000.json", "x"));
        assert!(!is_backup_of("x-.json", "x"));
        assert!(!is_backup_of("xy-1700000000000.json", "x"));
        assert!(!is_backup_of("x-1700000000000.json.tmp", "x"));
    }

    #[test]
    fn replace_via_temp_cleans_up_after_a_failed_write() {
        let dir = std::env::temp_dir().join(format!("lumifold-test-replace-{}", since_epoch().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("a.deck");
        replace_via_temp(&target, |tmp| std::fs::write(tmp, "1").map_err(|e| e.to_string())).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "1");
        let failed: Result<(), String> = replace_via_temp(&target, |tmp| {
            std::fs::write(tmp, "2").unwrap();
            Err("書けませんでした".into())
        });
        assert!(failed.is_err());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "1");
        assert!(!with_suffix(&target, ".tmp").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
